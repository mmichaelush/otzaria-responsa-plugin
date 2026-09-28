import 'dart:io';

import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/server/catalog_index.dart';

/// הקטלוג שבדיסק ועותק החיפוש שלו בזיכרון. העותק נטען בפעם הראשונה שצריך
/// אותו, ונטען מחדש כשהקובץ השתנה (בנייה חדשה החליפה אותו).
class CatalogStore {
  CatalogStore(String path) : repository = ResponsaCatalogRepository(path);

  final ResponsaCatalogRepository repository;

  DateTime? _loadedStamp;
  Future<CatalogIndex?>? _loading;

  /// `null` כשאין קטלוג. טעינות מקבילות חולקות קריאה אחת.
  Future<CatalogIndex?> index() {
    final stamp = _stamp();
    if (stamp == null) {
      _loading = null;
      _loadedStamp = null;
      return Future.value(null);
    }
    final current = _loading;
    if (current != null && stamp == _loadedStamp) return current;
    _loadedStamp = stamp;
    return _loading = _load();
  }

  Future<CatalogIndex?> _load() async {
    final books = await repository.loadBooks();
    return books.isEmpty ? null : CatalogIndex(books);
  }

  /// אחרי בנייה: זמן השינוי של קובץ שהוחלף בשינוי שם יכול להיות זהה לקודם.
  void invalidate() {
    _loading = null;
    _loadedStamp = null;
  }

  DateTime? _stamp() {
    try {
      final file = File(repository.databasePath);
      return file.existsSync() ? file.lastModifiedSync() : null;
    } on FileSystemException {
      return null;
    }
  }
}
