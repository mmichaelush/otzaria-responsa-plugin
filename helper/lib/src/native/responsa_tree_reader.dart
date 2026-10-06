import 'dart:ffi';
import 'dart:io' show sleep;
import 'dart:typed_data';
import 'package:responsa_helper/src/log.dart';

import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

import 'package:responsa_helper/src/native/responsa_win32.dart';

/// צומת אחד בעץ הקטלוג של פרויקט השו"ת.
class ResponsaTreeNode {
  final String name;
  final int param;
  final int level;

  /// הנתיב המלא מהשורש, כולל שם הצומת עצמו.
  final String path;

  /// כמה ילדים יש לצומת לפי ה-TreeView. `0` = עלה.
  final int childCount;

  /// לא נפתח, כי פתיחתו הפילה את בר אילן ([ResponsaTreeReader.walk] `skip`).
  /// ילדיו לא נקראו, ו-[ResponsaCatalogBuilder] מחשיב אותו בכל זאת כספר.
  final bool skipped;

  const ResponsaTreeNode({
    required this.name,
    required this.param,
    required this.level,
    required this.path,
    required this.childCount,
    this.skipped = false,
  });
}

/// הסריקה לא הושלמה ולכן אסור שתחליף קטלוג קיים. ההודעה מוצגת למשתמש כמות שהיא.
class ResponsaTreeReadException implements Exception {
  final String message;

  /// `OpenProcess` נכשל: כמעט תמיד בר אילן שרץ כמנהל מערכת.
  final bool accessDenied;

  /// בר אילן יצא (קרס) באמצע הקריאה.
  final bool crashed;

  /// הצומת שבר אילן קרס בזמן שנפתח: אחריו לא נקראה אף שורה. `null` כשאין
  /// ודאות (הקריסה הייתה באמצע קריאה של ילדים, למשל).
  final String? culprit;

  /// הענף העליון שבו הקריאה נכשלה, ממנו ממשיכים.
  final int section;

  /// הצמתים של הענפים שהושלמו לפני [section].
  final List<ResponsaTreeNode> completed;

  const ResponsaTreeReadException(
    this.message, {
    this.accessDenied = false,
    this.crashed = false,
    this.culprit,
    this.section = 0,
    this.completed = const [],
  });

  @override
  String toString() => message;
}

/// המקור היחיד לרשימת הספרים (אין בהתקנה קובץ קריא שמכיל אותה). העץ נטען
/// עצלנית, ו-`RESPONSA.exe` הוא 32-ביט - ראה [ResponsaTreeSession.itemSize32].
class ResponsaTreeReader {
  ResponsaTreeReader._();

  static const int tvFirst = 0x1100;
  static const int tvmExpand = tvFirst + 2;
  static const int tvmGetItemRect = tvFirst + 4;
  static const int tvmGetNextItem = tvFirst + 10;
  static const int tvmEnsureVisible = tvFirst + 20;
  static const int tvmGetItemW = tvFirst + 62;

  static const int tvgnRoot = 0x0000;
  static const int tvgnNext = 0x0001;
  static const int tvgnChild = 0x0004;

  static const int tveCollapse = 0x0001;
  static const int tveExpand = 0x0002;
  static const int tveCollapseReset = 0x8000;

  static const String pathSeparator = ' > ';

