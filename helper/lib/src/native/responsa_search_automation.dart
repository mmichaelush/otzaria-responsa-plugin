import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/native/responsa_edition_probe.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_search_scope.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';

/// מה בר אילן עשה עם החיפוש. בכל המצבים חלון התשובה שלו נשאר פתוח: הוא
/// הממשק שבו המשתמש ממשיך.
enum ResponsaSearchState {
  /// נמצאו תוצאות; מוצג חלון התוצאות ומודאל הסיכום.
  found,

  /// אין תוצאות במאגרים שנבחרו, ובר אילן שואל אם לחפש בכולם.
  asked,

  /// בר אילן סירב, למשל כי יש יותר מדי תוצאות.
  refused,

  /// בר אילן דחה את השאילתה ("שגיאה בהגדרת השאילתה"); ההסבר שלו ב-
  /// [ResponsaSearchOutcome.message]. החלון שלו כבר נסגר.
  invalid,

  /// נפתח "ניהול הצורות" (המשתמש ביקש אותו): בר אילן ממתין שהמשתמש יבחר
  /// בו צורות, ורק אז יציג תוצאות.
  forms,

  /// עוד אין תשובה.
  pending,
}

class ResponsaSearchOutcome {
  final ResponsaSearchState state;
  final int? count;

  /// הטקסט של בר אילן במודאל "מידע", ברווחים רגילים.
  final String? message;

  /// כותרת חלון התוצאות (`נמצאו 2543 תוצאות ...`), כשנפתח.
  final String? window;

  /// מודאל הסיכום כבר על המסך; בלעדיו ממתינים לו עוד רגע.
  final bool summaryShown;

  final bool broughtToFront;

  const ResponsaSearchOutcome(
    this.state, {
    this.count,
    this.message,
    this.window,
    this.summaryShown = false,
    this.broughtToFront = false,
  });

  static const ResponsaSearchOutcome pending = ResponsaSearchOutcome(
    ResponsaSearchState.pending,
  );

  ResponsaSearchOutcome withFront(bool broughtToFront) => ResponsaSearchOutcome(
    state,
    count: count,
    message: message,
    window: window,
    summaryShown: summaryShown,
    broughtToFront: broughtToFront,
  );
}

/// מה לקבוע בחלון החיפוש לפני החיפוש. `null` = כפי שהמשתמש השאיר בבר אילן.
/// תיבות הסימון חוזרות אחרי החיפוש למצבן הקודם, כדי שחיפוש רגיל (מטקסט
/// מסומן) לא ירוץ בהגדרות שנשארו מחיפוש מתקדם. בחירת הקטגוריות נשמרת:
/// כך היא פועלת גם בבר אילן עצמו.
class ResponsaSearchSetup {
  /// מעבר ל"חיפוש מתקדם": רק בו התחביר (`#נר`, `[1:4]`) מתפרש.
  final bool advanced;

  /// מעבר ל"חיפוש בניסוח חופשי": משפט במילים של המשתמש. סותר את [advanced].
  final bool freeForm;

  /// "חיפוש בכל המאגרים".
  final bool? allDatabases;

  /// "כולל ראשי תיבות".
  final bool? abbreviations;

  /// "הצג חלון ניהול הצורות".
  final bool? showForms;

  /// הקטגוריות והספרים לחיפוש, כנתיבי שמות תצוגה מהשורש.
  final List<List<String>>? scope;

  const ResponsaSearchSetup({
    this.advanced = false,
    this.freeForm = false,
    this.allDatabases,
    this.abbreviations,
    this.showForms,
    this.scope,
  });

  static const ResponsaSearchSetup none = ResponsaSearchSetup();

  /// מזהי תיבות הסימון בחלון "חיפוש מתקדם" (גרסה 25).
  static const int allDatabasesId = 1024;
  static const int showFormsId = 1173;
  static const int abbreviationsId = 1025;

  Map<int, bool> get checks => {
    allDatabasesId: ?allDatabases,
    abbreviationsId: ?abbreviations,
    showFormsId: ?showForms,
  };

