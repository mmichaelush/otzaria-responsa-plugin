import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

/// ספר בקטלוג בדיקה.
typedef FixtureBook = ({
  String key,
  String title,
  String refPath,
  String openRef,
  String? altRefs,
  String? author,
  String? category,
});

FixtureBook fixtureBook(
  String key,
  String title,
  String refPath, {
  String? openRef,
  String? altRefs,
  String? author,
  String? category,
}) => (
  key: key,
  title: title,
  refPath: refPath,
  openRef: openRef ?? title,
  altRefs: altRefs,
  author: author,
  category: category,
);

/// ספרים שמכסים את מקרי החיפוש: כתיב מלא/חסר, מחבר בנתיב בלבד, מחבר בשדה,
/// וכותרת שמופיעה גם כחלק מכותרת אחרת.
final List<FixtureBook> sampleBooks = [
  fixtureBook(
    '1524',
    'יבמות',
    'מפרשים ופוסקים על הבבלי > רא"ש > יבמות',
    openRef: 'רא"ש יבמות',
    altRefs: 'רא"ש על יבמות',
    category: 'תלמוד בבלי/ראשונים',
  ),
  fixtureBook(
    '7',
    'משנה ברורה',
    'משנה ברורה',
    author: 'רבי ישראל מאיר הכהן',
    category: 'הלכה/אחרונים',
  ),
  fixtureBook(
    '31',
    'חידושי אגדות',
    'מפרשים ופוסקים על הבבלי > מהרש"א > חידושי אגדות',
    openRef: 'מהרש"א חידושי אגדות',
  ),
  fixtureBook(
    '32',
    'חידושי הלכות',
    'מפרשים ופוסקים על הבבלי > מהרש"א > חידושי הלכות',
    openRef: 'מהרש"א חידושי הלכות',
  ),
  fixtureBook(
    '90',
    'שו"ת אבני נזר',
    'שו"ת > אבני נזר',
    author: 'רבי אברהם בורנשטיין',
  ),
];

/// כותב קטלוג בסכמה של [ResponsaCatalogWriter] ומחזיר את הנתיב.
String writeCatalog(
  Directory directory, {
  List<FixtureBook>? books,
  String installPath = r'C:\ResponsaCD25',
  int nodeCount = 1251889,
}) {
  final file = p.join(directory.path, 'catalog.sqlite');
  final db = sqlite3.open(file);
  try {
    db.execute('''
      CREATE TABLE books (
        book_pk INTEGER PRIMARY KEY, external_key TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL, ref_path TEXT NOT NULL, open_ref TEXT NOT NULL,
        alt_refs TEXT, category TEXT, category_path TEXT, topics TEXT,
        author TEXT, pub_place TEXT, pub_date TEXT
      )
    ''');
    db.execute(
      'CREATE TABLE db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    for (final book in books ?? sampleBooks) {
      db.execute(
        'INSERT INTO books(external_key, title, ref_path, open_ref, alt_refs,'
        ' category_path, author) VALUES(?, ?, ?, ?, ?, ?, ?)',
        [
          book.key,
          book.title,
          book.refPath,
          book.openRef,
          book.altRefs,
          book.category,
          book.author,
        ],
      );
    }
    for (final entry in {
      'responsa_version': '25',
      'install_path': installPath,
      'catalog_schema_version': '2',
      'catalog_build_time': '2026-09-27T03:03:35',
      'catalog_node_count': '$nodeCount',
    }.entries) {
      db.execute('INSERT INTO db_meta(key, value) VALUES(?, ?)', [
        entry.key,
        entry.value,
      ]);
    }
  } finally {
    db.close();
  }
  return file;
}