  /// זורק כשהודעה לא נענתה: היא נראית כמו "אין עוד ילדים", וסריקה קטועה
  /// הייתה נשמרת כקטלוג שלם ושוברת סימניות. ביטול אינו כשל.
  ///
  /// [descendInto] — האם לקרוא את צאצאי הצומת (לפי ה-`param` שלו). צומת
  /// שאין נכנסים אליו נרשם בכל זאת, עם מספר הילדים שלו. חסר = הכול.
  ///
  /// [patience] — כמה לחכות לבר אילן כשהודעה לא נענתה, לפני שהסריקה נכשלת
  /// (ראו [ResponsaTreeSession.patience]).
  static List<ResponsaTreeNode> walk({
    required int pid,
    required int treeHandle,
    bool Function(int param)? descendInto,
    void Function(int scanned)? onProgress,
    void Function(int done, int total)? onSection,
    bool Function()? shouldStop,
    int progressEvery = 500,
    int maxNodes = 3000000,
    Duration patience = Duration.zero,
    int fromSection = 0,
    Set<String> skip = const {},
    void Function(bool waiting)? onWaiting,
  }) {
    final session = ResponsaTreeSession.open(pid, treeHandle);
    if (session == null) {
      throw const ResponsaTreeReadException(
        'אין גישה לבר אילן, כנראה כי הוא פועל כמנהל מערכת. '
        'יש לסגור אותו ולפתוח אותו שוב כרגיל, לא דרך "הפעל כמנהל".',
        accessDenied: true,
      );
    }
    session
      ..patience = patience
      ..shouldStop = shouldStop
      ..onWaiting = onWaiting;
    final walk = _Walk(
      session: session,
      skip: skip,
      descendInto: descendInto,
      onProgress: onProgress,
      shouldStop: shouldStop,
      progressEvery: progressEvery,
      maxNodes: maxNodes,
    );
    final clock = Stopwatch()..start();
    var section = '';
    var failedSection = fromSection;
    var completedCount = 0;
    int? exitCode;
    var treeGone = false;
    try {
      final sections = [
        for (
          var item = session.root;
          item != 0;
          item = session.nextSibling(item)
        )
          item,
      ];
      logLine(
        'ResponsaTreeReader: ${sections.length} sections'
        '${fromSection > 0 ? ', continuing from ${fromSection + 1}' : ''}'
        '${skip.isEmpty ? '' : ', not opening ${skip.length} (crashed Bar-Ilan before)'}',
      );
      onSection?.call(fromSection, sections.length);
      for (var i = fromSection; i < sections.length; i++) {
        final before = walk.nodes.length;
        failedSection = i;
        completedCount = before;
        final started = clock.elapsed;
        final completed = walk.visit(sections[i], 0, const <String>[]);
        final name = walk.nodes.length > before ? walk.nodes[before].name : '';
        section = '${i + 1}/${sections.length} "$name"';
        // מה שנדרש כדי להבחין בין קריאה איטית לתקועה, ולדעת היכן נעצרה.
        logLine(
          'ResponsaTreeReader: section $section: '
          '${walk.nodes.length - before} rows in '
          '${_seconds(clock.elapsed - started)}'
          '${completed ? '' : ' (stopped)'}',
        );
        if (!completed) break;
        onSection?.call(i + 1, sections.length);
      }
    } finally {
      // לפני `close`: אחריו אין ידית לתהליך.
      if (session.failed) {
        treeGone = !ResponsaWin32.isWindow(treeHandle);
        exitCode = session.exitCode();
        // תהליך שקרס מסיים את היציאה רגע אחרי שחלונותיו נעלמים (ו-WER עשוי
        // להחזיק אותו עוד קצת): בלי ההמתנה הקריסה הייתה מדווחת כ"לא מגיב".
        final clock = Stopwatch()..start();
        while (treeGone && exitCode == null && clock.elapsed < _exitWait) {
          sleep(const Duration(milliseconds: 200));
          exitCode = session.exitCode();
        }
      }
      session.close();
    }
    if (session.failed) {
      final crashed = exitCode != null;
      // אחרי שהצומת נפתח לא נקראה אף שורה: הפתיחה (או הקיפול) שלו הפילה את
      // בר אילן. בר אילן 30 קורס כך בכל פעם באותו ספר (0xC0000409).
      // רק קוד של קריסה (NTSTATUS של שגיאה, 0xC…): בר אילן שהמשתמש סגר יוצא
      // בקוד רגיל, והספר שנפתח באותו רגע אינו אשם.
      final culprit =
          crashed &&
              exitCode >= _crashCodes &&
              exitCode != _hungWindowClosed &&
              walk.expanding == walk.current
          ? walk.expanding
          : null;
      logLine(
        'ResponsaTreeReader: FAILED in section $section after '
        '${walk.nodes.length} rows, ${_seconds(clock.elapsed)}; '
        'last row read: "${walk.current}"; '
        'message not answered: ${session.failedMessage ?? '?'}; '
        'tree window: ${treeGone ? 'gone' : 'exists'}; '
        'Bar-Ilan: ${crashed ? 'exited, code 0x${exitCode.toRadixString(16).toUpperCase()}' : 'running'}'
        '${culprit == null ? '' : '; crashed while opening "$culprit"'}',
      );
      throw ResponsaTreeReadException(
        crashed: crashed,
        culprit: culprit,
        section: failedSection,
        completed: walk.nodes.sublist(0, completedCount),
        crashed
            ? 'בר אילן נסגר באמצע קריאת הרשימה (ייתכן שקרס). פתחו אותו ונסו '
                  'שוב. אם זה חוזר, שלחו דיווח מ"עזרה": הוא יכלול את המקום '
                  'שבו זה קרה.'
            : treeGone
            ? 'החלון "עיון" של בר אילן נסגר באמצע קריאת הרשימה. אין לסגור '
                  'אותו ואין לעבוד בבר אילן עד הסיום. נסו שוב.'
            : 'בר אילן הפסיק להגיב באמצע קריאת הרשימה, ולא חזר להגיב גם '
                  'אחרי כמה דקות. ייתכן שהמחשב נכנס למצב שינה, או שבר אילן היה '
                  'עסוק. סגרו את הספרים הפתוחים בבר אילן, אל תשתמשו בו עד '
                  'הסיום, ונסו שוב.',
      );
    }
    logLine(
      'ResponsaTreeReader: ${walk.nodes.length} rows in '
      '${_seconds(clock.elapsed)}',
    );
    return walk.nodes;
  }