  /// מילה מהכיתוב של כל תיבה. המזהים נמדדו ב-CD25, ובמהדורה אחרת אותו
  /// מזהה עשוי להיות פקד אחר; תיבה שהכיתוב שלה אחר אינה נלחצת.
  static const Map<int, List<String>> checkLabels = {
    allDatabasesId: ['מאגרים', 'database', 'bases'],
    abbreviationsId: ['ראשי תיבות', 'abbreviation', 'abréviation'],
    showFormsId: ['צורות', 'forms', 'formes'],
  };

  /// האם [label] (הכיתוב של התיבה [id]) הוא של התיבה הזו.
  static bool labelMatches(int id, String label) {
    final words = checkLabels[id];
    if (words == null) return true;
    final text = label.replaceAll('&', '').toLowerCase();
    return words.any(text.contains);
  }
}

/// מה שנקרא מדיאלוג עליון נראה, כדי שהסיווג יהיה פונקציה טהורה.
class ResponsaDialogSnapshot {
  final String title;
  final List<({int id, String text})> buttons;

  /// הטקסט של `Static` 65535, כשיש.
  final String? message;

  const ResponsaDialogSnapshot({
    required this.title,
    this.buttons = const [],
    this.message,
  });
}

/// חיפוש טקסט מלא בבר אילן, כאילו המשתמש הקליד אותו בחלון החיפוש. מעל
/// [ResponsaAutomation], שממנה נלקחים החלון הראשי, סגירת המודאלים, שחרור
/// חלונות MDI והתקציבים. חוסם; רק באיזולט רקע.
class ResponsaSearchAutomation {
  final ResponsaAutomation _automation;

  ResponsaSearchAutomation(this._automation);

  int get _pid => _automation.pid;
  ResponsaVersionProfile get _profile => _automation.profile;

  /// חיפוש כבד נמשך 10–15 שניות (נמדד).
  static const Duration outcomeBudget = Duration(seconds: 45);

  /// הדיאלוג צריך רגע אחרי קבלת הטקסט, בפרט כשנוצר זה עתה.
  static const Duration _settle = Duration(milliseconds: 500);

  /// חיפוש שהתחיל מסתיר את הדיאלוג תוך כחצי שנייה; שקט ארוך מזה הוא לחיצה
  /// שנבלעה.
  static const Duration _clickRetryAfter = Duration(seconds: 4);

  /// מודאל הסיכום עולה כחצי שנייה אחרי חלון התוצאות.
  static const Duration _summaryGrace = Duration(seconds: 3);

  /// כפתורי המעבר בין סוגי החיפוש, שבכל אחד מחלונות החיפוש. נמדד ב-CD25:
  /// 1209 "חיפוש מתקדם", 1207 "חיפוש קל", 1208 "חיפוש טבלאי", 1189 "חיפוש
  /// בניסוח חופשי". שכניהם אינם סוגים: 1210 פותח "ניהול המאגרים" ו-1368
  /// מקלדת מדומה, ולכן לעולם אינם נלחצים כאן. במהדורות אחרות הסדר לא נמדד
  /// (ב-CD31 נפתח "חיפוש טבלאי" ונשאר על המסך), ולכן כל לחיצה נבדקת,
  /// וממשיכים לכפתור הבא מהחלון שנפתח.
  static const List<int> _modeButtonIds = [1209, 1207, 1208, 1189];
  static const int _advancedButtonId = 1209;
  static const int _freeFormButtonId = 1189;
  static const int _easyButtonId = 1207;

  /// הפקד שבין חלונות החיפוש עם שדה שאילתה קיים רק ב"חיפוש מתקדם" ("תרגום
  /// לארמית"). גם ב"חיפוש טבלאי" יש 1065, אבל אין בו שדה שאילתה.
  static const int _advancedOnlyId = 1065;

  /// "ביטול" בחלון חיפוש: מסתיר אותו.
  static const int _cancelId = 2;

  /// לחיצה על כפתור מעבר מחליפה חלון תוך פחות משנייה (נמדד ב-CD25).
  static const Duration _switchBudget = Duration(seconds: 4);

  /// "שגיאה בהגדרת השאילתה".
  static const DialogHints queryErrorHints = DialogHints(
    role: 'query_error',
    windowClass: '#32770',
    titleContains: {'שגיאה', 'Error', 'Erreur'},
  );

  static const DialogHints formsHints = DialogHints(
    role: 'forms',
    windowClass: '#32770',
    titleContains: {'ניהול הצורות', 'Forms', 'formes'},
  );

