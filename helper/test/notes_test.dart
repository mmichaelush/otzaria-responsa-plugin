import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/notes/annot_reader.dart';
import 'package:responsa_helper/src/notes/notes_store.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/notes_service.dart';
import 'package:responsa_helper/src/text/responsa_text_decoding.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:test/test.dart';

/// הסכמה של `annot_db` כפי שנמדדה בהתקנה אמיתית (docs/01 §3).
const String _commentSchema =
    'CREATE TABLE COMMENT (id INTEGER, auth INTEGER, book INTEGER, '
    'doc INTEGER, piska INTEGER, mishpat INTEGER, word INTEGER, '
    'offset INTEGER, type INTEGER, map INTEGER, links INTEGER, '
    'vupdate INTEGER, mark_col INTEGER, mark_num INTEGER, cmnt TEXT, '
    'source TEXT, date TEXT, mila TEXT, src_internal TEXT, koteret TEXT, '
    'data1 TEXT, data2 TEXT, flag1 INTEGER, flag2 INTEGER)';

void main() {
  late Directory dir;

  setUp(() => dir = Directory.systemTemp.createTempSync('notes-test-'));
  tearDown(() => dir.deleteSync(recursive: true));

  /// קובץ הערות בסכמה האמיתית. כל שורה: מה שנבדק בלבד, השאר ריק.
  String writeAnnot(
    List<Map<String, Object?>> rows, {
    String schema = _commentSchema,
    String name = 'annot_db',
  }) {
    final file = p.join(dir.path, name);
    final db = sqlite3.open(file)..execute(schema);
    for (final row in rows) {
      final columns = row.keys.toList();
      db.execute(
        'INSERT INTO COMMENT (${columns.join(', ')}) '
        'VALUES (${List.filled(columns.length, '?').join(', ')})',
        row.values.toList(),
      );
    }
    db.close();
    return file;
  }

  group('ResponsaTextDecoding', () {
    test('UTF-8 תקין נשאר כמות שהוא', () {
      expect(
        ResponsaTextDecoding.decode(utf8.encode('שלום עולם')),
        'שלום עולם',
      );
    });

    test('בתים של Windows-1255 הופכים לעברית ולא לסימני שאלה', () {
      // "שלום" ב-1255: ש=0xF9 ל=0xEC ו=0xE5 ם=0xED
      expect(
        ResponsaTextDecoding.decode(const [0xF9, 0xEC, 0xE5, 0xED]),
        'שלום',
      );
    });

    test('ניקוד וסימן כיוון', () {
      // ב + חיריק (0xC4) + א + סימן כיוון משמאל לימין (0xFD)
      expect(
        ResponsaTextDecoding.windows1255(const [0xE1, 0xC4, 0xE0, 0xFD]),
        'בִא‎',
      );
    });

    test('ריק, לוב ומספר', () {
      expect(ResponsaTextDecoding.decode(const []), '');
      expect(ResponsaTextDecoding.fromSqlite(null), isNull);
      expect(ResponsaTextDecoding.fromSqlite(7), '7');
      expect(
        ResponsaTextDecoding.fromSqlite(Uint8List.fromList(utf8.encode('א'))),
        'א',
      );
    });
  });

  group('AnnotReader', () {
    test('קובץ שאינו קיים: אין הערות, בלי שגיאה', () {
      final snapshot = AnnotReader.read(p.join(dir.path, 'missing'));
      expect(snapshot.notes, isEmpty);
    });

    test('קורא את כל השדות ואת מיקום הערה', () {
      final file = writeAnnot([
        {
          'id': 41,
          'auth': 7,
          'book': 3,
          'doc': 120,
          'piska': 2,
          'mishpat': 5,
          'word': 9,
          'offset': 4,
          'type': 1,
          'cmnt': 'כדאי לעיין גם ברמב"ם',
          'source': 'ברכות דף ב עמוד א',
          'mila': 'מאימתי',
          'koteret': 'זמן קריאת שמע',
          'date': '2019-03-12',
        },
      ]);
      final note = AnnotReader.read(file).notes.single;
      // המספר הוא של השורה: `id` מתחיל מ-1 לכל מחבר.
      expect(note.id, 1);
      expect(note.text, 'כדאי לעיין גם ברמב"ם');
      expect(note.source, 'ברכות דף ב עמוד א');
      expect(note.quote, 'מאימתי');
      expect(note.title, 'זמן קריאת שמע');
      expect(note.date, '2019-03-12');
      expect(note.kind, 1);
      expect(note.position, {
        'auth': 7,
        'book': 3,
        'doc': 120,
        'piska': 2,
        'mishpat': 5,
        'word': 9,
        'offset': 4,
      });
    });

    test('הקובץ המקורי לא משתנה ולא נשאר עותק זמני', () {
      final file = writeAnnot([
        {'id': 1, 'cmnt': 'א'},
      ]);
      final before = File(file).readAsBytesSync();
      final work = Directory(p.join(dir.path, 'work'))..createSync();
      AnnotReader.read(file, workDir: work);
      expect(File(file).readAsBytesSync(), before);
      expect(work.listSync(), isEmpty);
    });

    test('id שחוזר בין מחברים אינו הופך שתי הערות לאחת', () {
      final file = writeAnnot([
        {'id': 1, 'auth': 37633, 'cmnt': 'בברכות'},
        {'id': 1, 'auth': 47627, 'cmnt': 'בשולחן ערוך'},
      ]);
      expect(AnnotReader.read(file).notes.map((n) => n.id), [1, 2]);
    });

    test('תאריך yymmdd הופך ל-ISO, וערך אחר נשאר', () {
      expect(AnnotReader.normalizeDate('261109'), '2026-11-09');
      expect(AnnotReader.normalizeDate('190312'), '2019-03-12');
      expect(AnnotReader.normalizeDate('2019-03-12'), '2019-03-12');
      expect(AnnotReader.normalizeDate('261399'), '261399');
      expect(AnnotReader.normalizeDate(null), isNull);
      final file = writeAnnot([
        {'id': 1, 'date': '261109', 'cmnt': 'x'},
      ]);
      expect(AnnotReader.read(file).notes.single.date, '2026-11-09');
    });

    test('שורה בלי גוף ובלי כותרת נספרת ואינה מוצגת', () {
      final file = writeAnnot([
        {'id': 1, 'cmnt': '   '},
        {'id': 2, 'cmnt': 'יש טקסט'},
        {'id': 3, 'koteret': 'רק כותרת'},
      ]);
      final snapshot = AnnotReader.read(file);
      expect(snapshot.notes.map((n) => n.id), [2, 3]);
      expect(snapshot.empty, 1);
    });

    test('טקסט שנשמר כ-Windows-1255 גולמי נקרא כעברית', () {
      final file = p.join(dir.path, 'annot_db');
      sqlite3.open(file)
        ..execute(_commentSchema)
        ..execute("INSERT INTO COMMENT (id, cmnt) VALUES (1, X'F9ECE5ED')")
        ..close();
      expect(AnnotReader.read(file).notes.single.text, 'שלום');
    });

    test('מהדורה בלי חלק מהעמודות: השדות החסרים ריקים', () {
      final file = writeAnnot([
        {'id': 5, 'cmnt': 'הערה', 'source': 'מקום'},
      ], schema: 'CREATE TABLE COMMENT (id INTEGER, cmnt TEXT, source TEXT)');
      final note = AnnotReader.read(file).notes.single;
      expect(note.text, 'הערה');
      expect(note.source, 'מקום');
      expect(note.title, isNull);
      expect(note.position, isEmpty);
    });

    test('קובץ בלי טבלת COMMENT: אין הערות', () {
      final file = p.join(dir.path, 'annot_db');
      sqlite3.open(file)
        ..execute('CREATE TABLE RESPVERSION (respproj TEXT)')
        ..close();
      expect(AnnotReader.read(file).notes, isEmpty);
    });

    test('קובץ שאינו SQLite: שגיאה מוסברת', () {
      final file = p.join(dir.path, 'annot_db');
      File(file).writeAsStringSync('זה לא מסד נתונים' * 50);
      expect(() => AnnotReader.read(file), throwsA(isA<AnnotReadException>()));
    });
  });

  group('NotesStore', () {
    String threeNotes() => writeAnnot([
      {'id': 1, 'cmnt': 'הרמב"ם חולק', 'source': 'ברכות ב'},
      {'id': 2, 'cmnt': 'ראה שם', 'source': 'שבת ג', 'mila': 'מוציאין'},
      {'id': 3, 'cmnt': 'סיכום', 'koteret': 'קריאת שמע'},
    ]);

    test('עמודים, ומספר ההתאמות לפני החיתוך', () {
      final store = NotesStore();
      final file = threeNotes();
      final page = store.page(file, limit: 2);
      expect(page.all, 3);
      expect(page.total, 3);
      expect(page.notes.map((n) => n.id), [1, 2]);
      expect(store.page(file, offset: 2).notes.map((n) => n.id), [3]);
    });

    test('חיפוש בכל השדות, בלי ניקוד ובלי הבדל בכתיב', () {
      final store = NotesStore();
      final file = threeNotes();
      expect(store.page(file, query: 'רמבם').notes.map((n) => n.id), [1]);
      expect(store.page(file, query: 'מוציאין').notes.map((n) => n.id), [2]);
      expect(store.page(file, query: 'קריאת שמע').notes.map((n) => n.id), [3]);
      expect(store.page(file, query: 'ברכות שבת').total, 0);
      expect(store.page(file, query: 'לא קיים').total, 0);
    });

    test('מחזיק את הקריאה עד שהקובץ משתנה', () {
      var reads = 0;
      final store = NotesStore(
        reader: (path) {
          reads++;
          return AnnotReader.read(path);
        },
      );
      final file = threeNotes();
      store.page(file);
      store.page(file, offset: 1);
      expect(reads, 1);

      sqlite3.open(file)
        ..execute("INSERT INTO COMMENT (id, cmnt) VALUES (4, 'חדשה')")
        ..close();
      expect(store.page(file).all, 4);
      expect(reads, 2);
    });

    test('היסט מחוץ לטווח מחזיר עמוד ריק ולא זורק', () {
      final page = NotesStore().page(threeNotes(), offset: 99);
      expect(page.notes, isEmpty);
      expect(page.total, 3);
    });
  });

  group('NotesService', () {
    /// התקנה שבה `DATA\annot_db` ליד התוכנה (בלי Responsa.env).
    ResponsaInstallation install(
      String name, {
      List<Map<String, Object?>>? notes,
    }) {
      final root = Directory(p.join(dir.path, name))..createSync();
      if (notes != null) {
        Directory(p.join(root.path, 'DATA')).createSync();
        final db = sqlite3.open(p.join(root.path, 'DATA', 'annot_db'))
          ..execute(_commentSchema);
        for (final row in notes) {
          db.execute('INSERT INTO COMMENT (id, cmnt) VALUES (?, ?)', [
            row['id'],
            row['cmnt'],
          ]);
        }
        db.close();
      }
      return ResponsaInstallation(
        version: 25,
        installPath: root.path,
        displayName: name,
        source: 'registry',
      );
    }

    NotesService serviceFor(
      List<ResponsaInstallation> installations, {
      String? preferred,
    }) => NotesService(
      installations: () async => installations,
      preferredInstallPath: () async => preferred,
    );

    test('בלי בר אילן: notInstalled', () {
      expect(
        serviceFor([]).list(const {}),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'notInstalled')),
      );
    });

    test('התקנה בלי קובץ הערות: available=false ולא שגיאה', () async {
      final result = await serviceFor([install('a')]).list(const {});
      expect(result['available'], false);
      expect(result['notes'], isEmpty);
    });

    test('מחזיר הערות ומספרים', () async {
      final service = serviceFor([
        install(
          'a',
          notes: [
            {'id': 1, 'cmnt': 'ראשונה'},
            {'id': 2, 'cmnt': 'שנייה'},
          ],
        ),
      ]);
      final result = await service.list({'limit': 1});
      expect(result['available'], true);
      expect(result['all'], 2);
      expect(result['total'], 2);
      expect((result['notes'] as List).length, 1);
      expect(result['modified'], isA<String>());
    });

    test('כמה התקנות: קודם זו של הקטלוג', () async {
      final first = install(
        'first',
        notes: [
          {'id': 1, 'cmnt': 'מהראשונה'},
        ],
      );
      final second = install(
        'second',
        notes: [
          {'id': 2, 'cmnt': 'מהשנייה'},
        ],
      );
      final result = await serviceFor([
        first,
        second,
      ], preferred: second.installPath.toUpperCase()).list(const {});
      final note = (result['notes'] as List).single as Map;
      expect(note['text'], 'מהשנייה');
    });

    test('בלי העדפה: ההתקנה הראשונה שיש בה קובץ הערות', () async {
      final empty = install('empty');
      final withNotes = install(
        'with',
        notes: [
          {'id': 1, 'cmnt': 'יש'},
        ],
      );
      final result = await serviceFor([empty, withNotes]).list(const {});
      expect(result['all'], 1);
    });

    test('פרמטרים לא תקינים נדחים', () {
      final service = serviceFor([install('a')]);
      for (final body in <Map<String, Object?>>[
        {'limit': 0},
        {'limit': 201},
        {'offset': -1},
        {'q': 5},
        {'q': 'א' * 201},
      ]) {
        expect(
          service.list(body),
          throwsA(isA<ApiError>().having((e) => e.code, 'code', 'badRequest')),
          reason: '$body',
        );
      }
    });

    test('קובץ פגום: notesUnreadable עם הסבר', () {
      final bad = install('bad', notes: const []);
      File(
        p.join(bad.installPath, 'DATA', 'annot_db'),
      ).writeAsStringSync('לא SQLite' * 100);
      expect(
        serviceFor([bad]).list(const {}),
        throwsA(
          isA<ApiError>().having((e) => e.code, 'code', 'notesUnreadable'),
        ),
      );
    });
  });
}
