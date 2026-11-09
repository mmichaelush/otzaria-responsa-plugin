import 'dart:isolate';

import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_biography_reader.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_launcher.dart';

/// תוצאת קריאה מחלון הביוגרפיה של בר אילן.
class ResponsaBiographyReport {
  final bool ok;

  /// [ResponsaBiographyController.readIndex].
  final List<BiographyEntry> entries;

  /// [ResponsaBiographyController.readText]: הטקסט כפי שהועתק.
  final String? text;
  final ResponsaFailure? failure;
  final String? message;

  const ResponsaBiographyReport({
    required this.ok,
    this.entries = const [],
    this.text,
    this.failure,
    this.message,
  });

  const ResponsaBiographyReport.failed(
    ResponsaFailure this.failure,
    String this.message,
  ) : ok = false,
      entries = const [],
      text = null;
}

/// מה ששירות הביוגרפיות צריך מבר אילן. ממשק, כדי שהלוגיקה שלו (שמירה, התאמה,
/// חזרה על כשלים) תיבדק בלי Windows.
abstract interface class ResponsaBiographySource {
  /// כל החיבורים שיש עליהם ביוגרפיה.
  Future<ResponsaBiographyReport> readIndex({
    String? installPath,
    bool allowLaunch = true,
  });

  /// המאמר של [entry], כפי שהועתק.
  Future<ResponsaBiographyReport> readText(
    BiographyEntry entry, {
    String? installPath,
    bool allowLaunch = true,
  });
}

/// ההפעלה של [ResponsaBiographyReader] מול בר אילן חי: מעלה אותה כשצריך (ולפי
/// הגדרת המשתמש), ומריצה את הפעולה החוסמת באיזולט רקע. נפרד מ-
/// [ResponsaController] כי הוא עוסק בדבר אחד, ואינו חולק איתו מצב.
class ResponsaBiographyController implements ResponsaBiographySource {
  const ResponsaBiographyController();

  /// עץ של אלף חיבורים נקרא בכמה שניות (6.5 ב-CD25) ובארבע דקות בכל היותר גם
  /// במחשב איטי; מאמר אחד, בדקה וחצי. קריאה ראשונה בהפעלה קרה עלולה לעבור את
  /// הזמן שאוצריא ממתינה לו: התוצאה נשמרת, וניסיון חוזר עונה מיד.
  static const Duration indexBudget = Duration(minutes: 4);
  static const Duration textBudget = Duration(seconds: 90);

  @override
  Future<ResponsaBiographyReport> readIndex({
    String? installPath,
    bool allowLaunch = true,
  }) => _run(
    installPath,
    allowLaunch,
    () => Isolate.run(() => _indexInIsolate(installPath)),
  );

  @override
  Future<ResponsaBiographyReport> readText(
    BiographyEntry entry, {
    String? installPath,
    bool allowLaunch = true,
  }) => _run(
    installPath,
    allowLaunch,
    () => Isolate.run(() => _textInIsolate(entry, installPath)),
  );

  Future<ResponsaBiographyReport> _run(
    String? installPath,
    bool allowLaunch,
    Future<ResponsaBiographyReport> Function() action,
  ) async {
    final launch = await ResponsaLauncher.ensureRunning(
      installPath: installPath,
      allowLaunch: allowLaunch,
      timeout: ResponsaController.launchTimeout,
    );
    if (!launch.running) {
      return ResponsaBiographyReport.failed(
        launch.elevated
            ? ResponsaFailure.elevated
            : ResponsaFailure.responsaNotRunning,
        launch.message ??
            'בר אילן אינו פעיל. יש לפתוח את פרויקט השו"ת ולנסות שוב.',
      );
    }
    try {
      return await action();
    } catch (error, stackTrace) {
      // כשל לא צפוי באיזולט לעולם לא מגיע ל-UI כחריג.
      logLine('ResponsaBiography: isolate failed: $error\n$stackTrace');
      return ResponsaBiographyReport.failed(
        ResponsaFailure.unexpected,
        'קריאת הביוגרפיה מבר אילן נכשלה באופן בלתי צפוי: $error',
      );
    }
  }

  static ResponsaBiographyReport _indexInIsolate(String? installPath) =>
      _guarded(installPath, (automation) {
        final entries = ResponsaBiographyReader.readIndex(
          automation,
          ResponsaDeadline(indexBudget),
        );
        return ResponsaBiographyReport(ok: true, entries: entries);
      });

  static ResponsaBiographyReport _textInIsolate(
    BiographyEntry entry,
    String? installPath,
  ) => _guarded(installPath, (automation) {
    final text = ResponsaBiographyReader.readText(
      automation,
      entry,
      ResponsaDeadline(textBudget),
    );
    return ResponsaBiographyReport(ok: true, text: text);
  });

  static ResponsaBiographyReport _guarded(
    String? installPath,
    ResponsaBiographyReport Function(ResponsaAutomation automation) action,
  ) {
    final (:automation, :message) = ResponsaController.attach(
      installPath,
      const [],
    );
    if (automation == null) {
      return ResponsaBiographyReport.failed(
        ResponsaFailure.responsaNotRunning,
        message ?? 'בר אילן אינו פעיל.',
      );
    }
    try {
      return action(automation);
    } on ResponsaAutomationException catch (error) {
      return ResponsaBiographyReport.failed(error.failure, error.message);
    }
  }
}
