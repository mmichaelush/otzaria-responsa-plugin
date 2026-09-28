import 'dart:async';
import 'dart:typed_data';

import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';

/// מחליף את בר אילן בבדיקות. הבנייה נשלטת מבחוץ דרך [buildEvents], כדי
/// שבדיקה תוכל לעצור אותה באמצע ולבדוק הצטרפות, ניתוק וביטול.
class FakeBackend implements ResponsaBackend {
  FakeBackend({this.installed = true, this.installPath = r'C:\ResponsaCD25'});

  bool installed;
  String installPath;

  StreamController<ResponsaBuildProgress>? buildEvents;
  int buildCalls = 0;
  int cancelCalls = 0;

  /// מה ש-[openBook] מחזיר. ברירת מחדל: הצלחה.
  Future<ResponsaOpenReport> Function(List<String> references)? onOpen;
  final List<List<String>> openCalls = [];

  Uint8List? iconBytes;

  /// השהיה מלאכותית, כדי לבדוק מה קורה בין בקשה לתחילת הבנייה.
  Duration statusDelay = Duration.zero;

  @override
  Future<ResponsaStatus> status() async {
    if (statusDelay > Duration.zero) await Future<void>.delayed(statusDelay);
    return _status();
  }

  ResponsaStatus _status() => installed
      ? ResponsaStatus(
          installed: true,
          running: true,
          version: 25,
          installPath: installPath,
          confidence: ResponsaVersionConfidence.verified,
          installations: [
            ResponsaInstallation(
              version: 25,
              installPath: installPath,
              displayName: 'פרויקט השו"ת 25',
              source: 'registry',
            ),
          ],
        )
      : ResponsaStatus.notInstalled;

  @override
  Stream<ResponsaBuildProgress> build({required String targetPath}) {
    buildCalls++;
    final controller = StreamController<ResponsaBuildProgress>();
    buildEvents = controller;
    return controller.stream;
  }

  @override
  void cancelBuild() {
    cancelCalls++;
    final controller = buildEvents;
    if (controller == null || controller.isClosed) return;
    controller
      ..add(
        const ResponsaBuildProgress.failed(
          ResponsaBuildFailure.cancelled,
          'קריאת רשימת הספרים בוטלה.',
        ),
      )
      ..close();
  }

  @override
  Future<ResponsaOpenReport> openBook(
    List<String> references, {
    String? expectedTitle,
    String? installPath,
  }) {
    openCalls.add(references);
    final handler = onOpen;
    if (handler != null) return handler(references);
    return Future.value(
      ResponsaOpenReport(
        ok: true,
        window: expectedTitle,
        usedRef: references.first,
        broughtToFront: true,
      ),
    );
  }

  @override
  Future<Uint8List?> icon({
    required String? installPath,
    required String cachePath,
  }) async => iconBytes;
}
