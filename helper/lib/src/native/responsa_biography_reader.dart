import 'dart:io';

import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_clipboard.dart';
import 'package:responsa_helper/src/native/responsa_menu.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:responsa_helper/src/text/responsa_book_catalog.dart';

/// "כלים ← ביוגרפיה" של בר אילן: עץ של חיבורים, ולכל אחד מאמר שנפתח בחלון
/// משלו (docs/ARCHITECTURE.md, "ביוגרפיות"). הטקסט מצויר בחלון בלי פקד שאפשר
/// לקרוא ממנו, ולכן הוא מגיע בדרך שבה משתמש היה מעתיק אותו בעצמו: "בחר הכל"
/// ו"העתק" מתפריט העריכה, ואז קריאה מהלוח. המאמר נקרא רק לבקשה, **אחד בכל
/// פעם**, והחלון נסגר מיד אחרי ההעתקה (התוכנה מפסיקה לפתוח חלונות ב-22).
///
/// חוסם: רק מאיזולט רקע.
class ResponsaBiographyReader {
  ResponsaBiographyReader._();

  /// הכיתוב בתפריט "כלים", ומזהה הפקודה ב-CD25 כנסיגה בלבד: המזהים משתנים
  /// בין מהדורות ([ResponsaMenu]).
  static const String menuLabel = 'ביוגרפיה';
  static const int fallbackOpenCommand = 32860;

  /// "עריכה" של חלון מסמך. אותה נסיגה, וגם אותו כלל: הכיתוב קובע.
  static const String selectAllLabel = 'בחר הכל';
  static const int fallbackSelectAll = 32877;
  static const String copyLabel = 'העתק';
  static const int fallbackCopy = 32876;

  static const int treeId = 1002;
  static const int okButton = 1;
  static const int cancelButton = 2;

  /// כותרת הדיאלוג (` ביוגרפיה`) וכותרת חלון המאמר (`ביוגרפיה - <שם>`).
  static const String dialogTitle = 'ביוגרפיה';
  static const String documentPrefix = BiographyText.titlePrefix;

  /// ענף עמוק מזה אינו קטגוריה: מגן מלולאה בעץ שמתנהג אחרת מהמדוד.
  static const int maxDepth = 6;

  static const Duration _poll = Duration(milliseconds: 250);
  static const Duration _dialogWait = Duration(seconds: 15);
  static const Duration _documentWait = Duration(seconds: 20);
  static const Duration _copyWait = Duration(seconds: 4);
  static const Duration _commandRepeat = Duration(seconds: 3);

  // ------------------------------------------------------------- הרשימה

  /// כל החיבורים שיש עליהם ביוגרפיה. הדיאלוג נפתח ונסגר, ושום חלון מאמר אינו
  /// נפתח.
  static List<BiographyEntry> readIndex(
    ResponsaAutomation automation,
    ResponsaDeadline deadline,
  ) {
    final dialog = _openDialog(automation, deadline);
    final session = _session(automation, dialog);
    try {
      final entries = <BiographyEntry>[];
      void walk(List<String> parent, int first) {
        for (var item = first; item != 0; item = session.nextSibling(item)) {
          automation.checkpoint(deadline);
          final read = session.readItem(item);
          if (session.failed) return;
          final path = [...parent, _name(read.name)];
          if (read.children <= 0 || path.length >= maxDepth) {
            entries.add(BiographyEntry(path));
            continue;
          }
          walk(path, session.firstChild(item));
          // הצמתים הטעונים מאטים את התוכנה (ResponsaTreeSession.collapse).
          session.collapse(item);
        }
      }

      walk(const [], session.root);
      if (session.failed) {
        throw const ResponsaAutomationException(
          ResponsaFailure.timeout,
          'בר אילן הפסיק להגיב בזמן קריאת רשימת הביוגרפיות.',
        );
      }
      logLine('ResponsaBiography: ${entries.length} entries');
      return entries;
    } finally {
      session.close();
      _closeDialog(dialog);
    }
  }

  // -------------------------------------------------------------- המאמר