  ResponsaSearchOutcome search(
    String query,
    ResponsaDeadline deadline, {
    ResponsaSearchSetup setup = ResponsaSearchSetup.none,
  }) {
    final main = _automation.mainWindow;
    // מודאל פתוח משבית את החלון הראשי, ושאלה שנשארה פתוחה חוסמת גם פתיחת
    // ספרים. הסיכום נסגר קודם: הוא מעל כל השאר.
    closeSearchSummaries();
    _automation.dismissInfoModals();
    _automation.releaseMdiWindows(main);

    final client = ResponsaWin32.mdiClient(main);
    final before = client == null
        ? const <int>{}
        : ResponsaWin32.directChildren(client).toSet();
    final atLimit = before.length >= _profile.mdiSoftLimit;

    var dialog = _ensureKind(ensureSearchDialog(deadline), setup, deadline);
    if (setup.scope case final scope?) {
      final missing = ResponsaSearchScope(
        _automation,
      ).select(dialog.hwnd, scope, deadline);
      if (missing.isNotEmpty) {
        throw ResponsaAutomationException(
          ResponsaFailure.searchScopeNotFound,
          'לא נמצאו בעץ המאגרים של בר אילן: ${missing.join('; ')}',
          {'missing': missing},
        );
      }
      // אחרי "אישור" בר אילן עשוי להחזיר חלון חיפוש אחר.
      dialog = _ensureKind(ensureSearchDialog(deadline), setup, deadline);
    }
    final restore = _applyChecks(dialog.hwnd, setup.checks);
    _probeEdition(main);
    try {
      return _run(
        query,
        dialog,
        deadline,
        main,
        client,
        before,
        atLimit,
        // גם כשלא עברנו ממנו: התוצאות שלו בלי "נמצאו N".
        anyWindowIsResult: setup.freeForm || isFreeForm(dialog.hwnd),
      );
    } finally {
      // חלון החיפוש עשוי להיות מושבת מתחת למודאל התוצאות; לחיצה על תיבת
      // סימון עדיין מגיעה אליה.
      _applyChecks(dialog.hwnd, restore);
    }
  }

  ResponsaSearchOutcome _run(
    String query,
    DiscoveredDialog dialog,
    ResponsaDeadline deadline,
    int main,
    int? client,
    Set<int> before,
    bool atLimit, {
    bool anyWindowIsResult = false,
  }) {
    final edit = dialog.handle('query_edit')!;
    final button = dialog.handle('run_button')!;
    ResponsaWin32.setWindowText(edit, query);
    final echoed = ResponsaWin32.windowText(edit);
    if (echoed != query) {
      logLine('ResponsaSearch: שדה החיפוש מכיל "$echoed" ולא "$query"');
    }
    _automation.pause(_settle, deadline);
    // מודאל שלא נסגר למעלה היה נקרא כתשובה מיידית על החיפוש הזה.
    final stale = _visibleDialogHandles().toSet();
    ResponsaWin32.postClick(button);

    final ResponsaSearchOutcome outcome;
    try {
      outcome = _awaitOutcome(
        main,
        dialog,
        button,
        deadline,
        mdiClient: client,
        mdiBefore: before,
        stale: stale,
        anyWindowIsResult: anyWindowIsResult,
      );
    } on ResponsaAutomationException catch (error) {
      // בתקרה, "אין חלון תוצאות" אינו איטיות אלא סירוב שקט של התוכנה.
      if (error.failure == ResponsaFailure.timeout && atLimit) {
        throw ResponsaAutomationException(
          ResponsaFailure.mdiWindowLimitReached,
          'פרויקט השו"ת אינו פותח חלונות נוספים — יש לסגור חלונות בתוכנה',
          {'windows': before.length},
        );
      }
      rethrow;
    }

    if (outcome.window case final title?) _automation.adoptWindow(title);
    if (outcome.state == ResponsaSearchState.invalid) {
      // ההודעה עוברת לתוסף; חלון פתוח היה חוסם את החיפוש הבא.
      _closeQueryErrors();
      return outcome;
    }
    // המודאלים שייכים לחלון הראשי ועולים איתו.
    return outcome.withFront(ResponsaWin32.bringToFront(main));
  }

