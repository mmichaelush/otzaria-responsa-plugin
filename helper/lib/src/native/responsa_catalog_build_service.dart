import 'dart:async';
import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';

import 'package:ffi/ffi.dart';
import 'package:path/path.dart' as path;
import 'package:win32/win32.dart'
    show
        ES_CONTINUOUS,
        ES_DISPLAY_REQUIRED,
        ES_SYSTEM_REQUIRED,
        SetThreadExecutionState;
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_author_table_reader.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_bibliography_reader.dart';
import 'package:responsa_helper/src/native/responsa_catalog_builder.dart';
import 'package:responsa_helper/src/native/responsa_catalog_writer.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';
import 'package:responsa_helper/src/native/responsa_instance.dart';
import 'package:responsa_helper/src/native/responsa_launcher.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';

/// שלב בבניית הקטלוג, לתצוגה למשתמש.
enum ResponsaBuildStage { starting, scanning, classifying, done, failed }

/// למה בנייה נכשלה. ההחלטות נשענות עליו ולא על טקסט ההודעה.
enum ResponsaBuildFailure {
  busy,
  notSupported,
  notInstalled,
  notRunning,
  elevated,
  treeNotFound,
  notResponding,
  cancelled,
  internal,
}

class ResponsaBuildProgress {
  final ResponsaBuildStage stage;

  /// כמה צמתים נסרקו עד כה. ב-CD25 כ-466 אלף (העץ כולו כ-1.25 מיליון, אבל
  /// פרקים וסימנים אינם נפתחים: `ResponsaCatalogBuilder.mayContainBooks`).
  final int scannedNodes;

  /// ענפים עליונים שנסרקו, מתוך `sectionsTotal` (0 עד תחילת הסריקה). מדד
  /// גס, כי הענפים לא שווים בגודלם - אבל ידוע גם בבנייה הראשונה.
  final int sectionsDone;
  final int sectionsTotal;

  /// כמה ספרים נמצאו. זמין רק בסיום.
  final int books;

  final String? error;

  /// קיים רק בשלב [ResponsaBuildStage.failed].
  final ResponsaBuildFailure? failure;

  /// בר אילן אינו מגיב, והקריאה ממתינה לו.
  final bool waiting;

  /// שורה למשתמש מתחת להתקדמות (למשל: בר אילן קרס והקריאה ממשיכה).
  final String? notice;

  /// כשל שאפשר להמשיך ממנו: בר אילן קרס בפתיחת ספר מסוים. השירות מפעיל אותו
  /// מחדש וממשיך בלי לפתוח את הספר הזה ([ResponsaCatalogBuildService]).
  final ResponsaBuildResume? resume;

  const ResponsaBuildProgress({
    required this.stage,
    this.scannedNodes = 0,
    this.sectionsDone = 0,
    this.sectionsTotal = 0,
    this.books = 0,
    this.waiting = false,
    this.notice,
  }) : error = null,
       failure = null,
       resume = null;

  const ResponsaBuildProgress.failed(
    ResponsaBuildFailure this.failure,
    String this.error, {
    this.resume,
  }) : stage = ResponsaBuildStage.failed,
       scannedNodes = 0,
       sectionsDone = 0,
       sectionsTotal = 0,
       books = 0,
       waiting = false,
       notice = null;

  /// אותה התקדמות, עם [notice]. הודעה שכבר יש נשארת.
  ResponsaBuildProgress withNotice(String? text) =>
      text == null || notice != null || stage == ResponsaBuildStage.failed
      ? this
      : ResponsaBuildProgress(
          stage: stage,
          scannedNodes: scannedNodes,
          sectionsDone: sectionsDone,
          sectionsTotal: sectionsTotal,
          books: books,
          waiting: waiting,
          notice: text,
        );
}

/// מאיפה ממשיכים אחרי קריסה של בר אילן.
class ResponsaBuildResume {
  /// הענף העליון שבו בר אילן קרס.
  final int section;

  /// הצומת שבר אילן קרס בפתיחתו.
  final String culprit;

  /// הצמתים של הענפים שהושלמו לפני [section].
  final List<ResponsaTreeNode> nodes;

  const ResponsaBuildResume({
    required this.section,
    required this.culprit,
    required this.nodes,
  });
}