  /// קודי יציאה של קריסה מתחילים כאן (`STATUS_ACCESS_VIOLATION` הוא
  /// 0xC0000005, `STATUS_STACK_BUFFER_OVERRUN` 0xC0000409).
  static const int _crashCodes = 0xC0000000;

  /// "סגור את התוכנית" על חלון של תוכנה שאינה מגיבה: המשתמש סגר, לא קריסה.
  static const int _hungWindowClosed = 0xCFFFFFFF;

  /// כמה לחכות לסיום התהליך אחרי שחלון העץ נעלם.
  static const Duration _exitWait = Duration(seconds: 3);

  static String _seconds(Duration elapsed) =>
      '${(elapsed.inMilliseconds / 1000).toStringAsFixed(1)}s';

  /// מאתר את ה-TreeView של הקטלוג בתוך דיאלוג העיון.
  static int? findCatalogTree(int dialogHandle) {
    for (final child in ResponsaWin32.children(dialogHandle)) {
      if (ResponsaWin32.className(child) == 'SysTreeView32') return child;
    }
    return null;
  }
}

/// גישה ל-TreeView בתהליך של בר אילן. החוצץ בתהליך היעד מוקצה פעם אחת
/// לסשן: סריקה מלאה קוראת מעל מיליון צמתים. משמש גם את עץ המאגרים של
/// החיפוש ([ResponsaSearchScope]).
class ResponsaTreeSession {
  final int treeHandle;
  final HANDLE process;
  final Pointer remoteItem;
  final Pointer remoteText;

  /// האם הודעת קריאה אחת לפחות לא נענתה — חלון תקוע, סגור, או חסום.
  bool failed = false;

  /// כמה לחכות שבר אילן יגיב שוב כשהודעה לא נענתה, ואז לשלוח אותה שוב
  /// (עד [_maxResends] פעמים). אפס — נכשל מיד, כמו בעץ המאגרים של החיפוש.
  /// בקריאת הרשימה: יציאה ממצב שינה, ספר שנטען או חיפוש בבר אילן משביתים
  /// אותו לכמה שניות, והודעה אחת שלא נענתה זרקה סריקה של דקות.
  Duration patience = Duration.zero;

  /// ביטול בזמן ההמתנה לבר אילן.
  bool Function()? shouldStop;