  /// מה שונה בחלונות החיפוש של המהדורה הזו לעומת CD25 (ליומן ולאבחון).
  void _probeEdition(int main) {
    final title = ResponsaWin32.windowText(main);
    final version = ResponsaInstallationDiscovery.versionFromWindowTitle(title);
    ResponsaEditionProbe.probe(_pid, 'edition ${version ?? '?'}');
  }

  /// סוג החיפוש ש-[setup] מבקש; בלי בקשה — מה שבר אילן פתח.
  DiscoveredDialog _ensureKind(
    DiscoveredDialog dialog,
    ResponsaSearchSetup setup,
    ResponsaDeadline deadline,
  ) {
    if (setup.advanced) return _ensureAdvanced(dialog, deadline);
    if (setup.freeForm) return _ensureFreeForm(dialog, deadline);
    if (!isFreeForm(dialog.hwnd)) return dialog;
    // בר אילן זוכר את "ניסוח חופשי" מהחיפוש הקודם, אבל מילים מטקסט מסומן
    // אינן שאלה: עוברים ל"חיפוש קל", כמו בבר אילן כשהוא נפתח.
    final tried = <String>[];
    final switched = _switchMode(
      dialog.hwnd,
      (found) => !isFreeForm(found.hwnd),
      deadline,
      tried,
      first: _easyButtonId,
    );
    logLine(
      switched == null
          ? 'ResponsaSearch: נשאר "חיפוש בניסוח חופשי"; ${tried.join(', ')}'
          : 'ResponsaSearch: מ"חיפוש בניסוח חופשי" ל"${ResponsaWin32.windowText(switched.hwnd)}"',
    );
    return switched ?? dialog;
  }

  /// פקדים שקיימים ב"חיפוש קל" (1163, "ללא תוספות") וב"חיפוש מתקדם" (1173,
  /// "ניהול הצורות"), ולא ב"חיפוש בניסוח חופשי" (נמדד ב-CD25).
  static const List<int> _notFreeFormIds = [1163, 1173, _advancedOnlyId];

  /// "חיפוש בניסוח חופשי": בכותרת, או חלון עם שדה שאילתה בלי פקדי הסוגים
  /// האחרים.
  static bool isFreeForm(int dialog) =>
      ResponsaWin32.windowText(dialog).contains('חופשי') ||
      _notFreeFormIds.every((id) => !_hasChild(dialog, id));

  /// חלון החיפוש במצב "חיפוש בניסוח חופשי", כמו [_ensureAdvanced].
  DiscoveredDialog _ensureFreeForm(
    DiscoveredDialog dialog,
    ResponsaDeadline deadline,
  ) {
    if (isFreeForm(dialog.hwnd)) return dialog;
    final visibleBefore = _visibleSearchKinds().toSet();
    final tried = <String>[];
    final switched = _switchMode(
      dialog.hwnd,
      (found) => isFreeForm(found.hwnd),
      deadline,
      tried,
      first: _freeFormButtonId,
    );
    if (switched != null) {
      logLine(
        'ResponsaSearch: "${ResponsaWin32.windowText(switched.hwnd)}"'
        '${tried.isEmpty ? '' : ' אחרי ${tried.join(', ')}'}',
      );
      return switched;
    }
    _hideOpened(visibleBefore);
    logLine(
      'ResponsaSearch: לא עבר ל"חיפוש בניסוח חופשי"; ${tried.join(', ')}',
    );
    throw const ResponsaAutomationException(
      ResponsaFailure.searchDialogNotFound,
      'בר אילן לא עבר ל"חיפוש בניסוח חופשי" בזמן',
    );
  }

