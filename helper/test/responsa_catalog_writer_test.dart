import 'dart:io';

import 'package:test/test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite3;
import 'package:responsa_helper/src/native/responsa_catalog_builder.dart';
import 'package:responsa_helper/src/native/responsa_catalog_writer.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/catalog/responsa_catalog_schema.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:responsa_helper/src/text/responsa_author_table.dart';
import 'package:responsa_helper/src/text/responsa_structure.dart';
import 'package:path/path.dart' as p;

/// בנייה שנכשלה חייבת להשאיר את הקטלוג הקיים: אי אפשר להוריד אותו מהרשת,
/// ובנייה מלאה מההתקנה אורכת דקות ארוכות.
void main() {
  late Directory dir;
  late String target;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('responsa_writer');
    target = p.join(dir.path, 'responsa_catalog.db');
  });
  tearDown(() {
    try {
      dir.deleteSync(recursive: true);
    } on FileSystemException {
      // Windows מחזיק קובץ פתוח רגע אחרי הסגירה; תיקייה זמנית שנשארה
      // אינה כשל של הבדיקה.
    }
  });

  const fingerprint = ResponsaFingerprint(
    version: 25,
    installPath: r'C:\Program Files (x86)\ResponsaCD25',
    file00Size: 2140586529,
  );

  /// עץ מינימלי: מדף, ותחתיו חיבורים (סוג 4) שלכל אחד סימן אחד.
  /// ספר = צומת שתוכנו מקטעים ואינו מקטע בעצמו, ולכן הסימן חובה.
  List<ResponsaTreeNode> tree(List<String> titles) => [
    ResponsaTreeNode(
      name: 'שו"ת',
      param: 1 << 16,
      level: 0,
      path: 'שו"ת',
      childCount: titles.length,
    ),
    for (final (i, title) in titles.indexed) ...[
      ResponsaTreeNode(
        name: title,
        param: (ResponsaStructure.workKind << 16) | (i + 1),
        level: 1,
        path: 'שו"ת${ResponsaTreeReader.pathSeparator}$title',
        childCount: 1,
      ),
      ResponsaTreeNode(
        name: 'סימן א',
        param: (5 << 16) | (i + 1),
        level: 2,
        path:
            'שו"ת${ResponsaTreeReader.pathSeparator}$title'
            '${ResponsaTreeReader.pathSeparator}סימן א',
        childCount: 0,
      ),
    ],
  ];

  List<String> titlesIn(String path) {
    final db = sqlite3.sqlite3.open(path, mode: sqlite3.OpenMode.readOnly);
    try {
      return [
        for (final row in db.select('SELECT title FROM books ORDER BY title'))
          row['title'].toString(),
      ];
    } finally {
      db.close();
    }
  }

  test('בנייה ראשונה כותבת קטלוג קריא', () {
    final result = ResponsaCatalogWriter.build(
      nodes: tree(['אבני נזר', 'חתם סופר']),
      fingerprint: fingerprint,
      targetPath: target,
    );

    expect(result.books, 2);
    expect(titlesIn(target), ['אבני נזר', 'חתם סופר']);
    expect(File('$target.building').existsSync(), isFalse);
  });

  test('בנייה שנייה מחליפה את הקודמת', () {
    ResponsaCatalogWriter.build(
      nodes: tree(['אבני נזר']),
      fingerprint: fingerprint,
      targetPath: target,
    );
    ResponsaCatalogWriter.build(
      nodes: tree(['אבני נזר', 'ערוך לנר']),
      fingerprint: fingerprint,
      targetPath: target,
    );

    expect(titlesIn(target), ['אבני נזר', 'ערוך לנר']);
    expect(File('$target.previous').existsSync(), isFalse);
  });

  /// עץ בלי אף צומת מסוג "חיבור" — למשל כשהקריאה מהתהליך נכשלה
  /// והוחזרה רשימה ריקה. הקטלוג הקיים **אינו** נמחק.
  test('בנייה בלי ספרים נכשלת, והקטלוג הקיים נשאר', () {
    ResponsaCatalogWriter.build(
      nodes: tree(['אבני נזר']),
      fingerprint: fingerprint,
      targetPath: target,
    );

    expect(
      () => ResponsaCatalogWriter.build(
        nodes: const [],
        fingerprint: fingerprint,
        targetPath: target,
      ),
      throwsA(isA<ResponsaCatalogBuildException>()),
    );

    expect(titlesIn(target), ['אבני נזר']);
    expect(File('$target.building').existsSync(), isFalse);
  });

  test('הקטלוג נושא את גרסת הסכמה ואת נתיב ההתקנה', () {
    ResponsaCatalogWriter.build(
      nodes: tree(['אבני נזר']),
      fingerprint: fingerprint,
      targetPath: target,
    );

    final db = sqlite3.sqlite3.open(target, mode: sqlite3.OpenMode.readOnly);
    try {
      final meta = {
        for (final row in db.select('SELECT key, value FROM db_meta'))
          row['key'].toString(): row['value'].toString(),
      };
      expect(meta['catalog_schema_version'], '$responsaCatalogSchemaVersion');
      expect(meta['install_path'], fingerprint.installPath);
      // מפתח ישן (`catalog_node_count`, העץ כולו) אינו נכתב: אינו מכנה טוב.
      expect(meta.containsKey('catalog_node_count'), isFalse);
    } finally {
      db.close();
    }
  });

  // המכנה של ההתקדמות בבנייה הבאה: מה שהסריקה קראה הפעם.
  test('מספר הצמתים שנסרקו חוזר מהקטלוג', () async {
    final nodes = tree(['אבני נזר', 'חתם סופר']);
    ResponsaCatalogWriter.build(
      nodes: nodes,
      fingerprint: fingerprint,
      targetPath: target,
    );
    final repository = ResponsaCatalogRepository(target);
    expect((await repository.info()).nodeCount, nodes.length);
  });

  test(
    'קטלוג של 0.4 (רק `catalog_node_count`): אין מכנה מהבנייה הקודמת',
    () async {
      ResponsaCatalogWriter.build(
        nodes: tree(['אבני נזר']),
        fingerprint: fingerprint,
        targetPath: target,
      );
      final db = sqlite3.sqlite3.open(target);
      try {
        db.execute("DELETE FROM db_meta WHERE key = 'catalog_scanned_nodes'");
        db.execute(
          "INSERT INTO db_meta(key, value) VALUES('catalog_node_count', '1251889')",
        );
      } finally {
        db.close();
      }
      final repository = ResponsaCatalogRepository(target);
      expect((await repository.info()).nodeCount, isNull);
    },
  );

  group('fillAuthors — השלמת המחברים בלי קריאה מלאה', () {
    Map<String, String?> authorsIn(String path) {
      final db = sqlite3.sqlite3.open(path, mode: sqlite3.OpenMode.readOnly);
      try {
        return {
          for (final row in db.select('SELECT title, author FROM books'))
            row['title'].toString(): row['author'] as String?,
        };
      } finally {
        db.close();
      }
    }

    Map<String, String> metaIn(String path) {
      final db = sqlite3.sqlite3.open(path, mode: sqlite3.OpenMode.readOnly);
      try {
        return {
          for (final row in db.select('SELECT key, value FROM db_meta'))
            row['key'].toString(): row['value'].toString(),
        };
      } finally {
        db.close();
      }
    }

    test('רק מה שמעל הספרים נפתח, והמחבר לפי מזהה החיבור', () {
      final nodes = tree(['אבני נזר', 'חתם סופר']);
      ResponsaCatalogWriter.build(
        nodes: nodes,
        fingerprint: fingerprint,
        targetPath: target,
      );
      expect(ResponsaCatalogWriter.ancestorPaths(target), {'שו"ת'});

      // ההליכה החלקית: השורש והספרים, בלי הסימנים שמתחתם.
      final walked = [
        for (final node in nodes)
          if (node.level < 2) node,
      ];
      // `אבני נזר` הוא 0x40001 בעץ, ולכן 256 בטבלה.
      final result = ResponsaCatalogWriter.fillAuthors(
        nodes: walked,
        targetPath: target,
        authors: ResponsaAuthorTable.fromCatalog({
          256: "ר' אברהם בורנשטיין (אבני נזר)",
        }),
      );

      expect(result, (books: 2, matched: 2, withAuthor: 1));
      expect(authorsIn(target), {
        'אבני נזר': "ר' אברהם בורנשטיין (אבני נזר)",
        'חתם סופר': null,
      });
      final meta = metaIn(target);
      expect(meta['author_table_entries'], '1');
      expect(meta['author_source'], 'FILE06');
      expect(meta['books_with_author'], '1');
      expect(File('$target.building').existsSync(), isFalse);
    });

    test('ספר שהנתיב שלו לא נמצא בעץ נשאר כמו שהיה', () {
      ResponsaCatalogWriter.build(
        nodes: tree(['אבני נזר']),
        fingerprint: fingerprint,
        targetPath: target,
      );
      final result = ResponsaCatalogWriter.fillAuthors(
        nodes: tree(['אחר']).where((n) => n.level < 2).toList(),
        targetPath: target,
        authors: ResponsaAuthorTable.fromCatalog({256: "ר' מישהו"}),
      );
      expect(result.matched, 0);
      expect(authorsIn(target), {'אבני נזר': null});
    });

    test('רשימה של התקנה אחרת, או שאין רשימה — מסרבים', () {
      const installation = ResponsaInstallation(
        version: 25,
        installPath: r'C:\Program Files (x86)\ResponsaCD25',
        displayName: 'פרויקט השו"ת 25',
        source: 'registry',
      );
      expect(
        ResponsaCatalogWriter.authorsFillRefusal(target, installation),
        isNotNull,
      );
      ResponsaCatalogWriter.build(
        nodes: tree(['אבני נזר']),
        fingerprint: fingerprint,
        targetPath: target,
      );
      expect(
        ResponsaCatalogWriter.authorsFillRefusal(target, installation),
        isNull,
      );
      const other = ResponsaInstallation(
        version: 32,
        installPath: r'C:\Program Files (x86)\ResponsaCD32C',
        displayName: 'פרויקט השו"ת 32',
        source: 'registry',
      );
      expect(
        ResponsaCatalogWriter.authorsFillRefusal(target, other),
        contains('התקנה אחרת'),
      );
    });

    test('בלי מחברים בארכיון: נרשם, וההצעה לא חוזרת', () {
      ResponsaCatalogWriter.build(
        nodes: tree(['אבני נזר']),
        fingerprint: fingerprint,
        targetPath: target,
      );
      ResponsaCatalogWriter.markAuthorsUnavailable(target);
      expect(metaIn(target)['author_source'], 'none');
      expect(
        metaIn(target)['authors_checked_revision'],
        '${ResponsaAuthorTable.readerRevision}',
      );
    });

    test('"אין מחברים" שנרשם בקריאה ישנה של הארכיון — מוצע להשלמה שוב', () {
      final empty = {'author_table_entries': '0'};
      expect(HelperService.authorsFillable(empty), isTrue);
      // רשום "none" בלי גרסה (0.6.3): הקריאה השתפרה מאז.
      expect(
        HelperService.authorsFillable({...empty, 'author_source': 'none'}),
        isTrue,
      );
      expect(
        HelperService.authorsFillable({
          ...empty,
          'author_source': 'none',
          'authors_checked_revision': '${ResponsaAuthorTable.readerRevision}',
        }),
        isFalse,
      );
      expect(
        HelperService.authorsFillable({'author_table_entries': '1398'}),
        isFalse,
      );
    });
  });
}
