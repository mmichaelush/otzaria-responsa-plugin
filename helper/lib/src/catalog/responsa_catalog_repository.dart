import 'dart:io';
import 'dart:isolate';

import 'package:responsa_helper/src/catalog/responsa_catalog_schema.dart';
import 'package:responsa_helper/src/catalog/responsa_category_map.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/text/responsa_names.dart';
import 'package:sqlite3/sqlite3.dart';

/// מטא-דאטה של הקטלוג המקומי. `fingerprint` מזהה שההתקנה שממנה נבנה
/// השתנתה ושצריך לבנות מחדש.
class ResponsaCatalogInfo {
  final bool exists;
  final int bookCount;
  final int? sourceVersion;
  final int? schemaVersion;
  final String? installPath;
  final String? builtAt;

  /// כמה צמתים נסרקו בבנייה שיצרה את הקטלוג. המכנה של סרגל ההתקדמות
  /// בבנייה הבאה.
  final int? nodeCount;

  final Map<String, String> fingerprint;

  const ResponsaCatalogInfo({
    required this.exists,
    this.bookCount = 0,
    this.sourceVersion,
    this.schemaVersion,
    this.installPath,
    this.builtAt,
    this.nodeCount,
    this.fingerprint = const {},
  });

  static const ResponsaCatalogInfo missing = ResponsaCatalogInfo(exists: false);

  bool get isUsable => exists && bookCount > 0;

  /// קטלוג בסכמה ישנה עדיין נקרא, כדי ששדרוג לא יעלים את הספרים, אבל
  /// מוצגת בקשה לרענון.
  bool get isOutdated =>
      exists && (schemaVersion ?? 1) < responsaCatalogSchemaVersion;

  /// הפניות ממהדורה אחרת עלולות לפתוח ספר אחר. מחזיר `true` כשאי אפשר
  /// לדעת, כדי לא להרגיל את המשתמש להתעלם מאזהרה.
  bool describesAnyOf(Iterable<String> installPaths) {
    final source = installPath?.trim();
    if (source == null || source.isEmpty) return true;
    final known = installPaths
        .map((value) => _comparablePath(value))
        .where((value) => value.isNotEmpty)
        .toSet();
    if (known.isEmpty) return true;
    return known.contains(_comparablePath(source));
  }

  /// מערכת הקבצים של Windows אינה רגישה לרישיות, ונתיב שנקרא מהרישום יכול
  /// להסתיים בלוכסן ונתיב שנקרא מתהליך חי לא.
  static String _comparablePath(String value) => value
      .trim()
      .replaceAll('/', r'\')
      .replaceAll(RegExp(r'\\+$'), '')
      .toLowerCase();
}

/// ספר בקטלוג, בצורה שהשירות מחזיר לתוסף.
class ResponsaCatalogBook {
  /// המזהה היציב בין בניות. הסימניות וההיסטוריה נשענות עליו.
  final String key;
  final String title;
  final String? author;
  final String? pubPlace;
  final String? pubDate;
  final String topics;

  /// הנתיב בעץ של בר אילן בלי שם הספר, מופרד ב-`/`.
  final String contextPath;

  /// הקטגוריה המקבילה בעץ של אוצריא (`תלמוד בבלי/אחרונים`), כשיש שיוך.
  final String? otzariaCategory;

  const ResponsaCatalogBook({
    required this.key,
    required this.title,
    required this.contextPath,
    this.author,
    this.pubPlace,
    this.pubDate,
    this.topics = '',
    this.otzariaCategory,
  });

  Map<String, Object?> toJson() => {
    'key': key,
    'title': title,
    if (author != null) 'author': author,
    if (pubPlace != null) 'pubPlace': pubPlace,
    if (pubDate != null) 'pubDate': pubDate,
    if (topics.isNotEmpty) 'topics': topics,
    'contextPath': contextPath,
    if (otzariaCategory != null) 'otzariaCategory': otzariaCategory,
  };
}

/// כל כשל מחזיר ערך ריק ולא חריג: קטלוג חסר הוא מצב רגיל (טרם נבנה).
class ResponsaCatalogRepository {
  ResponsaCatalogRepository(this.databasePath);

  /// מפריד רכיבי הנתיב בעץ הקטלוג של התוכנה.
  static const String pathSeparator = ' > ';

  final String databasePath;

  Future<bool> exists() => File(databasePath).exists();

  Database? _open() {
    if (!File(databasePath).existsSync()) return null;
    try {
      return sqlite3.open(databasePath, mode: OpenMode.readOnly);
    } catch (e) {
      logLine('ResponsaCatalogRepository: cannot open $databasePath: $e');
      return null;
    }
  }

  /// מצב הקטלוג: קיים, כמה ספרים, ומאיזו התקנה נבנה.
  Future<ResponsaCatalogInfo> info() async {
    final db = _open();
    if (db == null) return ResponsaCatalogInfo.missing;
    try {
      final meta = <String, String>{};
      for (final row in db.select('SELECT key, value FROM db_meta')) {
        meta[row['key'].toString()] = row['value'].toString();
      }
      final count =
          (db.select('SELECT count(*) AS n FROM books').first['n'] as num)
              .toInt();
      return ResponsaCatalogInfo(
        exists: true,
        bookCount: count,
        sourceVersion: int.tryParse(meta['responsa_version'] ?? ''),
        schemaVersion: int.tryParse(meta['catalog_schema_version'] ?? ''),
        installPath: meta['install_path'],
        builtAt: meta['catalog_build_time'],
        nodeCount: int.tryParse(meta['catalog_node_count'] ?? ''),
        fingerprint: meta,
      );
    } catch (e) {
      logLine('ResponsaCatalogRepository: info failed: $e');
      return ResponsaCatalogInfo.missing;
    } finally {
      db.close();
    }
  }