  /// חלון החיפוש במצב "חיפוש מתקדם". בר אילן זוכר את הסוג האחרון שנבחר,
  /// וב"חיפוש קל" התחביר היה נקרא כמילים.
  DiscoveredDialog _ensureAdvanced(
    DiscoveredDialog dialog,
    ResponsaDeadline deadline,
  ) {
    if (_hasChild(dialog.hwnd, _advancedOnlyId)) return dialog;
    final visibleBefore = _visibleSearchKinds().toSet();
    final tried = <String>[];
    final switched = _switchMode(
      dialog.hwnd,
      (found) => _hasChild(found.hwnd, _advancedOnlyId),
      deadline,
      tried,
    );
    if (switched != null) {
      if (tried.isNotEmpty) {
        logLine('ResponsaSearch: "חיפוש מתקדם" אחרי ${tried.join(', ')}');
      }
      return switched;
    }
    // אף לחיצה לא הציגה אותו. חלון מתקדם מוסתר עדיין מריץ חיפוש (נמדד),
    // אבל מה שנפתח בדרך נסגר: חלון שנשאר על המסך מבלבל את המשתמש.
    _hideOpened(visibleBefore);
    final hidden = findSearchDialog();
    logLine(
      'ResponsaSearch: לא עבר ל"חיפוש מתקדם"; ${tried.join(', ')}'
      '${hidden != null && _hasChild(hidden.hwnd, _advancedOnlyId) ? '; משתמשים בחלון המוסתר' : ''}',
    );
    if (hidden != null && _hasChild(hidden.hwnd, _advancedOnlyId)) {
      return hidden;
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.searchDialogNotFound,
      'בר אילן לא עבר ל"חיפוש מתקדם" בזמן',
    );
  }

  /// לוחץ על כפתורי המעבר, מ-[from] ואחר כך מכל חלון שנפתח, עד שעל המסך
  /// חלון חיפוש עם שדה שאילתה ש-[accept] מקבל. [tried] מקבל שורה לכל
  /// לחיצה שלא הגיעה אליו, ליומן.
  DiscoveredDialog? _switchMode(
    int from,
    bool Function(DiscoveredDialog) accept,
    ResponsaDeadline deadline,
    List<String> tried, {
    int first = _advancedButtonId,
  }) {
    var current = from;
    for (final id in [first, ..._modeButtonIds.where((id) => id != first)]) {
      final button = _childById(current, id);
      if (button == null) continue;
      // חלון שכבר היה על המסך אינו תוצאה של הלחיצה.
      final before = _visibleSearchKinds().toSet();
      ResponsaWin32.postClick(button);
      final own = deadline.within(_switchBudget);
      int? opened;
      while (!own.expired) {
        _automation.pause(ResponsaAutomation.poll, deadline);
        final found = findSearchDialog();
        if (found != null &&
            ResponsaWin32.isVisible(found.hwnd) &&
            accept(found)) {
          return found;
        }
        opened = _visibleSearchKinds()
            .where((h) => h != current && !before.contains(h))
            .firstOrNull;
        if (opened != null) break;
      }
      tried.add(
        opened == null
            ? '$id: לא נפתח חלון'
            : '$id: "${ResponsaWin32.windowText(opened)}"',
      );
      if (opened != null) current = opened;
    }
    return null;
  }

  /// חלונות סוגי החיפוש שעל המסך, לפי כפתורי המעבר שבכולם.
  List<int> _visibleSearchKinds() => [
    for (final hwnd in _visibleDialogHandles())
      if (_modeButtonIds.every((id) => _hasChild(hwnd, id))) hwnd,
  ];

  /// מסתיר ב"ביטול" חלונות חיפוש שלא היו על המסך לפני [before].
  void _hideOpened(Set<int> before) {
    for (final hwnd in _visibleSearchKinds()) {
      if (before.contains(hwnd)) continue;
      if (_childById(hwnd, _cancelId) case final cancel?) {
        ResponsaWin32.postClick(cancel);
      }
    }
  }

  /// מסמן או מנקה תיבות לפי [wanted], ומחזיר את אלה ששונו עם מצבן הקודם.
  /// בלחיצה ולא ב-`BM_SETCHECK`: בר אילן קורא את ההגדרה מהלחיצה, ותיבה
  /// שסומנה בהודעה בלבד אינה משפיעה על החיפוש (נמדד).
  Map<int, bool> _applyChecks(int dialog, Map<int, bool> wanted) {
    final changed = <int, bool>{};
    for (final MapEntry(key: id, value: on) in wanted.entries) {
      final box = _childById(dialog, id);
      if (box == null) continue;
      final label = ResponsaWin32.windowText(box);
      if (!ResponsaSearchSetup.labelMatches(id, label)) {
        logLine('ResponsaSearch: תיבה $id היא "$label"; לא נלחצת');
        continue;
      }
      final current = ResponsaWin32.isChecked(box);
      if (current == null || current == on) continue;
      if (ResponsaWin32.click(box, timeoutMs: ResponsaWin32.scanTimeoutMs)) {
        changed[id] = current;
      }
    }
    return changed;
  }

