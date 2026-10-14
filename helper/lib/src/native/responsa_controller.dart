import 'dart:async';
import 'dart:io';
import 'dart:isolate';

import 'package:meta/meta.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';
import 'package:responsa_helper/src/native/responsa_instance.dart';
import 'package:responsa_helper/src/native/responsa_launcher.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';

/// מצב פרויקט השו"ת כפי שאוצריא רואה אותו.
class ResponsaStatus {
  final bool installed;
  final bool running;
  final int? version;
  final String? installPath;
  final int? pid;
  final ResponsaVersionConfidence confidence;
  final List<ResponsaInstallation> installations;

  const ResponsaStatus({
    required this.installed,
    required this.running,
    required this.confidence,
    this.version,
    this.installPath,
    this.pid,
    this.installations = const [],
  });

  static const ResponsaStatus notInstalled = ResponsaStatus(
    installed: false,
    running: false,
    confidence: ResponsaVersionConfidence.unknown,
  );

  /// אין רשימת גרסאות נתמכות - המבנה נבדק בזמן הפתיחה, ולכן כל מהדורה
  /// מותקנת היא מועמדת.
  bool get canOpen => installed;
}

/// תוצאת פתיחה כפי שהיא חוזרת ל-UI. `ok == false` הוא ערך, לא חריג.
class ResponsaOpenReport {
  final bool ok;
  final ResponsaFailure? failure;
  final String? message;
  final String? window;
  final String? usedRef;

  /// ההפניות שנוסו. בכשל זה מה שהופך "לא נמצא" להודעה שאפשר לפעול לפיה.
  final List<String> triedRefs;

  /// כותרות החלונות שאוצריא פתחה במופע, כולל מפתיחות קודמות.
  final List<String> openedWindows;

  final bool broughtToFront;

  /// מקום מדויק עם כמה תוצאות ([ResponsaController.locate] בלי אינדקס): לא
  /// נפתח דבר, ואלה התוצאות לבחירה, בשפת התוכנה.
  final List<String> choices;

  const ResponsaOpenReport({
    required this.ok,
    this.failure,
    this.message,
    this.window,
    this.usedRef,
    this.triedRefs = const [],
    this.openedWindows = const [],
    this.broughtToFront = false,
    this.choices = const [],
  });
}

/// תוצאת חיפוש כפי שהיא חוזרת ל-UI. `ok == false` הוא ערך, לא חריג.
class ResponsaSearchReport {
  final bool ok;
  final ResponsaFailure? failure;

  /// הסבר הכשל. הטקסט של בר אילן עצמו נמצא ב-[outcome].
  final String? message;

  final ResponsaSearchOutcome? outcome;

  /// כמו בפתיחה: חלון התוצאות נוסף לחלונות שאוצריא פתחה.
  final List<String> openedWindows;

  const ResponsaSearchReport({
    required this.ok,
    this.failure,
    this.message,
    this.outcome,
    this.openedWindows = const [],
  });
}

/// "פתיחת בר אילן": החלון הראשי הובא לחזית (מופעל קודם, כשצריך).
class ResponsaShowReport {
  final bool ok;
  final ResponsaFailure? failure;
  final String? message;

  /// Windows עשוי לסרב להעביר את החזית; אז החלון רק משוחזר מהמזעור.
  final bool broughtToFront;

  const ResponsaShowReport({
    required this.ok,
    this.failure,
    this.message,
    this.broughtToFront = false,
  });
}

/// הגבול בין השרת האסינכרוני לאוטומציה החוסמת: כל פעולה חוסמת רצה באיזולט
/// רקע, כדי שהשירות ימשיך לענות (גם ל-`/health`) בזמן שבר אילן עובד.
class ResponsaController {
  ResponsaController({bool Function()? allowAutoStart})
    : _allowAutoStart = allowAutoStart ?? _always;

  static bool _always() => true;

  final bool Function() _allowAutoStart;