/// ספרים שפתיחתם הפילה את בר אילן, לכל התקנה (`build-skip.json` ליד הקטלוג).
/// נקראים ונכתבים באיזולט הקריאה. בר אילן 30 קורס בכל פעם בפתיחת אותו ספר,
/// ולכן ספר כזה לא נפתח שוב: הוא נרשם, בלי הפרקים שלו.
class ResponsaBuildSkipList {
  ResponsaBuildSkipList(this.file);

  final File file;

  /// מעבר לזה כבר אין טעם לדלג: משהו אחר שבור.
  static const int maxPerInstallation = 10;

  static String _key(String installPath) => installPath.toLowerCase();

  Map<String, Object?> _read() {
    try {
      if (!file.existsSync()) return {};
      final json = jsonDecode(file.readAsStringSync());
      return json is Map<String, Object?> ? json : {};
    } catch (error) {
      logLine('ResponsaBuildSkipList: cannot read ${file.path}: $error');
      return {};
    }
  }

  Set<String> forInstallation(String installPath) => {
    for (final entry in (_read()[_key(installPath)] as List?) ?? const [])
      if (entry is String) entry,
  };

  /// `false` כשהנתיב כבר ברשימה או שהרשימה מלאה: אז לא ממשיכים.
  bool add(String installPath, String culprit) {
    final all = _read();
    final list = forInstallation(installPath);
    if (list.contains(culprit) || list.length >= maxPerInstallation) {
      return false;
    }
    all[_key(installPath)] = [...list, culprit];
    try {
      file.writeAsStringSync(const JsonEncoder.withIndent('  ').convert(all));
      return true;
    } catch (error) {
      logLine('ResponsaBuildSkipList: cannot write ${file.path}: $error');
      return false;
    }
  }
}

/// בניית קטלוג פרויקט השו"ת באיזולט רקע, בהליכה חיה על עץ הספרים (ב-CD25 כ-466
/// אלף צמתים, פחות משתי דקות) - ולכן עם דיווח התקדמות וביטול אמיתי. רצה רק
/// לבקשת המשתמש.
class ResponsaCatalogBuildService {
  ResponsaCatalogBuildService();

  Pointer<Int32>? _cancelFlag;

  /// מבטל בנייה שרצה. הביטול אמיתי — הסריקה נעצרת בנקודת הבדיקה הבאה.
  void cancel() {
    final flag = _cancelFlag;
    if (flag != null) flag.value = 1;
  }

