import 'dart:typed_data';

import 'package:responsa_helper/src/catalog/responsa_icon.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';

/// כל מה שהשירות צריך מבר אילן. מופרד מהשירות כדי שהלוגיקה שלו (חיפוש,
/// תיאום בנייה, HTTP) תיבדק בלי Windows ובלי התוכנה.
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
  });

  /// מפעיל את בר אילן אם צריך. [query] כבר מנוקה (`ResponsaQuery`).
  Future<ResponsaSearchReport> searchText(String query, {String? installPath});

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
  }) => _controller.openBook(
    references,
    expectedTitle: expectedTitle,
    installPath: installPath,
  );

  @override
  Future<ResponsaSearchReport> searchText(
    String query, {
    String? installPath,
  }) => _controller.searchText(query, installPath: installPath);

  @override
  Future<Uint8List?> icon({
    required String? installPath,
    required String cachePath,
  }) => ResponsaIcon.load(installPath: installPath, cachePath: cachePath);
}