  /// נקרא מחדש בכל פעם ולא נלכד בבנייה: הבקר נוצר לפני שהמשתמש מדליק את
  /// ההגדרה, וערך לכוד היה נשאר `false` עד הפעלה מחדש.
  bool get autoStart => _allowAutoStart();

  /// פתיחה וחיפוש חולקים אותו: שתי פעולות חופפות מתחרות על אותו מופע
  /// ומשאירות חלונות פתוחים שאיש אינו סוגר.
  var _busy = false;

  /// כאן ולא באוטומציה, כי כל פתיחה רצה באיזולט משלה; בלעדיה
  /// `releaseMdiWindows` לא מכיר את חלונותינו וסוגר את של המשתמש.
  final List<String> _openedWindows = [];

  /// חלון ראשי אחרי הפעלה קרה עולה בדרך כלל תוך ~5 שניות; ב-CD32C במחשב
  /// איטי — 22 שניות, ופעם אחת יותר מ-40 (דיווחים 12–13.10.2026).
  static const Duration launchTimeout = Duration(seconds: 80);

  /// כל הבקשה, כולל הפעלת בר אילן: פחות מ-120 השניות שאחריהן אוצריא
  /// מוותרת. פעולה שנמשכת מעבר לזה מקפיצה חלון כשאיש כבר לא מחכה, ואחרי
  /// שהמשתמש קרא "השירות אינו פועל". הפעלה איטית מקצרת את מה שנשאר
  /// לפעולה עצמה ([_budget]).
  static const Duration requestBudget = Duration(seconds: 110);

  /// פתיחה רגילה אורכת כשלוש שניות.
  static const Duration openBudget = Duration(seconds: 60);

  /// כמו [openBudget]. חיפוש כבד אורך עד כ-15 שניות (ב-CD32C עד 25).
  static const Duration searchBudget = Duration(seconds: 60);

  /// מה שנשאר לפעולה אחרי ההפעלה: [budget], ולא יותר מהיתרה מ-
  /// [requestBudget].
  static Duration _budget(Stopwatch request, Duration budget) =>
      budgetAfter(request.elapsed, budget);

  @visibleForTesting
  static Duration budgetAfter(Duration elapsed, Duration budget) {
    final left = requestBudget - elapsed;
    return left < budget ? left : budget;
  }

  /// ההתקנות מהרישום ומסריקת הכוננים, ל-[status]. התוסף שואל כל כמה
  /// שניות, והסריקה ארכה 12.5 שניות במחשב עם כוננים איטיים (`/status` הגיע
  /// ל-37 שניות, והתוסף ויתר אחרי 15): נשמרת, ומתרעננת ברקע.
  List<ResponsaInstallation>? _installed;
  DateTime? _installedAt;
  Future<List<ResponsaInstallation>>? _refreshing;

  static const Duration installedMaxAge = Duration(minutes: 5);

  /// כשלא נמצאה אף התקנה: משתמש שמתקין עכשיו רואה אותה מהר.
  static const Duration _noneMaxAge = Duration(seconds: 30);

  Future<List<ResponsaInstallation>> _installations() async {
    final cached = _installed;
    final at = _installedAt;
    if (cached != null && at != null) {
      final age = DateTime.now().difference(at);
      if (age < (cached.isEmpty ? _noneMaxAge : installedMaxAge)) {
        return cached;
      }
    }
    final refresh = _refreshing ??= _discoverInstalled();
    if (cached == null) return refresh;
    // ישנה מחזירים מיד; הרענון רץ ברקע ומשמש בשאלה הבאה.
    unawaited(refresh);
    return cached;
  }

  Future<List<ResponsaInstallation>> _discoverInstalled() async {
    try {
      final found = await Isolate.run(
        ResponsaInstallationDiscovery.discoverInstalled,
      );
      _installed = found;
      _installedAt = DateTime.now();
      return found;
    } catch (error) {
      logLine('ResponsaController: discovery failed: $error');
      return _installed ?? const [];
    } finally {
      _refreshing = null;
    }
  }

  /// כמה מקומות לכל היותר מוחזרים לבחירה באיתור מקום.
  static const int maxLocateChoices = 1000;

