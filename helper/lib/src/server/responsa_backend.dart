import 'dart:typed_data';

import 'package:responsa_helper/src/catalog/responsa_icon.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';

/// כל מה שהשירות צריך מבר אילן. מופרד מהשירות כדי שהלוגיקה שלו (חיפוש,
/// תיאום בנייה, HTTP) תיבדק בלי Windows ובלי התוכנה.
///
/// בפתיחה, באיתור ובחיפוש, `autoStart: false` = לא להפעיל את בר אילן כשהוא
/// סגור (הגדרת המשתמש בתוסף), אלא להיכשל ב-`responsaNotRunning`.
abstract interface class ResponsaBackend {
  /// מהיר; אינו מפעיל את בר אילן.
  Future<ResponsaStatus> status();

  /// מפעיל את בר אילן אם צריך. [targetPath] מוחלף רק אחרי אימות.
  Stream<ResponsaBuildProgress> build({required String targetPath});

  void cancelBuild();

  Future<ResponsaOpenReport> openBook(
    List<String> references, {
    String? expectedTitle,
    String? installPath,
    bool autoStart = true,
  });

  /// מקום מדויק (`בראשית ב ג`). בלי [index] ועם כמה תוצאות — `choices`.
  Future<ResponsaOpenReport> locate(
    String reference, {
    int? index,
    String? installPath,
    bool autoStart = true,
  });

  /// מפעיל את בר אילן אם צריך. [query] כבר מנוקה (`ResponsaQuery`, או
  /// `ResponsaAdvancedQuery` עם [setup] של חיפוש מתקדם).
  Future<ResponsaSearchReport> searchText(
    String query, {
    String? installPath,
    ResponsaSearchSetup setup = ResponsaSearchSetup.none,
    bool autoStart = true,
  });

  /// מפעיל את בר אילן אם צריך ומביא אותו לחזית.
  Future<ResponsaShowReport> show({String? installPath});

  Future<Uint8List?> icon({
    required String? installPath,
    required String cachePath,
  });
}

/// המימוש האמיתי, מעל מנוע ה-Win32.
class NativeResponsaBackend implements ResponsaBackend {
  final ResponsaController _controller = ResponsaController();
  final ResponsaCatalogBuildService _builder = ResponsaCatalogBuildService();

  @override
  Future<ResponsaStatus> status() => _controller.status();

  @override
  Stream<ResponsaBuildProgress> build({required String targetPath}) =>
      _builder.build(targetPath: targetPath);

  @override
  void cancelBuild() => _builder.cancel();

  @override
  Future<ResponsaOpenReport> openBook(
    List<String> references, {
    String? expectedTitle,
    String? installPath,
    bool autoStart = true,
  }) => _controller.openBook(
    references,
    expectedTitle: expectedTitle,
    installPath: installPath,
    allowLaunch: autoStart,
  );

  @override
  Future<ResponsaOpenReport> locate(
    String reference, {
    int? index,
    String? installPath,
    bool autoStart = true,
  }) => _controller.locate(
    reference,
    index: index,
    installPath: installPath,
    allowLaunch: autoStart,
  );

  @override
  Future<ResponsaSearchReport> searchText(
    String query, {
    String? installPath,
    ResponsaSearchSetup setup = ResponsaSearchSetup.none,
    bool autoStart = true,
  }) => _controller.searchText(
    query,
    installPath: installPath,
    setup: setup,
    allowLaunch: autoStart,
  );

  @override
  Future<ResponsaShowReport> show({String? installPath}) =>
      _controller.show(installPath: installPath);

  @override
  Future<Uint8List?> icon({
    required String? installPath,
    required String cachePath,
  }) => ResponsaIcon.load(installPath: installPath, cachePath: cachePath);
}