  /// באיזולט: קריאת ~8,500 שורות וההמרה שלהן לוקחות מאות מילישניות, והשירות
  /// צריך להמשיך לענות בזמן הזה.
  Future<List<ResponsaCatalogBook>> loadBooks() async {
    final target = databasePath;
    if (!File(target).existsSync()) return const [];
    try {
      final rows = await Isolate.run(() {
        final db = sqlite3.open(target, mode: OpenMode.readOnly);
        try {
          return db
              .select('SELECT * FROM books ORDER BY title COLLATE NOCASE')
              .map((row) => {for (final key in row.keys) key: row[key]})
              .toList();
        } finally {
          db.close();
        }
      });
      return [for (final row in rows) bookOf(row)];
    } catch (e) {
      logLine('ResponsaCatalogRepository: loadBooks failed: $e');
      return const [];
    }
  }

  /// נפרד מהכותרת בכוונה: `openBook("רא\"ש")` מחזיר מאות תוצאות שהראשונה
  /// בהן ספר אחר, ולכן נשמרת הפניה הכוללת הקשר.
  Future<String?> openRefFor(String externalKey) async =>
      (await openRefsFor(externalKey)).firstOrNull;

  /// ההפניה הראשית ואחריה החלופות. נבנות בזמן בניית הקטלוג, כשמבנה הנתיב
  /// ידוע; נסיגה בזמן ריצה הייתה רק ניחוש.
  Future<List<String>> openRefsFor(String externalKey) async {
    final db = _open();
    if (db == null) return const [];
    try {
      // `SELECT *` ולא רשימת עמודות: קטלוג בסכמה 1 אינו מכיר `alt_refs`,
      // ושאילתה שדורשת אותו תיכשל ותשאיר את הספר בלי הפניה.
      final rows = db.select(
        'SELECT * FROM books WHERE external_key = ? LIMIT 1',
        [externalKey],
      );
      if (rows.isEmpty) return const [];
      final primary = rows.first['open_ref']?.toString() ?? '';
      final alternatives = rows.first['alt_refs']?.toString() ?? '';
      return [
        if (primary.isNotEmpty) primary,
        for (final line in alternatives.split('\n'))
          if (line.trim().isNotEmpty) line.trim(),
      ];
    } catch (e) {
      logLine('ResponsaCatalogRepository: openRefsFor failed: $e');
      return const [];
    } finally {
      db.close();
    }
  }

  /// נדרש בזמן פתיחה: על מחשב עם שתי התקנות, הפניה ממאגר אחד יכולה להוליך
  /// לספר אחר במאגר השני.
  Future<String?> sourceInstallPath() async {
    final db = _open();
    if (db == null) return null;
    try {
      final rows = db.select(
        "SELECT value FROM db_meta WHERE key = 'install_path' LIMIT 1",
      );
      if (rows.isEmpty) return null;
      final value = rows.first['value']?.toString();
      return (value == null || value.isEmpty) ? null : value;
    } catch (e) {
      logLine('ResponsaCatalogRepository: sourceInstallPath failed: $e');
      return null;
    } finally {
      db.close();
    }
  }

  /// העמודות נקראות דרך `row[...]` בלי לדרוש אותן: קטלוג בסכמה ישנה אינו
  /// מכיר את כולן.
  static ResponsaCatalogBook bookOf(Map<String, Object?> row) {
    final refPath = row['ref_path']?.toString() ?? '';
    // הנתיב המלא ולא רק השורש: `ספרות חז"ל` מתפצל לחמש קטגוריות באוצריא,
    // ורק הרמה השנייה מכריעה. בסכמה 2 אין את העמודה ונשאר רק השורש.
    final category =
        row['category_path']?.toString() ?? row['category']?.toString();
    final otzaria = ResponsaCategoryMap.otzariaPathFor(category);
    return ResponsaCatalogBook(
      key: row['external_key']?.toString() ?? '',
      title: row['title']?.toString() ?? '',
      author: _text(row['author']),
      pubPlace: _text(row['pub_place']),
      pubDate: _text(row['pub_date']),
      topics: row['topics']?.toString() ?? '',
      contextPath: contextPathOf(refPath),
      otzariaCategory: otzaria == null || otzaria.isEmpty
          ? null
          : otzaria.join('/'),
    );
  }

  /// ריק הופך ל-`null`, כדי שהתוסף לא יציג שורת מחבר ריקה.
  static String? _text(Object? value) {
    final text = value?.toString().trim();
    return (text == null || text.isEmpty) ? null : text;
  }

  /// הנתיב בעץ בלי שם הספר. כל רכיב עובר [ResponsaNames.displayOf] כי במאגר
  /// הוא מאוחסן בסדר חזותי, ובלי הסידור הנתיב מוצג שבור.
  static String contextPathOf(String refPath) {
    final parts = refPath
        .split(pathSeparator)
        .map((part) => ResponsaNames.displayOf(part))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.length <= 1) return '';
    return parts.sublist(0, parts.length - 1).join('/');
  }
}
