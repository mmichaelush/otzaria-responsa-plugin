import 'dart:async';
import 'dart:ffi';
import 'dart:io';
import 'dart:isolate';

import 'package:ffi/ffi.dart';
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

  const ResponsaBuildProgress({
    required this.stage,
    this.scannedNodes = 0,
    this.sectionsDone = 0,
    this.sectionsTotal = 0,
    this.books = 0,
  }) : error = null,
       failure = null;

  const ResponsaBuildProgress.failed(
    ResponsaBuildFailure this.failure,
    String this.error,
  ) : stage = ResponsaBuildStage.failed,
      scannedNodes = 0,
      sectionsDone = 0,
      sectionsTotal = 0,
      books = 0;
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
    final receive = ReceivePort();
    final exit = ReceivePort();
    final error = ReceivePort();

    controller.add(
      const ResponsaBuildProgress(stage: ResponsaBuildStage.starting),
    );

    // אין בהתקנה קובץ עם רשימת הספרים - הקטלוג נקרא מהעץ של התוכנה החיה,
    // ולכן הבנייה מעלה אותה בעצמה.
    // חריגה כאן (גילוי ההתקנה רץ באיזולט) הייתה נשארת לא מטופלת: הזרם לא
    // נסגר, `_active` נשאר דלוק, וכל פתיחה הייתה נדחית ב"עסוק" עד הפעלה מחדש.
    final ResponsaLaunchResult launch;
    try {
      launch = await ResponsaLauncher.ensureRunning();
    } catch (launchError, stackTrace) {
      logLine(
        'ResponsaCatalogBuildService: ensureRunning: $launchError\n$stackTrace',
      );
      controller
        ..add(
          ResponsaBuildProgress.failed(
            ResponsaBuildFailure.internal,
            'לא ניתן להפעיל את בר אילן: $launchError',
          ),
        )
        ..close();
      _cleanup(receive, exit, error, flag);
      return;
    }
    if (!launch.running) {
      controller
        ..add(
          ResponsaBuildProgress.failed(
            launch.installPath == null
                ? ResponsaBuildFailure.notInstalled
                : ResponsaBuildFailure.notRunning,
            launch.message ?? 'לא ניתן להפעיל את בר אילן.',
          ),
        )
        ..close();
      _cleanup(receive, exit, error, flag);
      return;
    }

    try {
      await Isolate.spawn(
        _buildEntry,
        _BuildRequest(
          sendPort: receive.sendPort,
          targetPath: targetPath,
          cancelFlagAddress: flag.address,
        ),
        onExit: exit.sendPort,
        onError: error.sendPort,
      );
    } catch (spawnError) {
      controller
        ..add(
          ResponsaBuildProgress.failed(
            ResponsaBuildFailure.internal,
            'לא ניתן להתחיל לקרוא את רשימת הספרים: $spawnError',
          ),
        )
        ..close();
      _cleanup(receive, exit, error, flag);
      return;
    }

    var finished = false;
    void finish(ResponsaBuildProgress? last) {
      if (finished) return;
      finished = true;
      if (last != null) controller.add(last);
      controller.close();
      _cleanup(receive, exit, error, flag);
    }

    receive.listen((message) {
      if (message is ResponsaBuildProgress) {
        if (finished) return;
        controller.add(message);
        if (message.stage == ResponsaBuildStage.done ||
            message.stage == ResponsaBuildStage.failed) {
          finish(null);
        }
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
  }

  void _cleanup(
    ReceivePort receive,
    ReceivePort exit,
    ReceivePort error,
    Pointer<Int32> flag,
  ) {
    receive.close();
    exit.close();
    error.close();
    _cancelFlag = null;
    _active = false;
    calloc.free(flag);
  }

  // -------------------------------------------------- מה שרץ באיזולט

  static void _buildEntry(_BuildRequest request) {
    final send = request.sendPort;
    final flag = Pointer<Int32>.fromAddress(request.cancelFlagAddress);
    bool cancelled() => flag.value != 0;

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
      var scanned = 0;
      var sections = (done: 0, total: 0);
      void report() => send.send(
        ResponsaBuildProgress(
          stage: ResponsaBuildStage.scanning,
          scannedNodes: scanned,
          sectionsDone: sections.done,
          sectionsTotal: sections.total,
        ),
      );
      final nodes = ResponsaTreeReader.walk(
        pid: instance.pid,
        treeHandle: tree,
        descendInto: ResponsaCatalogBuilder.mayContainBooks,
        progressEvery: 2000,
        shouldStop: cancelled,
        onProgress: (count) {
          scanned = count;
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
    }
  }
}

class _BuildRequest {
  final SendPort sendPort;
  final String targetPath;
  final int cancelFlagAddress;

  const _BuildRequest({
    required this.sendPort,
    required this.targetPath,
    required this.cancelFlagAddress,
  });
}