  /// הטקסט שבר אילן מעתיקה מחלון המאמר של [entry], כפי שהוא (שורה ראשונה:
  /// הכותרת). הלוח של המשתמש חוזר למה שהיה בו, והחלון שנפתח נסגר.
  static String readText(
    ResponsaAutomation automation,
    BiographyEntry entry,
    ResponsaDeadline deadline,
  ) {
    final main = automation.mainWindow;
    // בר אילן מפסיקה לפתוח חלונות מעל התקרה, ובשקט.
    automation.releaseMdiWindows(main);
    final before = _documentWindows(main);

    final dialog = _openDialog(automation, deadline);
    // הדיאלוג מודאלי: כל יציאה לפני "אישור" סוגרת אותו, אחרת בר אילן נשארת
    // חסומה מאחוריו וכל חיפוש או פתיחה אחריו נכשלים.
    var posted = false;
    try {
      ResponsaTreeSession? session;
      try {
        session = _session(automation, dialog);
        final item = _locate(session, entry);
        if (item == null) {
          throw ResponsaAutomationException(
            ResponsaFailure.referenceNotParsed,
            'הביוגרפיה של "${entry.title}" לא נמצאה עוד בבר אילן. ייתכן שהרשימה '
            'שלה השתנתה.',
          );
        }
        session.ensureVisible(item);
        if (!session.select(item)) {
          throw const ResponsaAutomationException(
            ResponsaFailure.timeout,
            'בר אילן לא ענה בעת בחירת הביוגרפיה.',
          );
        }
      } finally {
        session?.close();
      }

      // "אישור" סוגר את הדיאלוג ופותח את המאמר: ב-Post, כמו כל כפתור כזה.
      final ok = _button(dialog, okButton);
      if (ok == null || !ResponsaWin32.postClick(ok)) {
        throw const ResponsaAutomationException(
          ResponsaFailure.citationDialogNotFound,
          'חלון הביוגרפיה של בר אילן לא הגיב.',
        );
      }
      posted = true;
    } finally {
      if (!posted) _closeDialog(dialog);
    }

    final document = _waitFor(automation, deadline, _documentWait, () {
      for (final window in _documentWindows(main)) {
        if (!before.contains(window)) return window;
      }
      return null;
    });
    if (document == null) {
      _closeDialog(dialog);
      throw const ResponsaAutomationException(
        ResponsaFailure.timeout,
        'בר אילן לא פתח את חלון הביוגרפיה.',
      );
    }
    try {
      return _copy(automation, deadline, main, document);
    } finally {
      ResponsaWin32.destroyMdiChild(main, document);
    }
  }

