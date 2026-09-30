import 'dart:io';

import 'package:test/test.dart';
import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:path/path.dart' as path;
import 'package:sqlite3/sqlite3.dart';

/// fixture של קטלוג פרויקט השו"ת, בסכמה שהגשר בונה.
String _createCatalog(Directory directory) {
  final file = path.join(directory.path, 'responsa_catalog.db');
  final db = sqlite3.open(file);
  db.execute('''
    CREATE TABLE books (
      book_pk        INTEGER PRIMARY KEY,
      external_key   TEXT NOT NULL UNIQUE,
      title          TEXT NOT NULL,
      norm_title     TEXT NOT NULL,
      ref_path       TEXT NOT NULL,
      open_ref       TEXT NOT NULL,
      volume         TEXT,
      category       TEXT,
      topics         TEXT,
      tree_param     INTEGER,
      source_version INTEGER NOT NULL
    )
  ''');
  db.execute(
    'CREATE TABLE db_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  );
  db.execute(
    'INSERT INTO books(external_key, title, norm_title, ref_path, open_ref,'
    ' category, topics, tree_param, source_version)'
    " VALUES('1524', 'יבמות', 'יבמות',"
    " 'מפרשים ופוסקים על הבבלי > רא\"ש > יבמות', 'רא\"ש יבמות',"
    " 'מפרשים ופוסקים על הבבלי', '', 12345, 25)",
  );
  db.execute(
    'INSERT INTO books(external_key, title, norm_title, ref_path, open_ref,'
    ' category, topics, tree_param, source_version)'
    " VALUES('7', 'משנה ברורה', 'משנה ברורה', 'משנה ברורה',"
    " 'משנה ברורה', 'טור, שולחן ערוך', '', 999, 25)",
  );
  for (final entry in {
    'responsa_version': '25',
    'install_path': r'C:\Program Files (x86)\ResponsaCD25',
    'exe_version': '25.0.0.0',
    'catalog_schema_version': '1',
    'catalog_build_time': '2026-09-18T03:03:35',
  }.entries) {
    db.execute('INSERT INTO db_meta(key, value) VALUES(?, ?)', [
      entry.key,
      entry.value,
    ]);
  }
  db.close();
  return file;
}

void main() {
  late Directory tempDir;
  late ResponsaCatalogRepository repository;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('otzaria-responsa-');
    repository = ResponsaCatalogRepository(_createCatalog(tempDir));
  });

  tearDown(() async {
    if (await tempDir.exists()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('טעינת ספרים', () {
    test('שורת DB הופכת לספר עם כל השדות', () async {
      final books = await repository.loadBooks();
      final yevamot = books.firstWhere((b) => b.title == 'יבמות');

      expect(yevamot.key, '1524');
      // קטגוריה שאין לה שיוך בעץ של אוצריא נשארת ריקה, ולא מנוחשת.
      expect(yevamot.otzariaCategory, isNull);
      // ההקשר הוא הנתיב בלי שם הספר — בלעדיו "יבמות" חסר משמעות.
      expect(yevamot.contextPath, 'מפרשים ופוסקים על הבבלי/רא"ש');
    });

    test('שדה חסר אינו נכתב ל-JSON', () async {
      final books = await repository.loadBooks();
      final json = books.firstWhere((b) => b.key == '7').toJson();
      expect(json.containsKey('author'), isFalse);
      expect(json['contextPath'], '');
    });

    /// קטלוג בסכמה 1 חייב להמשיך להיקרא (שדרוג קוד אסור שימחק את הספרייה
    /// מהמסך), והשדות החסרים נשארים ריקים עד לרענון.
    test('קטלוג ישן בלי עמודות מטא-דאטה נקרא, והשדות ריקים', () async {
      final books = await repository.loadBooks();
      // בלי זה, קריאה שנשברה והחזירה רשימה ריקה — בדיוק מה שהבדיקה
      // נועדה למנוע — הייתה עוברת עם לולאה ריקה.
      expect(books, isNotEmpty);
      for (final book in books) {
        expect(book.author, isNull);
        expect(book.pubDate, isNull);
        expect(book.pubPlace, isNull);
      }
    });

    test('קטגוריית בר אילן ממופה לקטגוריה של אוצריא', () {
      final book = ResponsaCatalogRepository.bookOf({
        'external_key': '3232',
        'title': 'מהרש"א חידושי אגדות',
        'ref_path': 'מפרשים > מהרש"א > חידושי אגדות',
        'category_path':
            'מפרשים ופוסקים על הבבלי והירושלמי > אחרונים על הבבלי > מהרש"א',
      });
      expect(book.otzariaCategory, 'תלמוד בבלי/אחרונים');
    });

    test('מחבר, מקום ושנת הדפסה עוברים מהקטלוג לספר', () {
      final book = ResponsaCatalogRepository.bookOf({
        'external_key': '5',
        'title': 'שו"ת אבני נזר',
        'ref_path': 'שו"ת > אבני נזר',
        'author': 'רבי אברהם בורנשטיין (פולין המאה ה- 19)',
        'pub_place': 'ירושלים',
        'pub_date': 'תשס"ו',
        'edition': 'ירושלים תשס"ו, ד"צ פיוטרקוב תרע"ב',
      });

      expect(book.author, 'רבי אברהם בורנשטיין (פולין המאה ה- 19)');
      expect(book.pubPlace, 'ירושלים');
      expect(book.pubDate, 'תשס"ו');
      expect(book.edition, 'ירושלים תשס"ו, ד"צ פיוטרקוב תרע"ב');
      expect(book.toJson()['edition'], book.edition);
    });

    test('קטלוג ישן בלי עמודת מהדורה: הספר נקרא בלי מהדורה', () {
      final book = ResponsaCatalogRepository.bookOf({
        'external_key': '5',
        'title': 'ספר',
        'ref_path': 'ספר',
      });
      expect(book.edition, isNull);
      expect(book.toJson().containsKey('edition'), isFalse);
    });

    /// הממשק מציג שורת מחבר לפי `author != null`, ולכן מחרוזת ריקה הייתה
    /// מייצרת שורה ריקה מתחת לכל ספר שאין לו מחבר.
    test('ערך ריק בקטלוג מגיע כ-null ולא כמחרוזת ריקה', () {
      final book = ResponsaCatalogRepository.bookOf({
        'external_key': '5',
        'title': 'ספר',
        'ref_path': 'ספר',
        'author': '   ',
        'pub_place': '',
      });

      expect(book.author, isNull);
      expect(book.pubPlace, isNull);
    });
  });

  group('open_ref', () {
    test('נשמר בנפרד מהכותרת', () async {
      // `openBook("יבמות")` היה פותח ספר אחר; ההקשר הוא כל ההבדל.
      expect(await repository.openRefFor('1524'), 'רא"ש יבמות');
    });

    test('מפתח שאינו קיים מחזיר null', () async {
      expect(await repository.openRefFor('99999'), isNull);
    });
  });

  group('מצב הקטלוג', () {
    test('info מחזיר ספירה וטביעת אצבע', () async {
      final info = await repository.info();
      expect(info.exists, isTrue);
      expect(info.bookCount, 2);
      expect(info.sourceVersion, 25);
      expect(info.schemaVersion, 1);
      expect(info.installPath, r'C:\Program Files (x86)\ResponsaCD25');
      expect(info.isUsable, isTrue);
    });

    test('קטלוג חסר אינו זורק — מחזיר מצב ריק', () async {
      final missing = ResponsaCatalogRepository(
        path.join(tempDir.path, 'nope.db'),
      );

      expect(await missing.exists(), isFalse);
      expect((await missing.info()).exists, isFalse);
      expect(await missing.loadBooks(), isEmpty);
      expect(await missing.openRefFor('1'), isNull);
    });

    test('קטלוג פגום אינו מפיל את החיפוש', () async {
      final corrupt = path.join(tempDir.path, 'corrupt.db');
      await File(corrupt).writeAsString('this is not a database');
      final repo = ResponsaCatalogRepository(corrupt);

      expect(await repo.loadBooks(), isEmpty);
      expect((await repo.info()).exists, isFalse);
    });
  });

  group('contextPathOf', () {
    test('מסיר את שם הספר ומשאיר את ההקשר', () {
      expect(
        ResponsaCatalogRepository.contextPathOf('ספרות חז"ל > משנה > יבמות'),
        'ספרות חז"ל/משנה',
      );
    });

    test('ספר בשורש מקבל הקשר ריק', () {
      expect(ResponsaCatalogRepository.contextPathOf('משנה ברורה'), '');
      expect(ResponsaCatalogRepository.contextPathOf(''), '');
    });
  });
}
