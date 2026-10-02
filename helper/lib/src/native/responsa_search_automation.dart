import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_discovery.dart';
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

  /// הכפתור שעובר ל"חיפוש מתקדם", והפקד שקיים רק בו ("תרגום לארמית").
  static const int _advancedModeButtonId = 1209;
  static const int _advancedOnlyId = 1065;

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

    var dialog = ensureSearchDialog(deadline);
    if (setup.advanced) dialog = _ensureAdvanced(dialog, deadline);
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
      dialog = ensureSearchDialog(deadline);
      if (setup.advanced) dialog = _ensureAdvanced(dialog, deadline);
    }
    final restore = _applyChecks(dialog.hwnd, setup.checks);
    try {
      return _run(query, dialog, deadline, main, client, before, atLimit);
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
    bool atLimit,
  ) {
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

  /// חלון החיפוש במצב "חיפוש מתקדם". בר אילן זוכר את הסוג האחרון שנבחר,
  /// וב"חיפוש קל" התחביר היה נקרא כמילים.
  DiscoveredDialog _ensureAdvanced(
    DiscoveredDialog dialog,
    ResponsaDeadline deadline,
  ) {
    if (_hasChild(dialog.hwnd, _advancedOnlyId)) return dialog;
    final button = _childById(dialog.hwnd, _advancedModeButtonId);
    if (button == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.searchDialogNotFound,
        'בחלון החיפוש של בר אילן אין מעבר ל"חיפוש מתקדם"',
      );
    }
    ResponsaWin32.postClick(button);
    final own = deadline.within(ResponsaAutomation.dialogBudget);
    while (!own.expired) {
      _automation.pause(ResponsaAutomation.poll, deadline);
      final found = findSearchDialog();
      if (found != null && _hasChild(found.hwnd, _advancedOnlyId)) {
        return found;
      }
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.searchDialogNotFound,
      'בר אילן לא עבר ל"חיפוש מתקדם" בזמן',
    );
  }

  /// מסמן או מנקה תיבות לפי [wanted], ומחזיר את אלה ששונו עם מצבן הקודם.
  /// בלחיצה ולא ב-`BM_SETCHECK`: בר אילן קורא את ההגדרה מהלחיצה, ותיבה
  /// שסומנה בהודעה בלבד אינה משפיעה על החיפוש (נמדד).
  Map<int, bool> _applyChecks(int dialog, Map<int, bool> wanted) {
    final changed = <int, bool>{};
    for (final MapEntry(key: id, value: on) in wanted.entries) {
      final box = _childById(dialog, id);
      if (box == null) continue;
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