  /// "בחר הכל" ו"העתק" בחלון המאמר. התפריט פועל על החלון הפעיל, ולכן המאמר
  /// מופעל קודם, ואם לא הופעל — לא מעתיקים: ההעתקה הייתה מגיעה מחלון אחר של
  /// המשתמש. הלוח נשמר לפני, ומוחזר אחרי רק אם ההעתקה שלנו עדיין בו.
  static String _copy(
    ResponsaAutomation automation,
    ResponsaDeadline deadline,
    int main,
    int document,
  ) {
    final title = ResponsaWin32.windowText(document);
    // התפריט תלוי בחלון הפעיל: רק אחרי שהמאמר פעיל יש בו "עריכה" של מסמך.
    bool active() => ResponsaWin32.mdiActiveTitle(main) == title;
    var ready = _waitFor(
      automation,
      deadline,
      const Duration(seconds: 5),
      () => active() ? true : null,
    );
    if (ready == null) {
      ResponsaWin32.activateMdiChild(main, document);
      ready = _waitFor(
        automation,
        deadline,
        const Duration(seconds: 3),
        () => active() ? true : null,
      );
    }
    if (ready == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.timeout,
        'חלון הביוגרפיה לא הפך לפעיל בבר אילן, ולכן לא הועתק ממנו דבר.',
      );
    }
    final saved = ResponsaClipboard.snapshot();
    String? copied;
    if (saved == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.unexpected,
        'הלוח של Windows תפוס בידי תוכנה אחרת, ולכן אי אפשר היה להעתיק את '
        'הביוגרפיה. אפשר לנסות שוב בעוד רגע.',
      );
    }
    final sequence = ResponsaClipboard.sequence;
    try {
      final selectAll =
          ResponsaMenu.commandOf(main, selectAllLabel) ?? fallbackSelectAll;
      final copy = ResponsaMenu.commandOf(main, copyLabel) ?? fallbackCopy;
      ResponsaWin32.send(main, ResponsaWin32.wmCommand, wParam: selectAll);
      automation.pause(const Duration(milliseconds: 300), deadline);
      ResponsaWin32.send(main, ResponsaWin32.wmCommand, wParam: copy);
      final changed = _waitFor(
        automation,
        deadline,
        _copyWait,
        () => ResponsaClipboard.sequence != sequence ? true : null,
      );
      final text = changed == null ? null : ResponsaClipboard.readText();
      if (text == null || text.trim().isEmpty) {
        throw const ResponsaAutomationException(
          ResponsaFailure.unexpected,
          'בר אילן לא העתיקה את הביוגרפיה.',
        );
      }
      copied = text;
      return text;
    } finally {
      // לוח שלא שונה על ידינו נשאר כמות שהוא, ולוח שהמשתמש שינה בינתיים אינו
      // נדרס: מחזירים את מה שהיה רק כשההעתקה שלנו עדיין בו.
      if (ResponsaClipboard.sequence != sequence) {
        final current = ResponsaClipboard.readText();
        if (copied == null || current == copied) {
          if (!ResponsaClipboard.restore(saved)) {
            logLine('ResponsaBiography: clipboard restore failed');
          }
        }
      }
    }
  }

  // ---------------------------------------------------------- דיאלוג ועץ

  /// הדיאלוג, מוצג. בר אילן מסתירה אותו בסגירה ומציגה שוב את אותו חלון, ולכן
  /// קודם בודקים אם הוא כבר מוצג.
  static int _openDialog(
    ResponsaAutomation automation,
    ResponsaDeadline deadline,
  ) {
    final main = automation.mainWindow;
    automation.dismissInfoModals();
    final pid = automation.pid;
    int? shown() {
      for (final hwnd in ResponsaWin32.topWindows(pid)) {
        if (_isDialog(hwnd)) return hwnd;
      }
      return null;
    }

    if (shown() case final existing?) return existing;
    final command =
        ResponsaMenu.commandOf(main, menuLabel) ?? fallbackOpenCommand;
    final clock = Stopwatch()..start();
    Stopwatch? sinceCommand;
    final dialog = _waitFor(automation, deadline, _dialogWait, () {
      if (sinceCommand == null || sinceCommand!.elapsed >= _commandRepeat) {
        ResponsaWin32.postCommand(main, command);
        sinceCommand = Stopwatch()..start();
      }
      return shown();
    });
    if (dialog == null) {
      throw ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'בר אילן לא פתח את חלון "ביוגרפיה". ייתכן שחלון אחר פתוח בבר אילן '
        'וממתין לתשובה, או שבמהדורה הזאת אין ביוגרפיות. '
        '(${clock.elapsed.inSeconds} שניות)',
      );
    }
    return dialog;
  }

  static bool _isDialog(int hwnd) =>
      ResponsaWin32.isVisible(hwnd) &&
      ResponsaWin32.className(hwnd) == '#32770' &&
      ResponsaWin32.windowText(hwnd).contains(dialogTitle) &&
      _tree(hwnd) != null;

  static void _closeDialog(int dialog) {
    if (!ResponsaWin32.isWindow(dialog) || !ResponsaWin32.isVisible(dialog)) {
      return;
    }
    final cancel = _button(dialog, cancelButton);
    if (cancel != null) ResponsaWin32.postClick(cancel);
    final clock = Stopwatch()..start();
    while (clock.elapsed < const Duration(seconds: 5) &&
        ResponsaWin32.isWindow(dialog) &&
        ResponsaWin32.isVisible(dialog)) {
      sleep(_poll);
    }
  }

  static ResponsaTreeSession _session(
    ResponsaAutomation automation,
    int dialog,
  ) {
    final tree = _tree(dialog);
    final session = tree == null
        ? null
        : ResponsaTreeSession.open(automation.pid, tree);
    if (session == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'לא ניתן לקרוא את עץ הביוגרפיות של בר אילן. ייתכן שהיא רצה בהרשאה '
        'גבוהה מהשירות.',
      );
    }
    // בר אילן נעה לכמה שניות אחרי הרחבת ענף גדול.
    session.patience = const Duration(seconds: 20);
    return session;
  }

  /// הפריט של [entry]: בכל רמה, הצומת ששמו כשם הרמה.
  static int? _locate(ResponsaTreeSession session, BiographyEntry entry) {
    var level = session.root;
    for (var depth = 0; depth < entry.path.length; depth++) {
      int? found;
      for (var item = level; item != 0; item = session.nextSibling(item)) {
        if (_name(session.readItem(item).name) == entry.path[depth]) {
          found = item;
          break;
        }
      }
      if (found == null || session.failed) return null;
      if (depth == entry.path.length - 1) return found;
      level = session.firstChild(found);
    }
    return null;
  }

  static String _name(String raw) => ResponsaBookCatalog.fromVisual(raw);

  /// חלונות המאמרים שפתוחים עכשיו (`ביוגרפיה - <שם>`).
  static Set<int> _documentWindows(int main) {
    final client = ResponsaWin32.mdiClient(main);
    if (client == null) return const {};
    return {
      for (final child in ResponsaWin32.directChildren(client))
        if (ResponsaWin32.windowText(child).startsWith(documentPrefix)) child,
    };
  }

  static int? _button(int parent, int id) {
    for (final child in ResponsaWin32.children(parent)) {
      if (ResponsaWin32.controlId(child) == id &&
          ResponsaWin32.className(child) == 'Button' &&
          ResponsaWin32.isVisible(child)) {
        return child;
      }
    }
    return null;
  }

  static int? _tree(int parent) {
    for (final child in ResponsaWin32.children(parent)) {
      if (ResponsaWin32.controlId(child) == treeId &&
          ResponsaWin32.className(child) == 'SysTreeView32') {
        return child;
      }
    }
    return null;
  }

  static T? _waitFor<T>(
    ResponsaAutomation automation,
    ResponsaDeadline deadline,
    Duration limit,
    T? Function() probe,
  ) {
    final clock = Stopwatch()..start();
    while (clock.elapsed < limit) {
      automation.checkpoint(deadline);
      final found = probe();
      if (found != null) return found;
      sleep(_poll);
    }
    return null;
  }
}