  /// [targetPath] הוא היעד הסופי; הבנייה נכתבת לקובץ צדדי ומוחלפת אטומית רק
  /// אחרי שעברה אימות.
  Stream<ResponsaBuildProgress> build({required String targetPath}) {
    final controller = StreamController<ResponsaBuildProgress>();
    // בנייה אחת בכל האפליקציה (גם אחרי יציאה מהמסך): שתיים כותבות לאותו
    // `<target>.building`, והשנייה מוחקת את זה של הראשונה.
    if (_active) {
      controller
        ..add(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.busy,
            'רשימת הספרים כבר נקראת כרגע. יש להמתין לסיום.',
          ),
        )
        ..close();
      return controller.stream;
    }
    _start(controller, targetPath);
    return controller.stream;
  }

  /// האם בנייה כלשהי רצה כרגע — גם כזו שהתחיל מסך שכבר נסגר.
  static bool _active = false;

  /// כמה פעמים ממשיכים אחרי קריסה של בר אילן בבנייה אחת.
  static const int _maxResumes = 2;

  Future<void> _start(
    StreamController<ResponsaBuildProgress> controller,
    String targetPath,
  ) async {
    if (!Platform.isWindows) {
      controller
        ..add(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.notSupported,
            'פרויקט השו"ת נתמך ב-Windows בלבד.',
          ),
        )
        ..close();
      return;
    }

    final flag = calloc<Int32>();
    _cancelFlag = flag;
    _active = true;
    controller.add(
      const ResponsaBuildProgress(stage: ResponsaBuildStage.starting),
    );
    var fromSection = 0;
    var prior = const <ResponsaTreeNode>[];
    String? notice;
    try {
      for (var resumes = 0; ; resumes++) {
        final launchFailure = await _launch();
        if (launchFailure != null) {
          controller.add(launchFailure);
          return;
        }
        final outcome = await _read(
          _BuildRequest(
            targetPath: targetPath,
            cancelFlagAddress: flag.address,
            fromSection: fromSection,
            prior: prior,
          ),
          (progress) => controller.add(progress.withNotice(notice)),
        );
        final resume = outcome.resume;
        if (resume == null || resumes >= _maxResumes || flag.value != 0) {
          controller.add(outcome);
          return;
        }
        final book = resume.culprit
            .split(ResponsaTreeReader.pathSeparator)
            .last;
        notice =
            'בר אילן קרס בפתיחת "$book" (תקלה בבר אילן עצמו). הקריאה '
            'ממשיכה בלי לפתוח את הספר הזה.';
        logLine(
          'ResponsaCatalogBuildService: Bar-Ilan crashed opening '
          '"${resume.culprit}"; relaunching and continuing from section '
          '${resume.section + 1} with ${resume.nodes.length} rows kept',
        );
        controller.add(
          ResponsaBuildProgress(
            stage: ResponsaBuildStage.starting,
            scannedNodes: resume.nodes.length,
            sectionsDone: resume.section,
            notice: notice,
          ),
        );
        fromSection = resume.section;
        prior = resume.nodes;
        // תהליך שקרס מסיים לצאת (ו-WER משחרר אותו) רגע אחרי הקריסה.
        await Future<void>.delayed(const Duration(seconds: 3));
      }
    } finally {
      await controller.close();
      _cancelFlag = null;
      _active = false;
      calloc.free(flag);
    }
  }

  /// אין בהתקנה קובץ עם רשימת הספרים - הקטלוג נקרא מהעץ של התוכנה החיה,
  /// ולכן הבנייה מעלה אותה בעצמה. `null` כשבר אילן פועל.
  Future<ResponsaBuildProgress?> _launch() async {
    // חריגה כאן (גילוי ההתקנה רץ באיזולט) הייתה נשארת לא מטופלת: הזרם לא
    // נסגר, `_active` נשאר דלוק, וכל פתיחה הייתה נדחית ב"עסוק" עד הפעלה מחדש.
    final ResponsaLaunchResult launch;
    try {
      launch = await ResponsaLauncher.ensureRunning();
    } catch (launchError, stackTrace) {
      logLine(
        'ResponsaCatalogBuildService: ensureRunning: $launchError\n$stackTrace',
      );
      return ResponsaBuildProgress.failed(
        ResponsaBuildFailure.internal,
        'לא ניתן להפעיל את בר אילן: $launchError',
      );
    }
    if (launch.running) return null;
    return ResponsaBuildProgress.failed(
      launch.installPath == null
          ? ResponsaBuildFailure.notInstalled
          : ResponsaBuildFailure.notRunning,
      launch.message ?? 'לא ניתן להפעיל את בר אילן.',
    );
  }

  /// קריאה אחת באיזולט. מעביר את ההתקדמות ל-[forward], ומחזיר את התוצאה
  /// (`done` או `failed`, אולי עם [ResponsaBuildProgress.resume]).
  Future<ResponsaBuildProgress> _read(
    _BuildRequest request,
    void Function(ResponsaBuildProgress progress) forward,
  ) async {
    final receive = ReceivePort();
    final exit = ReceivePort();
    final error = ReceivePort();
    final result = Completer<ResponsaBuildProgress>();
    void finish(ResponsaBuildProgress progress) {
      if (!result.isCompleted) result.complete(progress);
    }

    receive.listen((message) {
      if (message is! ResponsaBuildProgress || result.isCompleted) return;
      if (message.stage == ResponsaBuildStage.done ||
          message.stage == ResponsaBuildStage.failed) {
        finish(message);
      } else {
        forward(message);
      }
    });
    // איזולט שמת בלי לדווח (קריסת native, זיכרון, הרג) משאיר אחרת את המסך
    // ב"בונה..." לנצח.
    error.listen((message) {
      logLine('ResponsaCatalogBuildService: isolate error: $message');
      finish(
        const ResponsaBuildProgress.failed(
          ResponsaBuildFailure.internal,
          'קריאת רשימת הספרים נכשלה באופן בלתי צפוי.',
        ),
      );
    });
    exit.listen((_) {
      finish(
        const ResponsaBuildProgress.failed(
          ResponsaBuildFailure.internal,
          'קריאת רשימת הספרים הסתיימה בלי תוצאה.',
        ),
      );
    });
    try {
      await Isolate.spawn(
        _buildEntry,
        request.withPort(receive.sendPort),
        onExit: exit.sendPort,
        onError: error.sendPort,
      );
    } catch (spawnError) {
      finish(
        ResponsaBuildProgress.failed(
          ResponsaBuildFailure.internal,
          'לא ניתן להתחיל לקרוא את רשימת הספרים: $spawnError',
        ),
      );
    }
    try {
      return await result.future;
    } finally {
      receive.close();
      exit.close();
      error.close();
    }
  }

  // -------------------------------------------------- מה שרץ באיזולט

  static void _buildEntry(_BuildRequest request) {
    final send = request.sendPort;
    final flag = Pointer<Int32>.fromAddress(request.cancelFlagAddress);
    bool cancelled() => flag.value != 0;
    final skipList = ResponsaBuildSkipList(
      File(path.join(path.dirname(request.targetPath), 'build-skip.json')),
    );
    String? installPath;

    // המחשב לא נכנס למצב שינה מחוסר פעילות בזמן הקריאה: יציאה משינה משביתה
    // את בר אילן, וקריאה של דקות נזרקה. גם המסך: במחשבים עם Modern Standby
    // כיבוי המסך הוא הכניסה לשינה. האיזולט סינכרוני, ולכן כל הקריאה רצה
    // בחוט הזה, וההגדרה משתחררת ב-finally (וגם כשהחוט מסתיים).
    SetThreadExecutionState(
      ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED,
    );
    try {
      // ההתקנה נבחרת לפני המופע והמופע מותאם לה: לכל מופע יכול להיות אתר
      // נתונים אחר, ובנייה ממופע של התקנה אחרת מתארת מאגר שאינו קיים.
      final selection = ResponsaInstallationDiscovery.selectInstallation();
      if (selection == null) {
        send.send(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.notInstalled,
            'לא נמצאה התקנה של בר אילן (פרויקט השו"ת) במחשב.',
          ),
        );
        return;
      }
      final installation = selection.installation;
      installPath = installation.installPath;
      // לא מופע חונה מחוץ למסך: הבנייה הייתה מצליחה, אבל המשתמש לא היה
      // רואה דבר במשך דקות.
      final instance = ResponsaInstance.pick(selection.instances);
      if (instance == null) {
        send.send(
          ResponsaBuildProgress.failed(
            ResponsaBuildFailure.notRunning,
            'בר אילן (${installation.displayName}) אינו פעיל. '
            'יש לפתוח אותו ולנסות שוב.',
          ),
        );
        return;
      }
      final version =
          ResponsaInstallationDiscovery.versionFromWindowTitle(
            instance.title,
          ) ??
          installation.version;
      // כל מה שמבדיל בין מחשב למחשב, בשורה אחת: מהדורה, התקנה, מופע, וכמה
      // ספרים פתוחים בו (הם מאטים את הקריאה).
      logLine(
        'ResponsaCatalogBuildService: start: edition ${version ?? '?'}, '
        '${installation.installPath} (${installation.source}), '
        'pid ${instance.pid} "${instance.title}", '
        '${instance.openWindows} open book windows',
      );
      final automation = ResponsaAutomation(
        pid: instance.pid,
        profile: ResponsaVersionProfile.forVersion(version),
      )..cancelled = cancelled;

      // עץ הקטלוג יושב בדיאלוג העיון; צריך לפתוח אותו כדי להגיע אליו.
      final dialog = automation.ensureCitationDialog(
        ResponsaDeadline(const Duration(seconds: 60)),
      );
      final tree =
          ResponsaTreeReader.findCatalogTree(dialog.hwnd) ??
          ResponsaTreeReader.findCatalogTree(dialog.container);
      if (tree == null) {
        send.send(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.treeNotFound,
            'רשימת הספרים לא נמצאה בחלון "עיון" של בר אילן.',
          ),
        );
        return;
      }

      send.send(
        const ResponsaBuildProgress(stage: ResponsaBuildStage.scanning),
      );
      final prior = request.prior;
      var scanned = prior.length;
      var sections = (done: request.fromSection, total: 0);
      var waiting = false;
      void report() => send.send(
        ResponsaBuildProgress(
          stage: ResponsaBuildStage.scanning,
          scannedNodes: scanned,
          sectionsDone: sections.done,
          sectionsTotal: sections.total,
          waiting: waiting,
        ),
      );
      final fresh = ResponsaTreeReader.walk(
        pid: instance.pid,
        treeHandle: tree,
        descendInto: ResponsaCatalogBuilder.mayContainBooks,
        progressEvery: 2000,
        shouldStop: cancelled,
        patience: const Duration(minutes: 3),
        fromSection: request.fromSection,
        skip: skipList.forInstallation(installation.installPath),
        onWaiting: (value) {
          waiting = value;
          report();
        },
        onProgress: (count) {
          scanned = prior.length + count;
          report();
        },
        onSection: (done, total) {
          sections = (done: done, total: total);
          report();
        },
      );

      if (cancelled()) {
        send.send(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.cancelled,
            'קריאת רשימת הספרים בוטלה.',
          ),
        );
        return;
      }
      final nodes = prior.isEmpty ? fresh : [...prior, ...fresh];

      send.send(
        ResponsaBuildProgress(
          stage: ResponsaBuildStage.classifying,
          scannedNodes: nodes.length,
        ),
      );

      final result = ResponsaCatalogWriter.build(
        nodes: nodes,
        fingerprint: ResponsaInstallationDiscovery.fingerprint(installation),
        targetPath: request.targetPath,
        bibliography: ResponsaBibliographyReader.forInstallation(installation),
        authors: ResponsaAuthorTableReader.forInstallation(installation),
      );
      send.send(
        ResponsaBuildProgress(
          stage: ResponsaBuildStage.done,
          scannedNodes: result.scannedNodes,
          books: result.books,
        ),
      );
    } on ResponsaTreeReadException catch (error) {
      logLine('ResponsaCatalogBuildService: $error');
      // "ביטול" בזמן שהקריאה חיכתה לבר אילן עוצר את ההמתנה, והקריאה נראית
      // כמו כשל; המשתמש ביקש לעצור, ולכן זה ביטול.
      if (cancelled()) {
        send.send(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.cancelled,
            'קריאת רשימת הספרים בוטלה.',
          ),
        );
        return;
      }
      // קריסה בפתיחת ספר מסוים: נרשם, ובר אילן יופעל מחדש בלעדיו.
      final culprit = error.culprit;
      if (culprit != null &&
          installPath != null &&
          skipList.add(installPath, culprit)) {
        send.send(
          ResponsaBuildProgress.failed(
            ResponsaBuildFailure.notResponding,
            error.message,
            resume: ResponsaBuildResume(
              section: error.section,
              culprit: culprit,
              nodes: [...request.prior, ...error.completed],
            ),
          ),
        );
        return;
      }
      send.send(
        ResponsaBuildProgress.failed(
          error.accessDenied
              ? ResponsaBuildFailure.elevated
              : ResponsaBuildFailure.notResponding,
          error.message,
        ),
      );
    } on ResponsaAutomationException catch (error) {
      logLine('ResponsaCatalogBuildService: $error');
      send.send(
        ResponsaBuildProgress.failed(switch (error.failure) {
          ResponsaFailure.cancelled => ResponsaBuildFailure.cancelled,
          ResponsaFailure.citationDialogNotFound ||
          ResponsaFailure.resultsNotCleared =>
            ResponsaBuildFailure.treeNotFound,
          _ => ResponsaBuildFailure.notResponding,
        }, error.message),
      );
    } catch (error, stackTrace) {
      logLine('ResponsaCatalogBuildService: $error\n$stackTrace');
      send.send(
        ResponsaBuildProgress.failed(
          ResponsaBuildFailure.internal,
          'קריאת רשימת הספרים נכשלה: $error',
        ),
      );
    } finally {
      SetThreadExecutionState(ES_CONTINUOUS);
    }
  }
}

class _BuildRequest {
  final SendPort? port;
  final String targetPath;
  final int cancelFlagAddress;

  /// מאיזה ענף עליון לקרוא, ומה כבר נקרא לפניו (אחרי קריסה של בר אילן).
  final int fromSection;
  final List<ResponsaTreeNode> prior;

  const _BuildRequest({
    required this.targetPath,
    required this.cancelFlagAddress,
    this.fromSection = 0,
    this.prior = const [],
    this.port,
  });

  SendPort get sendPort => port!;

  _BuildRequest withPort(SendPort sendPort) => _BuildRequest(
    targetPath: targetPath,
    cancelFlagAddress: cancelFlagAddress,
    fromSection: fromSection,
    prior: prior,
    port: sendPort,
  );
}