  void _closeQueryErrors() {
    for (final hwnd in _visibleDialogHandles()) {
      if (!ResponsaDiscovery.titleMatches(
        ResponsaWin32.windowText(hwnd),
        queryErrorHints,
      )) {
        continue;
      }
      for (final child in ResponsaWin32.children(hwnd)) {
        if (ResponsaWin32.className(child) == 'Button') {
          ResponsaWin32.postClick(child);
          break;
        }
      }
    }
  }

  static bool _hasChild(int dialog, int id) => _childById(dialog, id) != null;

  static int? _childById(int dialog, int id) {
    for (final child in ResponsaWin32.children(dialog)) {
      if (ResponsaWin32.controlId(child) == id) return child;
    }
    return null;
  }

  /// נראה תחילה: זה מצב החיפוש שהמשתמש בחר. מוסתר מתאים גם הוא - לחיצה
  /// עליו מריצה חיפוש (נמדד).
  DiscoveredDialog? findSearchDialog() =>
      ResponsaDiscovery.discoverDialog(_pid, _profile.searchDialogHints);

  /// הפקודה נשלחת שוב ושוב, כמו בדיאלוג העיון: פקודה בודדת נבלעת כשהתוכנה
  /// עסוקה.
  DiscoveredDialog ensureSearchDialog(ResponsaDeadline deadline) {
    final existing = findSearchDialog();
    if (existing != null) return existing;

    final main = _automation.mainWindow;
    final own = deadline.within(ResponsaAutomation.dialogBudget);
    Stopwatch? sinceCommand;
    while (!own.expired && !deadline.expired) {
      if (sinceCommand == null ||
          sinceCommand.elapsed >= ResponsaAutomation.commandRepeat) {
        ResponsaWin32.postCommand(main, _profile.searchCommand);
        sinceCommand = Stopwatch()..start();
      }
      _automation.pause(const Duration(milliseconds: 600), deadline);
      final found = findSearchDialog();
      if (found != null) return found;
      // בר אילן פותח את הסוג האחרון שנבחר בו. "חיפוש טבלאי" אינו מתאים
      // (אין בו שדה שאילתה), ופקודה חוזרת רק הייתה פותחת אותו שוב.
      for (final hwnd in _visibleSearchKinds()) {
        final tried = <String>[];
        final switched = _switchMode(hwnd, (_) => true, deadline, tried);
        if (switched != null) {
          logLine(
            'ResponsaSearch: נפתח "${ResponsaWin32.windowText(hwnd)}", '
            'ועברנו ל"${ResponsaWin32.windowText(switched.hwnd)}"',
          );
          return switched;
        }
        logLine(
          'ResponsaSearch: אין מעבר לחלון עם שדה שאילתה; ${tried.join(', ')}',
        );
      }
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.searchDialogNotFound,
      'חלון החיפוש לא נפתח בזמן שהוקצב',
    );
  }

  /// סיכום שנשאר מחיפוש קודם הוא מודאל, ומשבית את החלון הראשי.
  int closeSearchSummaries() {
    final summaries = ResponsaDiscovery.discoverAll(
      _pid,
      _profile.searchSummaryHints,
    );
    for (final summary in summaries) {
      ResponsaWin32.click(summary.handle('ok_button')!);
    }
    if (summaries.isNotEmpty) {
      ResponsaAutomation.sleepFor(const Duration(milliseconds: 400));
    }
    return summaries.length;
  }

