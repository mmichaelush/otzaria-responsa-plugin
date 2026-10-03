import 'dart:io';

import 'package:responsa_helper/src/log.dart';

import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';
import 'package:responsa_helper/src/text/responsa_names.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';

/// תוצאת פתיחה מוצלחת.
class ResponsaOpenOutcome {
  /// כותרת חלון ה-MDI שנפתח, כפי שנקראה מהתוכנה.
  final String window;

  /// ההפניה שבה השתמשנו בפועל — עשויה להיות קצרה מזו שנשלחה.
  final String usedRef;

  final String selectedResult;
  final int resultCount;
  final bool isNew;
  final int releasedWindows;

  /// לאבחון: הפניה שנפתחת רק בחוליה מאוחרת מעידה על כשל בבניית הקטלוג,
  /// לא על תקלה בתוכנה.
  final List<String> triedRefs;

  /// האם החלון הגיע לחזית. `false` לא מכשיל את הפתיחה, אבל מסביר משתמש
  /// שרואה רק הבהוב בשורת המשימות.
  final bool broughtToFront;

  const ResponsaOpenOutcome({
    required this.window,
    required this.usedRef,
    required this.selectedResult,
    required this.resultCount,
    required this.isNew,
    required this.releasedWindows,
    this.triedRefs = const [],
    this.broughtToFront = true,
  });
}

/// תקציב זמן לפעולה שלמה.
class ResponsaDeadline {
  final Stopwatch _watch = Stopwatch()..start();
  final Duration budget;

  ResponsaDeadline(this.budget);

  Duration get remaining => budget - _watch.elapsed;
  bool get expired => remaining <= Duration.zero;

  /// תקציב משנה לחוליה אחת, שלעולם אינו חורג מהתקציב הכולל.
  ResponsaDeadline within(Duration cap) =>
      ResponsaDeadline(remaining < cap ? remaining : cap);
}

/// אוטומציה חוסמת מול מופע חי של פרויקט השו"ת - חייבת לרוץ באיזולט רקע.
/// `WM_CLOSE` מפיל את התוכנה: מודאל נסגר בכפתור האישור, חלון MDI ב-`WM_MDIDESTROY`.
class ResponsaAutomation {
  final int pid;
  final ResponsaVersionProfile profile;

  /// החלונות שאוצריא פתחה (רק אותם מותר לשחרר). נמסרת מבחוץ כי כל פתיחה
  /// רצה באיזולט משלה, ורשימה פנימית הייתה מתה עם המחלקה.
  final List<String> _openedWindows;

  /// הבקר שומר אותם ומחזיר אותם לפתיחה הבאה.
  List<String> get openedWindows => List.unmodifiable(_openedWindows);

  ResponsaAutomation({
    required this.pid,
    required this.profile,
    List<String> openedWindows = const [],
  }) : _openedWindows = [...openedWindows];

  static const Duration poll = Duration(milliseconds: 250);

  /// כל כמה זמן לשלוח שוב את פקודת פתיחת דיאלוג העיון.
  static const Duration commandRepeat = Duration(seconds: 3);

  /// הדיאלוג נפתח ב-1–2 שניות כשהכול תקין; תקציב נדיב לא מציל מצב תקוע,
  /// רק מכפיל את זמן הכשל בכל חוליה.
  static const Duration dialogBudget = Duration(seconds: 12);

  /// נפרד מתקציב הפעולה, אחרת חוליה אחת שנתקעת בניקוי תוקעת את כל הסולם.
  static const Duration clearBudget = Duration(seconds: 10);

  /// תקציב להמתנה לחלון הספר אחרי לחיצה מוצלחת על "הצג טקסט".
  static const Duration windowBudget = Duration(seconds: 45);

  /// התוכנה עסוקה בציור החלון החדש, וקריאה מיידית אחריו נבלעת.
  static const Duration _afterOpenSettle = Duration(seconds: 1);

  bool Function() cancelled = _neverCancelled;
  static bool _neverCancelled() => false;