  /// מצב ההתקנה והמופע. מהיר; אינו נוגע בתוכנה.
  Future<ResponsaStatus> status() async {
    if (!Platform.isWindows) return ResponsaStatus.notInstalled;
    final installed = await _installations();
    return Isolate.run(() => _readStatus(installed));
  }

  static ResponsaStatus _readStatus(List<ResponsaInstallation> installed) {
    final installations = ResponsaInstallationDiscovery.discover(
      installed: installed,
    );
    final usable = installations.where((i) => i.exists).toList();
    final live = ResponsaInstance.all();
    // "רץ" = יש מופע שאפשר לעבוד מולו; מופע חונה מחוץ למסך אינו נחשב.
    final active = ResponsaInstance.pick(live);

    int? version;
    if (active != null) {
      version = ResponsaInstallationDiscovery.versionFromWindowTitle(
        active.title,
      );
    }
    version ??= usable.isEmpty ? null : usable.first.version;

    if (usable.isEmpty && live.isEmpty) return ResponsaStatus.notInstalled;
    return ResponsaStatus(
      installed: usable.isNotEmpty || live.isNotEmpty,
      running: active != null,
      version: version,
      installPath: usable.isEmpty ? null : usable.first.installPath,
      pid: active?.pid,
      confidence: ResponsaVersionProfile.forVersion(version).confidence,
      installations: installations,
    );
  }

  /// [installPath] = ההתקנה שממנה נבנה הקטלוג: הפניה ממאגר אחד לא בהכרח
  /// מוליכה לאותו ספר במאגר אחר.
  Future<ResponsaOpenReport> openBook(
    List<String> references, {
    String? expectedTitle,
    String? installPath,
    bool? allowLaunch,
  }) async {
    if (!Platform.isWindows) {
      return const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: 'פתיחת ספרים בבר אילן נתמכת ב-Windows בלבד.',
      );
    }