  /// `true` כשמתחילים לחכות לבר אילן שאינו מגיב, `false` כשההמתנה נגמרת.
  void Function(bool waiting)? onWaiting;

  static const int _maxResends = 2;

  /// המתנה לבר אילן הסתיימה בלי תשובה: ממנה והלאה לא מחכים עוד, כדי שקיפול
  /// הענפים אחרי הכשל לא יחכה שוב ושוב.
  bool _gaveUp = false;

  /// ההודעה שלא נענתה, ליומן (`0x1102 TVM_EXPAND`).
  String? failedMessage;

  /// קוד היציאה של בר אילן, או `null` כשהוא עדיין רץ. קריסה נראית מבחוץ כמו
  /// "לא מגיב", ורק הקוד (למשל `0xC0000005`) מבדיל ביניהם.
  int? exitCode() {
    final code = calloc<Uint32>();
    try {
      if (!GetExitCodeProcess(process, code).value) return null;
      return code.value == _stillActive ? null : code.value;
    } finally {
      calloc.free(code);
    }
  }

  static const int _stillActive = 259;

  static const Map<int, String> _messageNames = {
    ResponsaTreeReader.tvmExpand: 'TVM_EXPAND',
    ResponsaTreeReader.tvmGetItemRect: 'TVM_GETITEMRECT',
    ResponsaTreeReader.tvmGetNextItem: 'TVM_GETNEXTITEM',
    ResponsaTreeReader.tvmEnsureVisible: 'TVM_ENSUREVISIBLE',
    ResponsaTreeReader.tvmGetItemW: 'TVM_GETITEMW',
  };

  /// המתנה לפני קיפול ענף שלא נענה: קצרה מ-[patience], כי היא כבר אחרי כשל.
  static const Duration _cleanupPatience = Duration(seconds: 60);

  /// הודעת קריאה. `null` (לא נענתה) נרשם ב-[failed], ומוחזר `0` — מה
  /// שהמתקשר ממילא מפרש כ"אין". [prepare] רץ לפני כל שליחה: הודעה שקוראת
  /// לחוצץ בתהליך היעד כותבת אותו מחדש לפני שליחה חוזרת.
  int _read(
    int message, {
    int wParam = 0,
    int lParam = 0,
    int timeoutMs = 5000,
    void Function()? prepare,
  }) {
    int? attempt() {
      prepare?.call();
      return ResponsaWin32.send(
        treeHandle,
        message,
        wParam: wParam,
        lParam: lParam,
        timeoutMs: timeoutMs,
      );
    }

    var result = attempt();
    // שליחה חוזרת בטוחה: הודעות הקריאה אינן משנות דבר (הרחבה של ענף מורחב
    // אינה עושה כלום), והודעות שנשלחו מאותו חוט מטופלות לפי הסדר — כשבר
    // אילן ענה ל-WM_NULL, ההודעה שלא נענתה כבר טופלה או נזרקה.
    for (
      var resend = 0;
      result == null && resend < _maxResends && _awaitResponsive(patience);
      resend++
    ) {
      logLine(
        'ResponsaTreeSession: message 0x${message.toRadixString(16)} '
        'was not answered; resending',
      );
      result = attempt();
    }
    if (result == null) {
      failed = true;
      failedMessage ??=
          '0x${message.toRadixString(16)} ${_messageNames[message] ?? ''}'
              .trim();
    }
    return result ?? 0;
  }

  /// מחכה עד [limit] שבר אילן יענה. `false` מיד כשהעץ נסגר, בביטול, או
  /// כשהמתנה קודמת כבר נכשלה.
  bool _awaitResponsive(Duration limit) {
    if (limit <= Duration.zero || _gaveUp) return false;
    onWaiting?.call(true);
    try {
      return _waitUntilResponsive(limit);
    } finally {
      onWaiting?.call(false);
    }
  }