  ResponsaSearchOutcome _awaitOutcome(
    int main,
    DiscoveredDialog dialog,
    int button,
    ResponsaDeadline deadline, {
    required int? mdiClient,
    required Set<int> mdiBefore,
    required Set<int> stale,
    bool anyWindowIsResult = false,
  }) {
    final own = deadline.within(outcomeBudget);
    final wasVisible = ResponsaWin32.isVisible(dialog.hwnd);
    final sinceClick = Stopwatch()..start();
    var retried = false;
    ResponsaSearchOutcome? found;
    Stopwatch? sinceFound;
    while (!own.expired) {
      _automation.checkpoint(deadline);
      final dialogs = _visibleDialogs(stale);
      final outcome = classify(
        profile: _profile,
        dialogs: dialogs,
        newMdiTitles: _newMdiTitles(mdiClient, mdiBefore),
        anyWindowIsResult: anyWindowIsResult,
      );
      switch (outcome.state) {
        case ResponsaSearchState.asked ||
            ResponsaSearchState.refused ||
            ResponsaSearchState.invalid ||
            ResponsaSearchState.forms:
          return outcome;
        case ResponsaSearchState.found:
          if (outcome.summaryShown) return outcome;
          found = outcome;
          sinceFound ??= Stopwatch()..start();
          if (sinceFound.elapsed >= _summaryGrace) return outcome;
        case ResponsaSearchState.pending:
          // לחיצה שנייה רק כשברור שהראשונה לא התקבלה: התוכנה פנויה, אין
          // התקדמות, והדיאלוג לא הוסתר. אחרת היא הייתה מריצה חיפוש כפול.
          if (!retried &&
              sinceClick.elapsed >= _clickRetryAfter &&
              !dialogs.any(_isProgress) &&
              ResponsaWin32.isVisible(dialog.hwnd) == wasVisible &&
              ResponsaWin32.responds(main)) {
            logLine('ResponsaSearch: אין תגובה ללחיצה; לוחצים שוב');
            ResponsaWin32.postClick(button);
            retried = true;
          }
      }
      ResponsaAutomation.sleepFor(ResponsaAutomation.poll);
    }
    if (found != null) return found;
    throw const ResponsaAutomationException(
      ResponsaFailure.timeout,
      'בר אילן לא השיב על החיפוש בזמן שהוקצב',
    );
  }

  bool _isProgress(ResponsaDialogSnapshot dialog) =>
      ResponsaDiscovery.titleMatches(
        dialog.title,
        _profile.searchProgressHints,
      );

  /// לפי ידיות ולא לפי כותרות: חיפוש חוזר יוצר חלון בכותרת זהה לקודם.
  List<String> _newMdiTitles(int? client, Set<int> before) {
    if (client == null) return const [];
    return [
      for (final child in ResponsaWin32.directChildren(client))
        if (!before.contains(child)) ResponsaWin32.windowText(child),
    ];
  }

  List<int> _visibleDialogHandles() => [
    for (final hwnd in ResponsaWin32.topWindows(_pid))
      if (ResponsaWin32.className(hwnd) == '#32770' &&
          ResponsaWin32.isVisible(hwnd))
        hwnd,
  ];

  /// הפקדים נקראים רק בדיאלוגים שהסיווג מכיר: כל קריאה נשלחת לתוכנה, והיא
  /// עסוקה בחיפוש. [stale] = מה שהיה פתוח לפני הלחיצה, ואינו תשובה עליה.
  List<ResponsaDialogSnapshot> _visibleDialogs(Set<int> stale) {
    final wanted = [
      _profile.infoModalHints,
      _profile.searchSummaryHints,
      _profile.searchProgressHints,
      queryErrorHints,
      formsHints,
    ];
    return [
      for (final hwnd in _visibleDialogHandles())
        if (!stale.contains(hwnd))
          if (ResponsaWin32.windowText(hwnd) case final title
              when wanted.any((h) => ResponsaDiscovery.titleMatches(title, h)))
            _snapshot(hwnd, title),
    ];
  }

  static ResponsaDialogSnapshot _snapshot(int hwnd, String title) {
    final buttons = <({int id, String text})>[];
    String? message;
    // בחלון השגיאה ההודעה אינה ב-65535; שם — הטקסט הארוך שבחלון.
    String? longest;
    for (final child in ResponsaWin32.children(hwnd)) {
      switch (ResponsaWin32.className(child)) {
        case 'Button':
          buttons.add((
            id: ResponsaWin32.controlId(child),
            text: ResponsaWin32.windowText(child),
          ));
        case 'Static':
          final text = ResponsaWin32.windowText(child).trim();
          if (ResponsaWin32.controlId(child) == _messageId) {
            message ??= text;
          } else if (text.length > (longest?.length ?? 0)) {
            longest = text;
          }
      }
    }
    return ResponsaDialogSnapshot(
      title: title,
      buttons: buttons,
      message: message ?? longest,
    );
  }