  void pause(Duration duration, ResponsaDeadline deadline) {
    final end = Stopwatch()..start();
    while (end.elapsed < duration) {
      checkpoint(deadline);
      // השעון עלול לחרוג כבר אחרי תנאי הלולאה, ו-`sleep` עם משך שלילי זורק.
      final left = duration - end.elapsed;
      if (left <= Duration.zero) break;
      sleepFor(left < poll ? left : poll);
    }
    checkpoint(deadline);
  }

  void checkpoint(ResponsaDeadline deadline) {
    if (cancelled()) {
      throw const ResponsaAutomationException(
        ResponsaFailure.cancelled,
        'הפעולה בוטלה',
      );
    }
    if (deadline.expired) {
      throw const ResponsaAutomationException(
        ResponsaFailure.timeout,
        'חריגה מתקציב הזמן של הפעולה',
      );
    }
  }

  /// ניתנת להחלפה בבדיקות. `sleep` חוסם מותר כאן רק כי המחלקה רצה באיזולט
  /// רקע ולא על ה-UI isolate.
  static void Function(Duration) sleepFor = sleep;

  int get mainWindow {
    final hwnd = ResponsaDiscovery.findMainWindow(pid, profile);
    if (hwnd == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.responsaNotRunning,
        'לא נמצא חלון ראשי של פרויקט השו"ת',
      );
    }
    return hwnd;
  }

  bool get isRunning => ResponsaDiscovery.findMainWindow(pid, profile) != null;

  // -------------------------------------------------------- מודאל "מידע"

  /// מודאל "מידע" פתוח חוסם את כל הערוץ (כל הפניה מחזירה 0 תוצאות).
  /// מחזיר כמה נראו ולא כמה נסגרו: עצם הופעתו היא תשובה סופית של המנתח.
  /// שאלה נענית ב"ביטול", לעולם לא ב"כן": "כן" מריץ פעולה חדשה.
  int dismissInfoModals({int limit = 5}) {
    var seen = 0;
    for (var attempt = 0; attempt < limit; attempt++) {
      final modals = ResponsaDiscovery.discoverAll(pid, profile.infoModalHints);
      if (modals.isEmpty) return seen;
      for (final modal in modals) {
        final ok = modal.handle('ok_button');
        final button = ok ?? modal.handle('cancel_button');
        if (button != null) {
          if (ok == null) {
            final message = switch (modal.handle('message')) {
              final text? => ResponsaWin32.windowText(text),
              null => '',
            };
            logLine('ResponsaAutomation: שאלה פתוחה נסגרה בביטול: $message');
          }
          ResponsaWin32.click(button);
        }
        seen++;
      }
      sleepFor(const Duration(milliseconds: 400));
    }
    // מודאל ששרד את כל הניסיונות חוסם את הערוץ לכל מה שיבוא אחריו.
    logLine('ResponsaAutomation: מודאל "מידע" לא נסגר אחרי $limit ניסיונות');
    return seen;
  }

  // ------------------------------------------------------- דיאלוג העיון

  DiscoveredDialog? findCitationDialog() =>
      ResponsaDiscovery.discoverDialog(pid, profile.citationDialogHints);

  /// הפקודה נשלחת שוב ושוב: אחרי פתיחת ספר התוכנה עסוקה בציור החלון החדש,
  /// ופקודה בודדת באותו רגע נבלעת.
  DiscoveredDialog ensureCitationDialog(ResponsaDeadline deadline) {
    final existing = findCitationDialog();
    if (existing != null) return existing;

    final main = mainWindow;
    final own = deadline.within(dialogBudget);
    Stopwatch? sinceCommand;
    while (!own.expired && !deadline.expired) {
      if (sinceCommand == null || sinceCommand.elapsed >= commandRepeat) {
        ResponsaWin32.postCommand(main, profile.browseCommand);
        sinceCommand = Stopwatch()..start();
      }
      pause(const Duration(milliseconds: 600), deadline);
      final found = findCitationDialog() ?? _switchToCitationTab(deadline);
      if (found != null) return found;
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.citationDialogNotFound,
      'דיאלוג העיון לא נפתח בזמן שהוקצב',
    );
  }

  /// מעביר את דיאלוג העיון לעמוד "כתיבת מקורות". ה-TabControl נמצא לפי
  /// מחלקתו, לא לפי מזהה.
  DiscoveredDialog? _switchToCitationTab(ResponsaDeadline deadline) {
    for (final dialog in ResponsaDiscovery.candidateDialogs(
      pid,
      profile.citationDialogHints,
    )) {
      for (final child in ResponsaWin32.children(dialog)) {
        if (ResponsaWin32.className(child) == 'SysTabControl32') {
          ResponsaWin32.setTabFocus(child, profile.citationTabIndex);
          pause(const Duration(milliseconds: 800), deadline);
        }
      }
    }
    return findCitationDialog();
  }

  // ------------------------------------------------- ניקוי רשימת התוצאות

  void clearResults(DiscoveredDialog dialog, ResponsaDeadline deadline) {
    final results = dialog.handle('results_list');
    if (results == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'לא נמצאה רשימת התוצאות',
      );
    }

    final clearButton = dialog.handle('clear_button');
    if (clearButton != null) ResponsaWin32.click(clearButton);

    // רשימת התוצאות לא מתנקה מאליה, והספירה אחריה תשקר. `clear_button` אינו
    // חובה, ובלי תקציב משלו הלולאה שורפת את כל הפעולה על חוליה אחת.
    final own = deadline.within(clearBudget);
    while (!own.expired) {
      // `-1` = הרשימה לא ענתה, וזה אינו "ריקה".
      if (ResponsaWin32.listBoxCount(results) == 0) return;
      pause(poll, deadline);
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.resultsNotCleared,
      'רשימת התוצאות לא התנקתה — הספירה שאחריה אינה אמינה',
    );
  }

  // ------------------------------------------------------ ניתוח הפניה

  /// רשימה ריקה = ההפניה לא נותחה. זה מצב חוקי, לא חריג. [limit] — כמה
  /// תוצאות לקרוא לכל היותר.
  ({DiscoveredDialog dialog, List<String> results}) parseReference(
    String reference,
    ResponsaDeadline deadline, {
    int attempts = 3,
    Duration settle = const Duration(milliseconds: 1200),
    int? limit,
  }) {
    dismissInfoModals();
    final dialog = ensureCitationDialog(deadline);
    clearResults(dialog, deadline);

    final edit = dialog.handle('reference_edit');
    final search = dialog.handle('search_button');
    final results = dialog.handle('results_list');
    if (edit == null || search == null || results == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'עמוד כתיבת המקורות אינו שלם',
      );
    }

    ResponsaWin32.setWindowText(edit, reference);
    // לא `click`: הפניה שלא נותחה פותחת בתוך הלחיצה את "לא נמצאה כל
    // תוצאה!", ו-BM_CLICK סינכרוני ממתין עד שהמודאל נסגר — 15 שניות.
    if (!ResponsaWin32.postClick(search)) {
      throw const ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'עמוד כתיבת המקורות נסגר',
      );
    }
    var count = 0;
    var waitFor = settle;
    var limit = attempts;
    var reposted = false;
    for (var attempt = 0; attempt < limit; attempt++) {
      pause(waitFor, deadline);
      // המודאל "לא נמצאה כל תוצאה!" הוא תשובה סופית, לא כשל זמני.
      if (dismissInfoModals() > 0) {
        return (dialog: dialog, results: const <String>[]);
      }
      count = ResponsaWin32.listBoxCount(results);
      if (count > 0) break;
      // לוחצים שוב רק כשהתוכנה ענתה ואין תוצאה — הלחיצה לא נקלטה (טעינה
      // קרה). `-1` = עוד מחפשת: לחיצה נוספת הייתה מריצה את החיפוש פעם
      // שנייה, וממלאת מחדש את הרשימה בזמן שקוראים אותה. אחרי הניסיון האחרון
      // הלחיצה החוזרת מקבלת המתנה משלה.
      if (count == 0 && (attempt + 1 < limit || !reposted)) {
        ResponsaWin32.postClick(search);
        if (attempt + 1 == limit) limit++;
        reposted = true;
      }
      waitFor += const Duration(seconds: 1);
    }

    if (count <= 0) return (dialog: dialog, results: const <String>[]);
    return (
      dialog: dialog,
      results: ResponsaWin32.listBoxItems(results, limit: limit),
    );
  }

  // ------------------------------------------------- שחרור חלונות MDI

  /// חלון שאוצריא יצרה, ולכן מותר לשחרר אותו בתקרה.
  void adoptWindow(String title) {
    if (title.isNotEmpty && !_openedWindows.contains(title)) {
      _openedWindows.add(title);
    }
  }

  /// בכ-22 חלונות התוכנה מפסיקה בשקט ליצור חלונות. עד התקרה הקשה נסגרים רק
  /// חלונות שאוצריא פתחה; מעליה גם אחרים, במינימום ולעולם לא הפעיל.
  int releaseMdiWindows(int main) {
    final titles = ResponsaWin32.mdiTitles(main);
    if (titles.length < profile.mdiSoftLimit) return 0;

    // כותרת ריקה אינה נסגרת לעולם: `windowText` מחזיר '' גם לחלון שלא ענה,
    // ו-'' ברשימת היעד היה סוגר כל חלון כזה.
    final present = titles.where((title) => title.isNotEmpty).toSet();
    final wanted = <String>{
      for (final title in _openedWindows)
        if (present.contains(title)) title,
    };

    if (titles.length >= profile.mdiHardLimit) {
      final active = ResponsaWin32.mdiActiveTitle(main);
      final needed = titles.length - profile.mdiSoftLimit + 1;
      for (final title in present) {
        if (wanted.length >= needed) break;
        if (title == active || wanted.contains(title)) continue;
        wanted.add(title);
      }
      logLine(
        'ResponsaAutomation: ${titles.length} חלונות — מעל התקרה הקשה; '
        'נסגרים ${wanted.length}',
      );
    }

    final surplus = titles.length - profile.mdiKeep;
    final toClose = wanted.take(surplus < 0 ? 0 : surplus).toSet();
    if (toClose.isEmpty) return 0;

    final client = ResponsaWin32.mdiClient(main);
    if (client == null) return 0;
    var closed = 0;
    for (final child in ResponsaWin32.directChildren(client)) {
      if (closed >= toClose.length) break;
      final title = ResponsaWin32.windowText(child);
      if (title.isEmpty || !toClose.contains(title)) continue;
      ResponsaWin32.destroyMdiChild(main, child);
      closed++;
      sleepFor(const Duration(milliseconds: 200));
    }
    _openedWindows.removeWhere(toClose.contains);
    return closed;
  }

  // -------------------------------------------------------- פתיחת ספר

  /// [references] לפי סדר יורד של סיכוי. אין השמטת מילים מההתחלה בכוונה:
  /// היא מייצרת שברי שם גנריים (`פסחים`) שפותחים ספר אחר.
  ///
  /// [parsed] — רשימה שכבר נותחה מההפניה הראשונה ([parseReference]), כדי לא
  /// לנתח שוב; אז נפתחת התוצאה [resultIndex] שהמשתמש בחר.
  ResponsaOpenOutcome openBook(
    List<String> references,
    ResponsaDeadline deadline, {
    String? expectedTitle,
    int? resultIndex,
    bool checkReference = true,
    ({DiscoveredDialog dialog, List<String> results})? parsed,
  }) {
    final ladder = [
      for (final reference in references)
        if (reference.trim().isNotEmpty) reference.trim(),
    ];
    if (ladder.isEmpty) {
      throw const ResponsaAutomationException(
        ResponsaFailure.referenceNotParsed,
        'לא נמסרה הפניה לפתיחה',
      );
    }
    final openRef = ladder.first;

    final main = mainWindow;
    final released = releaseMdiWindows(main);
    final before = ResponsaWin32.mdiTitles(main).toSet();
    final atLimit = before.length >= profile.mdiSoftLimit;

    final tried = <String>[];
    var usedRef = openRef;
    DiscoveredDialog? dialog;
    var results = const <String>[];
    // נסיגה שאינה עוצרת את הסולם. נשמרת ההפניה ולא התוצאות: כל חוליה אחריה
    // מנקה את הרשימה, ובחירה לפי אינדקס הייתה בוחרת שורה אחרת.
    String? fallbackRef;
    if (parsed != null && parsed.results.isNotEmpty) {
      tried.add(openRef);
      dialog = parsed.dialog;
      results = parsed.results;
    }
    for (final candidate in dialog == null ? ladder : const <String>[]) {
      if (tried.contains(candidate)) continue;
      tried.add(candidate);
      // ניסיון חוזר רק לחוליה הראשונה: כל ניסיון עולה ~5 שניות בלי לשנות
      // תוצאה.
      final attempt = parseReference(
        candidate,
        deadline,
        attempts: tried.length == 1 ? 2 : 1,
      );
      if (attempt.results.isEmpty) continue;
      if (hasPlausibleResult(attempt.results, candidate, expectedTitle)) {
        usedRef = candidate;
        dialog = attempt.dialog;
        results = attempt.results;
        break;
      }
      fallbackRef ??= candidate;
    }
    if (dialog == null && fallbackRef != null) {
      // אין תוצאה משכנעת: מריצים מחדש את הנסיגה ונותנים לאימות הכותרת,
      // המדויק יותר, להכריע.
      final again = parseReference(fallbackRef, deadline);
      if (again.results.isNotEmpty) {
        usedRef = fallbackRef;
        dialog = again.dialog;
        results = again.results;
      }
    }
    if (dialog == null || results.isEmpty) {
      throw ResponsaAutomationException(
        ResponsaFailure.referenceNotParsed,
        'פרויקט השו"ת לא זיהה אף אחת מההפניות לספר',
        {'ref': openRef, 'tried': tried},
      );
    }

    final index = resultIndex ?? bestResult(results, usedRef, expectedTitle);
    if (index >= results.length) {
      throw ResponsaAutomationException(
        ResponsaFailure.referenceNotParsed,
        'התוצאה $index אינה קיימת',
        {'ref': openRef, 'resultCount': results.length},
      );
    }

    final chosen = results[index];
    final listBox = dialog.handle('results_list');
    final showButton = dialog.handle('show_text_button');
    if (listBox == null || showButton == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.citationDialogNotFound,
        'חסר פקד בעמוד כתיבת המקורות',
      );
    }

    ResponsaWin32.listBoxSelect(dialog.container, listBox, index);
    pause(const Duration(milliseconds: 400), deadline);
    // `false` = התוכנה תקועה והבקשה לא התקבלה; המתנה לחלון הייתה שורפת את
    // כל התקציב ומדווחת "פג הזמן".
    if (!ResponsaWin32.click(showButton)) {
      throw ResponsaAutomationException(
        ResponsaFailure.timeout,
        'פרויקט השו"ת לא הגיב ללחיצה על "הצג טקסט"',
        {'ref': openRef, 'usedRef': usedRef},
      );
    }

    final String title;
    try {
      title = _awaitBookWindow(main, before, chosen, expectedTitle, deadline);
    } on ResponsaAutomationException catch (error) {
      // בתקרה, "אין חלון חדש" אינו איטיות אלא סירוב שקט של התוכנה.
      if (error.failure == ResponsaFailure.timeout && atLimit) {
        throw ResponsaAutomationException(
          ResponsaFailure.mdiWindowLimitReached,
          'פרויקט השו"ת אינו פותח חלונות נוספים — יש לסגור חלונות בתוכנה',
          {'windows': before.length},
        );
      }
      rethrow;
    }

    // נרשם כשלנו לפני האימות ולפני כל מה שיכול לזרוק: חלון שנפסל ולא נרשם
    // לא ישוחרר לעולם, והמופע מצטבר עד שהוא מפסיק לפתוח.
    if (!before.contains(title)) adoptWindow(title);

    dismissInfoModals();
    sleepFor(_afterOpenSettle);

    final failed = verifyOpened(
      window: title,
      selectedResult: chosen,
      usedRef: usedRef,
      expectedTitle: expectedTitle,
      checkReference: checkReference,
      selectedIsUniqueExact: uniqueExactResult(results, usedRef) == index,
    );
    if (failed.isNotEmpty) {
      throw ResponsaAutomationException(
        ResponsaFailure.openedWrongBook,
        'נפתח "$title" — אינו תואם ל${failed.join(', ')}',
        {'ref': openRef, 'usedRef': usedRef, 'actual': title},
      );
    }

    // מופע ממוזער או מוסתר מאחורי אוצריא נראה למשתמש כמו פתיחה שנכשלה.
    final broughtToFront = ResponsaWin32.bringToFront(main);

    final isNew = !before.contains(title);
    return ResponsaOpenOutcome(
      window: title,
      usedRef: usedRef,
      selectedResult: chosen,
      resultCount: results.length,
      isNew: isNew,
      releasedWindows: released,
      triedRefs: tried,
      broughtToFront: broughtToFront,
    );
  }

  /// סינון זול לפני פתיחת חלון. רך בכוונה: התוצאות בשפת התוכנה והכותרת של
  /// הקטלוג; רק פוסל חוליה לא קשורה, האימות עצמו נעשה על כותרת החלון.
  static bool hasPlausibleResult(
    List<String> results,
    String reference,
    String? expectedTitle,
  ) {
    final wanted = expectedTitle == null
        ? reference
        : ResponsaNames.withoutQualifier(expectedTitle);
    if (wanted.trim().isEmpty) return true;
    if (results.any((result) => ResponsaHebrew.coversTitle(wanted, result))) {
      return true;
    }
    // כמו ב-[verifyOpened]: תוצאה יחידה שהיא בדיוק ההפניה שנשלחה, כשאינה
    // קיצור של השם (`גינת ורדים כלל א` של `גינת ורדים כללים`). בלי זה הסולם
    // ממשיך לחוליות שנכשלות, וחוזר אליה רק אחרי כחצי דקה.
    return expectedTitle != null &&
        !ResponsaHebrew.normalize(
          wanted,
        ).startsWith(ResponsaHebrew.normalize(reference)) &&
        uniqueExactResult(results, reference) != null;
  }

  /// האינדקס של התוצאה היחידה שהיא בדיוק [reference]. `null` כשאין כזו, וגם
  /// כשיש כמה: אז הבקשה עמומה (`גינת ורדים כלל א` גם בשו"ת גינת ורדים),
  /// ואין לוותר על אימות הכותרת.
  static int? uniqueExactResult(List<String> results, String reference) {
    int? found;
    for (var index = 0; index < results.length; index++) {
      if (ResponsaHebrew.matchLevel(reference, results[index]) !=
          ResponsaMatchLevel.exact) {
        continue;
      }
      if (found != null) return null;
      found = index;
    }
    return found;
  }

  /// הבדיקות שכותרת החלון לא עברה; ריק = הספר הנכון. כל הרפיה כאן היא ספר
  /// שגוי שמדווח כהצלחה.
  ///
  /// [checkReference] כבוי במקום שהמשתמש כתב (`בראשית ב ג`): הוא בחר את
  /// התוצאה בעצמו, והכותרת כתובה אחרת (`בראשית פרק ב פסוק ג`).
  ///
  /// [selectedIsUniqueExact] — התוצאה שנבחרה היא היחידה ברשימה שהיא בדיוק
  /// [usedRef] ([uniqueExactResult]). רק אז מותר לוותר על הכותרת המצופה.
  static List<String> verifyOpened({
    required String window,
    required String selectedResult,
    required String usedRef,
    String? expectedTitle,
    bool checkReference = true,
    bool selectedIsUniqueExact = false,
  }) {
    final failed = <String>[
      if (ResponsaHebrew.matchLevel(selectedResult, window) ==
          ResponsaMatchLevel.none)
        'selectedResult',
      // המקום היחיד שמהדורה נבדקת - שאר ההשוואות מתעלמות מסוגריים בכוונה.
      if (ResponsaHebrew.editionsConflict(selectedResult, window))
        'selectedEdition',
      if (checkReference && !ResponsaHebrew.coversTitle(usedRef, window))
        'requestedRef',
    ];
    if (expectedTitle != null) {
      final expected = ResponsaNames.withoutQualifier(expectedTitle);
      // בר אילן פתח בדיוק את מה שביקשנו, בחוליה שאינה קיצור של השם ובלי
      // תוצאה מתחרה: יחידה שבר אילן משמיט משם החלון (`גינת ורדים כלל א` של
      // `גינת ורדים כללים`) אינה ספר שגוי. שם החיבור לבדו פותח את הספר
      // שמעליו, ולכן אינו נחשב.
      final exactRequest =
          selectedIsUniqueExact &&
          ResponsaHebrew.matchLevel(usedRef, window) ==
              ResponsaMatchLevel.exact &&
          !ResponsaHebrew.normalize(
            expected,
          ).startsWith(ResponsaHebrew.normalize(usedRef));
      if (!exactRequest && !ResponsaHebrew.coversTitle(expected, window)) {
        failed.add('expectedTitle');
      }
    }
    return failed;
  }

  /// `result[0]` אינו אמין בשם גנרי. הכותרת המצופה קודמת להפניה: בחוליית
  /// נסיגה ההפניה מתארת שאילתה רחבה ולא את הספר.
  static int bestResult(
    List<String> results,
    String openRef,
    String? expectedTitle,
  ) {
    final expected = expectedTitle == null
        ? null
        : ResponsaNames.withoutQualifier(expectedTitle);
    var bestIndex = 0;
    var bestScore = (-1, -1, -1, -1);
    for (var index = 0; index < results.length; index++) {
      // מהדורה סותרת יורדת לתחתית כבר כאן: פסילה באימות מונעת ספר שגוי אבל
      // לא פותחת את הנכון.
      final editionRank =
          expectedTitle != null &&
              ResponsaHebrew.editionsConflict(expectedTitle, results[index])
          ? 0
          : 1;
      // ספירת אסימונים ולא כן/לא: כותרת שאינה מוכלת באף שורה מחזירה
      // שוויון בינארי בין כל השורות, וספירה מבדילה ביניהן.
      final score = (
        editionRank,
        expected == null
            ? 0
            : ResponsaHebrew.sharedTokenCount(expected, results[index]),
        expected == null
            ? 0
            : ResponsaHebrew.matchLevel(expected, results[index]).rank,
        ResponsaHebrew.matchLevel(openRef, results[index]).rank,
      );
      if (_outranks(score, bestScore)) {
        bestIndex = index;
        bestScore = score;
      }
    }
    return bestIndex;
  }

  static bool _outranks((int, int, int, int) a, (int, int, int, int) b) {
    if (a.$1 != b.$1) return a.$1 > b.$1;
    if (a.$2 != b.$2) return a.$2 > b.$2;
    if (a.$3 != b.$3) return a.$3 > b.$3;
    return a.$4 > b.$4;
  }

  String _awaitBookWindow(
    int main,
    Set<String> before,
    String chosen,
    String? expectedTitle,
    ResponsaDeadline deadline,
  ) {
    final targets = [?expectedTitle, chosen];
    // חציון הפתיחה 2.8 שניות; מופע שלא יצר חלון תוך [windowBudget] תקוע.
    final own = deadline.within(windowBudget);
    while (!own.expired) {
      checkpoint(deadline);
      final titles = ResponsaWin32.mdiTitles(main);
      final fresh = [
        for (final title in titles)
          if (title.isNotEmpty && !before.contains(title)) title,
      ];
      for (final title in fresh) {
        if (targets.any((t) => ResponsaHebrew.titlesMatch(t, title))) {
          return title;
        }
      }
      // חלון קיים שתואם: שחזור-הסשן פותח חלונות בעלייה, ולכן ספר
      // שכבר פתוח לא ייצור חלון נוסף.
      for (final title in titles) {
        if (title.isNotEmpty &&
            targets.any((t) => ResponsaHebrew.titlesMatch(t, title))) {
          return title;
        }
      }
      // חלון חדש יחיד שאינו תואם מתקבל והאימות יכריע. לא כשיש כמה: שחזור
      // הסשן מוסיף חלונות "חדשים" גם דקות אחרי העלייה.
      if (fresh.length == 1) return fresh.single;
      sleepFor(poll);
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.timeout,
      'לא נפתח חלון ספר בזמן שהוקצב',
    );
  }
}