  bool _waitUntilResponsive(Duration limit) {
    final clock = Stopwatch()..start();
    while (clock.elapsed < limit) {
      if (!ResponsaWin32.isWindow(treeHandle)) return false;
      if (shouldStop?.call() ?? false) return false;
      // SMTO_ABORTIFHUNG: חלון ש-Windows סימן כתקוע חוזר מיד, ולכן ההשהיה.
      if (ResponsaWin32.responds(treeHandle, timeoutMs: 5000)) {
        logLine(
          'ResponsaTreeSession: Bar-Ilan responds again after '
          '${clock.elapsed.inSeconds}s',
        );
        return true;
      }
      sleep(const Duration(seconds: 1));
    }
    _gaveUp = true;
    logLine(
      'ResponsaTreeSession: Bar-Ilan did not respond for '
      '${limit.inSeconds}s; giving up',
    );
    return false;
  }

  /// `TVITEMW` חייב להיכתב בפריסת 32-ביט של היעד; פריסה שגויה מחזירה טקסט
  /// ריק ו-`lParam` אפס בלי שום שגיאה.
  static const int itemSize32 = 40;

  /// היסטי השדות בפריסת 32-ביט.
  static const int _offMask = 0;
  static const int _offItem = 4;
  static const int _offText = 16;
  static const int _offTextMax = 20;
  static const int _offImage = 24;
  static const int _offChildren = 32;
  static const int _offParam = 36;

  static const int _tvifText = 0x0001;
  static const int _tvifImage = 0x0002;
  static const int _tvifParam = 0x0004;
  static const int _tvifChildren = 0x0040;

  /// כמה תווים להקצות לטקסט של צומת.
  static const int _textChars = 512;

  static const int _processVmOperation = 0x0008;
  static const int _processVmRead = 0x0010;
  static const int _processVmWrite = 0x0020;
  static const int _processQueryInformation = 0x0400;
  static const int _memCommit = 0x1000;
  static const int _memReserve = 0x2000;
  static const int _memRelease = 0x8000;
  static const int _pageReadWrite = 0x04;

  ResponsaTreeSession._({
    required this.treeHandle,
    required this.process,
    required this.remoteItem,
    required this.remoteText,
  });

  static ResponsaTreeSession? open(int pid, int treeHandle) {
    final process = OpenProcess(
      PROCESS_ACCESS_RIGHTS(
        _processVmOperation |
            _processVmRead |
            _processVmWrite |
            _processQueryInformation,
      ),
      false,
      pid,
    ).value;
    if (process.address == 0) {
      // מלמעלה "אין גישה" נראה כמו "העץ ריק" - זה הסימן היחיד.
      logLine(
        'ResponsaTreeReader: OpenProcess($pid) נכשל — '
        'ייתכן שבר אילן רץ בהרשאה גבוהה יותר מהשירות',
      );
      return null;
    }

    final remoteItem = VirtualAllocEx(
      process,
      nullptr,
      itemSize32 + _textChars * 2,
      VIRTUAL_ALLOCATION_TYPE(_memCommit | _memReserve),
      PAGE_PROTECTION_FLAGS(_pageReadWrite),
    ).value;
    if (remoteItem.address == 0) {
      logLine('ResponsaTreeReader: VirtualAllocEx בתהליך $pid נכשל');
      CloseHandle(process);
      return null;
    }
    return ResponsaTreeSession._(
      treeHandle: treeHandle,
      process: process,
      remoteItem: remoteItem,
      remoteText: Pointer.fromAddress(remoteItem.address + itemSize32),
    );
  }

  void close() {
    VirtualFreeEx(process, remoteItem, 0, VIRTUAL_FREE_TYPE(_memRelease));
    CloseHandle(process);
  }

  int get root => _read(
    ResponsaTreeReader.tvmGetNextItem,
    wParam: ResponsaTreeReader.tvgnRoot,
  );

  /// מרחיב צומת ומחזיר את ידית ילדו הראשון, או `0`.
  int firstChild(int item) {
    _read(
      ResponsaTreeReader.tvmExpand,
      wParam: ResponsaTreeReader.tveExpand,
      lParam: item,
      timeoutMs: 8000,
    );
    return _read(
      ResponsaTreeReader.tvmGetNextItem,
      wParam: ResponsaTreeReader.tvgnChild,
      lParam: item,
    );
  }