  static const int _messageId = 65535;

  // ------------------------------------------------------------ סיווג

  /// `2543 תוצאות`. הספרות עשויות לכלול פסיקים.
  static final RegExp _leadingCount = RegExp(r'^\s*(\d[\d,]*)\s');

  /// `נמצאו 2543 תוצאות    1-6`. באנגלית ובצרפתית לא נמדד.
  static final RegExp _foundCount = RegExp(
    r'(?:נמצאו|found|trouvé\S*)\s+(\d[\d,]*)',
    caseSensitive: false,
  );

  static final RegExp _whitespace = RegExp(r'\s+');

  /// מה שעל המסך ← מה בר אילן השיב. סיכום קודם למודאל "מידע", והוא לחלון
  /// התוצאות: חלון בלי סיכום עוד עשוי לקבל אותו.
  static ResponsaSearchOutcome classify({
    required ResponsaVersionProfile profile,
    required List<ResponsaDialogSnapshot> dialogs,
    Iterable<String> newMdiTitles = const [],
    bool anyWindowIsResult = false,
  }) {
    String? window;
    int? windowCount;
    for (final title in newMdiTitles) {
      if (_count(_foundCount, title) case final count?) {
        window = title;
        windowCount = count;
        break;
      }
    }
    // "חיפוש בניסוח חופשי" פותח חלון תוצאות בלי "נמצאו N" בכותרת (`    1-6`,
    // נמדד ב-CD25), ובלי מודאל סיכום: כל חלון חדש הוא התשובה.
    if (window == null && anyWindowIsResult && newMdiTitles.isNotEmpty) {
      window = newMdiTitles.first.trim();
    }

    for (final dialog in dialogs) {
      if (!ResponsaDiscovery.titleMatches(
        dialog.title,
        profile.searchSummaryHints,
      )) {
        continue;
      }
      final count = _count(_leadingCount, dialog.title);
      if (count == null || !_hasButtons(dialog, profile.searchSummaryHints)) {
        continue;
      }
      return ResponsaSearchOutcome(
        ResponsaSearchState.found,
        count: count,
        window: window,
        summaryShown: true,
      );
    }

    for (final dialog in dialogs) {
      if (ResponsaDiscovery.titleMatches(dialog.title, queryErrorHints)) {
        final message = dialog.message?.replaceAll(_whitespace, ' ').trim();
        return ResponsaSearchOutcome(
          ResponsaSearchState.invalid,
          message: message == null || message.isEmpty ? null : message,
        );
      }
      if (ResponsaDiscovery.titleMatches(dialog.title, formsHints)) {
        return const ResponsaSearchOutcome(ResponsaSearchState.forms);
      }
    }

    for (final dialog in dialogs) {
      if (!ResponsaDiscovery.titleMatches(
        dialog.title,
        profile.infoModalHints,
      )) {
        continue;
      }
      final asks = dialog.buttons.any(
        (b) => _matches(b, ResponsaVersionProfile.questionButtonHints),
      );
      final message = dialog.message?.replaceAll(_whitespace, ' ').trim();
      return ResponsaSearchOutcome(
        asks ? ResponsaSearchState.asked : ResponsaSearchState.refused,
        message: message == null || message.isEmpty ? null : message,
      );
    }

    if (window != null) {
      return ResponsaSearchOutcome(
        ResponsaSearchState.found,
        count: windowCount,
        window: window,
      );
    }
    return ResponsaSearchOutcome.pending;
  }

  static int? _count(RegExp pattern, String title) {
    final digits = pattern.firstMatch(title)?.group(1);
    return digits == null ? null : int.tryParse(digits.replaceAll(',', ''));
  }

  static bool _hasButtons(ResponsaDialogSnapshot dialog, DialogHints hints) =>
      hints.controls
          .where((c) => c.required && c.classNames.contains('Button'))
          .every((c) => dialog.buttons.any((b) => _matches(b, c)));

  /// כמו בגילוי המבני, מזהה או טקסט; '&' הוא סמן מקש-קיצור.
  static bool _matches(({int id, String text}) button, ControlHints hints) =>
      hints.controlIds.contains(button.id) ||
      hints.textContains.any(button.text.replaceAll('&', '').contains);
}