    if (_busy) {
      return const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.busy,
        message: 'פעולה אחרת בבר אילן כבר מתבצעת. יש להמתין לסיומה.',
      );
    }
    _busy = true;
    final request = Stopwatch()..start();
    try {
      if (await _launchFailure(installPath, allowLaunch: allowLaunch)
          case final message?) {
        return ResponsaOpenReport(
          ok: false,
          failure: ResponsaFailure.responsaNotRunning,
          message: message,
        );
      }

      final report = await _runInIsolate(
        _OpenRequest(
          references: references,
          expectedTitle: expectedTitle,
          installPath: installPath,
          openedWindows: List.of(_openedWindows),
          budget: _budget(request, openBudget),
        ),
      );
      _keepOpenedWindows(report.openedWindows);
      return report;
    } finally {
      _busy = false;
    }
  }

  /// מקום מדויק שהמשתמש כתב (`בראשית ב ג`), בעמוד כתיבת המקורות של בר אילן.
  /// בלי [index] ועם יותר מתוצאה אחת — מחזיר את התוצאות ב-`choices`, בלי
  /// לפתוח. עם [index] — פותח את התוצאה הזו. [listOnly] — לעולם אינו פותח,
  /// גם בתוצאה אחת (לכלי מדידה).
  Future<ResponsaOpenReport> locate(
    String reference, {
    int? index,
    String? installPath,
    bool? allowLaunch,
    bool listOnly = false,
  }) async {
    if (!Platform.isWindows) {
      return const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: 'פתיחה בבר אילן נתמכת ב-Windows בלבד.',
      );
    }
    if (_busy) {
      return const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.busy,
        message: 'פעולה אחרת בבר אילן כבר מתבצעת. יש להמתין לסיומה.',
      );
    }
    _busy = true;
    final started = Stopwatch()..start();
    try {
      if (await _launchFailure(installPath, allowLaunch: allowLaunch)
          case final message?) {
        return ResponsaOpenReport(
          ok: false,
          failure: ResponsaFailure.responsaNotRunning,
          message: message,
        );
      }
      final request = _LocateRequest(
        reference: reference,
        index: index,
        installPath: installPath,
        openedWindows: List.of(_openedWindows),
        listOnly: listOnly,
        budget: _budget(started, openBudget),
      );
      final ResponsaOpenReport report;
      try {
        report = await Isolate.run(() => _locateInIsolate(request));
      } catch (error, stackTrace) {
        logLine('ResponsaController: isolate failed: $error\n$stackTrace');
        return ResponsaOpenReport(
          ok: false,
          failure: ResponsaFailure.unexpected,
          message: 'הפתיחה בבר אילן נכשלה באופן בלתי צפוי: $error',
        );
      }
      _keepOpenedWindows(report.openedWindows);
      return report;
    } finally {
      _busy = false;
    }
  }

  /// חיפוש טקסט מלא, שתוצאותיו נשארות בממשק של בר אילן. [installPath] כמו
  /// בפתיחה: ההתקנה שממנה נבנה הקטלוג, כשיש.
  Future<ResponsaSearchReport> searchText(
    String query, {
    String? installPath,
    ResponsaSearchSetup setup = ResponsaSearchSetup.none,
    bool? allowLaunch,
  }) async {
    if (!Platform.isWindows) {
      return const ResponsaSearchReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: 'חיפוש בבר אילן נתמך ב-Windows בלבד.',
      );
    }
    if (_busy) {
      return const ResponsaSearchReport(
        ok: false,
        failure: ResponsaFailure.busy,
        message: 'פעולה אחרת בבר אילן כבר מתבצעת. יש להמתין לסיומה.',
      );
    }
    _busy = true;
    final started = Stopwatch()..start();
    try {
      if (await _launchFailure(installPath, allowLaunch: allowLaunch)
          case final message?) {
        return ResponsaSearchReport(
          ok: false,
          failure: ResponsaFailure.responsaNotRunning,
          message: message,
        );
      }

      final request = _SearchRequest(
        query: query,
        installPath: installPath,
        openedWindows: List.of(_openedWindows),
        setup: setup,
        budget: _budget(started, searchBudget),
      );
      final ResponsaSearchReport report;
      try {
        report = await Isolate.run(() => _searchInIsolate(request));
      } catch (error, stackTrace) {
        logLine('ResponsaController: isolate failed: $error\n$stackTrace');
        return ResponsaSearchReport(
          ok: false,
          failure: ResponsaFailure.unexpected,
          message: 'החיפוש בבר אילן נכשל באופן בלתי צפוי: $error',
        );
      }
      _keepOpenedWindows(report.openedWindows);
      return report;
    } finally {
      _busy = false;
    }
  }

  /// מפעיל את בר אילן (גם כש"הפעלה אוטומטית" כבויה: המשתמש ביקש זאת
  /// במפורש) ומביא אותו לחזית. אינו נוגע בחלונות שבו, ולכן אינו תופס את
  /// [_busy]: אפשר להביא לחזית גם בזמן חיפוש.
  Future<ResponsaShowReport> show({String? installPath}) async {
    if (!Platform.isWindows) {
      return const ResponsaShowReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: 'בר אילן נתמך ב-Windows בלבד.',
      );
    }
    if (await _launchFailure(installPath, allowLaunch: true)
        case final message?) {
      return ResponsaShowReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: message,
      );
    }
    try {
      return await Isolate.run(() => _showInIsolate(installPath));
    } catch (error, stackTrace) {
      logLine('ResponsaController: isolate failed: $error\n$stackTrace');
      return ResponsaShowReport(
        ok: false,
        failure: ResponsaFailure.unexpected,
        message: 'הבאת בר אילן לחזית נכשלה באופן בלתי צפוי: $error',
      );
    }
  }

  void _keepOpenedWindows(List<String> windows) {
    if (windows.isEmpty) return;
    _openedWindows
      ..clear()
      ..addAll(windows);
  }

  Future<ResponsaOpenReport> _runInIsolate(_OpenRequest request) async {
    try {
      return await Isolate.run(() => _openBookInIsolate(request));
    } catch (error, stackTrace) {
      // כשל לא צפוי באיזולט לעולם לא מגיע ל-UI כחריג.
      logLine('ResponsaController: isolate failed: $error\n$stackTrace');
      return ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.unexpected,
        message: 'פתיחת הספר בבר אילן נכשלה באופן בלתי צפוי: $error',
      );
    }
  }

  /// `null` כשהכול תקין; אחרת ההודעה למשתמש. הכשל הוא `responsaNotRunning`
  /// ולא `timeout`, שהיה מציג בטעות "התוכנה אינה מגיבה".
  /// [allowLaunch] מגיע מהבקשה (הגדרת "הפעלת בר אילן" בתוסף), וחסר = [autoStart].
  Future<String?> _launchFailure(
    String? installPath, {
    bool? allowLaunch,
  }) async {
    final result = await ResponsaLauncher.ensureRunning(
      installPath: installPath,
      allowLaunch: allowLaunch ?? autoStart,
      timeout: launchTimeout,
    );
    if (result.running) return null;
    return result.message ??
        'בר אילן אינו פעיל. יש לפתוח את פרויקט השו"ת ולנסות שוב.';
  }

  // ------------------------------------------------ מה שרץ באיזולט

  /// רק מופע של ההתקנה שממנה נבנה הקטלוג, ולא חונה מחוץ למסך - שם הספר
  /// נפתח והמשתמש אינו רואה דבר. `automation == null` עם הודעה למשתמש.
  static ({ResponsaAutomation? automation, String? message}) _attach(
    String? installPath,
    List<String> openedWindows,
  ) {
    final selection = ResponsaInstallationDiscovery.selectInstallation(
      preferredPath: installPath,
    );
    final instance = selection == null
        ? null
        : ResponsaInstance.pick(selection.instances);
    if (instance == null) {
      return (
        automation: null,
        message: selection == null
            ? 'בר אילן אינו מותקן במחשב הזה.'
            : 'בר אילן (${selection.installation.displayName}) אינו פעיל. '
                  'יש לפתוח אותו ולנסות שוב.',
      );
    }

    final version = ResponsaInstallationDiscovery.versionFromWindowTitle(
      instance.title,
    );
    return (
      automation: ResponsaAutomation(
        pid: instance.pid,
        profile: ResponsaVersionProfile.forVersion(version),
        openedWindows: openedWindows,
      ),
      message: null,
    );
  }

  static Future<ResponsaOpenReport> _openBookInIsolate(
    _OpenRequest request,
  ) async {
    final (:automation, :message) = _attach(
      request.installPath,
      request.openedWindows,
    );
    if (automation == null) {
      return ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: message,
      );
    }

    try {
      final outcome = automation.openBook(
        request.references,
        ResponsaDeadline(request.budget),
        expectedTitle: request.expectedTitle,
      );
      return ResponsaOpenReport(
        ok: true,
        window: outcome.window,
        usedRef: outcome.usedRef,
        triedRefs: outcome.triedRefs,
        openedWindows: automation.openedWindows,
        broughtToFront: outcome.broughtToFront,
      );
    } on ResponsaAutomationException catch (error) {
      return ResponsaOpenReport(
        ok: false,
        failure: error.failure,
        message: error.message,
        triedRefs: switch (error.details['tried']) {
          final List<String> tried => tried,
          _ => request.references,
        },
        // גם בכשל: ייתכן שנפתח חלון ונפסל, והוא שלנו לסגור.
        openedWindows: automation.openedWindows,
      );
    }
  }

  static ResponsaOpenReport _locateInIsolate(_LocateRequest request) {
    final (:automation, :message) = _attach(
      request.installPath,
      request.openedWindows,
    );
    if (automation == null) {
      return ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: message,
      );
    }
    final deadline = ResponsaDeadline(request.budget);
    try {
      // ניתוח אחד, והפתיחה משתמשת בו. מקום שבר אילן אינו מזהה אינו מקפיץ
      // הודעה: כל ניסיון ממתין עד הסוף. שניים מספיקים לטעינה קרה, ושגיאת
      // כתיב נענית מהר יותר.
      final parsed = automation.parseReference(
        request.reference,
        deadline,
        attempts: 2,
        limit: maxLocateChoices,
      );
      if (parsed.results.isEmpty) {
        throw ResponsaAutomationException(
          ResponsaFailure.referenceNotParsed,
          'בר אילן לא זיהה את המקום "${request.reference}"',
          {'ref': request.reference},
        );
      }
      final index = request.index ?? (parsed.results.length == 1 ? 0 : null);
      // בלי בחירה, או בחירה שכבר אינה ברשימה (בר אילן ענה אחרת הפעם):
      // הרשימה חוזרת לבחירה, ושום דבר אינו נפתח.
      if (index == null || index >= parsed.results.length || request.listOnly) {
        return ResponsaOpenReport(
          ok: true,
          usedRef: request.reference,
          choices: parsed.results,
          openedWindows: automation.openedWindows,
        );
      }
      final outcome = automation.openBook(
        [request.reference],
        deadline,
        resultIndex: index,
        checkReference: false,
        parsed: parsed,
      );
      return ResponsaOpenReport(
        ok: true,
        window: outcome.window,
        usedRef: outcome.usedRef,
        triedRefs: outcome.triedRefs,
        openedWindows: automation.openedWindows,
        broughtToFront: outcome.broughtToFront,
      );
    } on ResponsaAutomationException catch (error) {
      return ResponsaOpenReport(
        ok: false,
        failure: error.failure,
        message: error.message,
        triedRefs: [request.reference],
        openedWindows: automation.openedWindows,
      );
    }
  }

  static ResponsaShowReport _showInIsolate(String? installPath) {
    final (:automation, :message) = _attach(installPath, const []);
    if (automation == null) {
      return ResponsaShowReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: message,
      );
    }
    return ResponsaShowReport(
      ok: true,
      broughtToFront: ResponsaWin32.bringToFront(automation.mainWindow),
    );
  }

  static Future<ResponsaSearchReport> _searchInIsolate(
    _SearchRequest request,
  ) async {
    final (:automation, :message) = _attach(
      request.installPath,
      request.openedWindows,
    );
    if (automation == null) {
      return ResponsaSearchReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: message,
      );
    }

    try {
      final outcome = ResponsaSearchAutomation(automation).search(
        request.query,
        ResponsaDeadline(request.budget),
        setup: request.setup,
      );
      return ResponsaSearchReport(
        ok: true,
        outcome: outcome,
        openedWindows: automation.openedWindows,
      );
    } on ResponsaAutomationException catch (error) {
      return ResponsaSearchReport(
        ok: false,
        failure: error.failure,
        message: error.message,
        openedWindows: automation.openedWindows,
      );
    }
  }
}

class _OpenRequest {
  final List<String> references;
  final String? expectedTitle;
  final String? installPath;

  /// החלונות שאוצריא פתחה בפתיחות קודמות.
  final List<String> openedWindows;

  /// מה שנשאר לפעולה אחרי הפעלת בר אילן.
  final Duration budget;

  const _OpenRequest({
    required this.references,
    this.expectedTitle,
    this.installPath,
    this.openedWindows = const [],
    this.budget = ResponsaController.openBudget,
  });
}

class _LocateRequest {
  final String reference;
  final int? index;
  final String? installPath;
  final List<String> openedWindows;
  final bool listOnly;
  final Duration budget;

  const _LocateRequest({
    required this.reference,
    this.index,
    this.installPath,
    this.openedWindows = const [],
    this.listOnly = false,
    this.budget = ResponsaController.openBudget,
  });
}

class _SearchRequest {
  final String query;
  final String? installPath;
  final List<String> openedWindows;
  final ResponsaSearchSetup setup;
  final Duration budget;

  const _SearchRequest({
    required this.query,
    this.installPath,
    this.openedWindows = const [],
    this.setup = ResponsaSearchSetup.none,
    this.budget = ResponsaController.searchBudget,
  });
}