  int nextSibling(int item) => _read(
    ResponsaTreeReader.tvmGetNextItem,
    wParam: ResponsaTreeReader.tvgnNext,
    lParam: item,
  );

  /// פריטים טעונים משביתים את התוכנה בכל `WM_SETTINGCHANGE`, ולכן מוחקים (העץ
  /// עצל ויתמלא מחדש). קיפול לפני מחיקה, אחרת היא איטית פי 40.
  ///
  /// ענף שנשאר טעון אחרי סריקה שנכשלה השבית את בר אילן גם בניסיון הבא, ולכן
  /// קיפול שלא נענה מחכה לבר אילן ונשלח שוב.
  void collapse(int item) {
    final limit = patience < _cleanupPatience ? patience : _cleanupPatience;
    for (final action in const [
      ResponsaTreeReader.tveCollapse,
      ResponsaTreeReader.tveCollapse | ResponsaTreeReader.tveCollapseReset,
    ]) {
      bool send() =>
          ResponsaWin32.send(
            treeHandle,
            ResponsaTreeReader.tvmExpand,
            wParam: action,
            lParam: item,
            timeoutMs: 30000,
          ) !=
          null;
      if (!send() && !(_awaitResponsive(limit) && send())) {
        logLine('ResponsaTreeSession: collapse of $item was not answered');
      }
    }
  }

  /// `TVM_ENSUREVISIBLE`: גולל אל [item] ופורש את אבותיו.
  void ensureVisible(int item) =>
      _read(ResponsaTreeReader.tvmEnsureVisible, lParam: item);

  /// המלבן של הטקסט של [item], בקואורדינטות הלקוח של העץ (בעץ מימין
  /// לשמאל — הלוגיות, כמו בהודעות העכבר). `null` כשהפריט אינו מוצג.
  ({int left, int top, int right, int bottom})? itemRect(int item) {
    final local = calloc<Uint32>(4);
    final read = calloc<IntPtr>();
    try {
      // `TVM_GETITEMRECT` קורא את הפריט מתחילת המלבן עצמו.
      local[0] = item;
      WriteProcessMemory(process, remoteItem, local, 16, read);
      final ok = _read(
        ResponsaTreeReader.tvmGetItemRect,
        wParam: 1,
        lParam: remoteItem.address,
      );
      if (ok == 0) return null;
      ReadProcessMemory(process, remoteItem, local, 16, read);
      final view = local.cast<Int32>();
      return (left: view[0], top: view[1], right: view[2], bottom: view[3]);
    } finally {
      calloc.free(local);
      calloc.free(read);
    }
  }

  ({String name, int param, int children, int image}) readItem(int item) {
    // בונים `TVITEMW` בפריסת 32-ביט ומעתיקים אותו לזיכרון היעד.
    final local = calloc<Uint8>(itemSize32);
    try {
      final bytes = local.asTypedList(itemSize32).buffer.asByteData();
      bytes.setUint32(
        _offMask,
        _tvifText | _tvifParam | _tvifChildren | _tvifImage,
        Endian.little,
      );
      bytes.setUint32(_offItem, item, Endian.little);
      bytes.setUint32(_offText, remoteText.address, Endian.little);
      bytes.setInt32(_offTextMax, _textChars, Endian.little);

      // לפני כל שליחה: הפקד רשאי לשנות את `pszText` במבנה שבתהליך היעד.
      void write() {
        final written = calloc<IntPtr>();
        try {
          WriteProcessMemory(process, remoteItem, local, itemSize32, written);
        } finally {
          calloc.free(written);
        }
      }

      final ok = _read(
        ResponsaTreeReader.tvmGetItemW,
        lParam: remoteItem.address,
        timeoutMs: 8000,
        prepare: write,
      );
      if (ok == 0) return (name: '', param: 0, children: 0, image: -1);

      final readBack = calloc<Uint8>(itemSize32);
      final textBuffer = calloc<Uint16>(_textChars);
      final read = calloc<IntPtr>();
      try {
        ReadProcessMemory(process, remoteItem, readBack, itemSize32, read);
        ReadProcessMemory(
          process,
          remoteText,
          textBuffer,
          _textChars * 2,
          read,
        );
        final view = readBack.asTypedList(itemSize32).buffer.asByteData();
        return (
          name: _utf16At(textBuffer, _textChars),
          param: view.getUint32(_offParam, Endian.little),
          children: view.getInt32(_offChildren, Endian.little),
          image: view.getInt32(_offImage, Endian.little),
        );
      } finally {
        calloc.free(readBack);
        calloc.free(textBuffer);
        calloc.free(read);
      }
    } finally {
      calloc.free(local);
    }
  }

  static String _utf16At(Pointer<Uint16> buffer, int maxChars) {
    final units = buffer.asTypedList(maxChars);
    final end = units.indexOf(0);
    return String.fromCharCodes(units.sublist(0, end < 0 ? maxChars : end));
  }
}

/// מצב סריקה אחת: הצמתים שנאספו והקולבקים.
class _Walk {
  final ResponsaTreeSession session;
  final bool Function(int param)? descendInto;
  final void Function(int)? onProgress;
  final bool Function()? shouldStop;
  final int progressEvery;
  final int maxNodes;
  final nodes = <ResponsaTreeNode>[];

  /// הנתיב של השורה האחרונה שנקראה: אחרי כשל, המקום שבו הוא קרה.
  String current = '';

  /// המחיקה משביתה את התוכנה בזמן שהיא רצה: ענף רמה 2 הגדול ביותר הוא ~28 אלף
  /// צמתים (פחות משנייה), ברמה 1 מאות אלפים (כתשע שניות).
  static const int _collapseDepth = 2;

  /// נתיבים שלא נפתחים: פתיחתם הפילה את בר אילן בקריאה קודמת. הצומת עצמו
  /// נרשם, בלי צאצאיו.
  final Set<String> skip;

  /// הצומת האחרון שנפתח (`TVM_EXPAND`). כשהוא גם [current], לא נקראה אחריו
  /// אף שורה.
  String? expanding;

  _Walk({
    required this.session,
    required this.skip,
    required this.descendInto,
    required this.onProgress,
    required this.shouldStop,
    required this.progressEvery,
    required this.maxNodes,
  });

  /// קורא את [item] ואת כל צאצאיו. `false` כשהסריקה נעצרה באמצע.
  bool visit(int item, int level, List<String> parentPath) {
    if (nodes.length >= maxNodes) return false;
    if (nodes.length % progressEvery == 0) {
      if (shouldStop?.call() ?? false) return false;
      onProgress?.call(nodes.length);
    }

    final read = session.readItem(item);
    if (session.failed) return false;
    final path = [...parentPath, read.name];
    current = path.join(ResponsaTreeReader.pathSeparator);
    nodes.add(
      ResponsaTreeNode(
        name: read.name,
        param: read.param,
        level: level,
        path: path.join(ResponsaTreeReader.pathSeparator),
        childCount: read.children,
      ),
    );
    if (read.children == 0) return true;
    // לא הורחב, ולכן גם אין מה למחוק.
    if (!(descendInto?.call(read.param) ?? true)) return true;

    if (skip.contains(current)) {
      logLine(
        'ResponsaTreeReader: not opening "$current" (crashed Bar-Ilan before)',
      );
      final added = nodes.removeLast();
      nodes.add(
        ResponsaTreeNode(
          name: added.name,
          param: added.param,
          level: added.level,
          path: added.path,
          childCount: added.childCount,
          skipped: true,
        ),
      );
      return true;
    }
    expanding = current;

    // חובה להרחיב לפני קריאת הילדים — העץ נטען עצלנית.
    var completed = true;
    for (
      var child = session.firstChild(item);
      child != 0;
      child = session.nextSibling(child)
    ) {
      if (!visit(child, level + 1, path)) {
        completed = false;
        break;
      }
    }
    // גם בביטול: ענף שהורחב ולא נמחק נשאר טעון בתוכנה.
    if (level <= _collapseDepth) session.collapse(item);
    return completed;
  }
}
