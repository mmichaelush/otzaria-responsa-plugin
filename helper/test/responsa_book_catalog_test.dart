import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_author_table_reader.dart';
import 'package:responsa_helper/src/text/responsa_author_table.dart';
import 'package:responsa_helper/src/text/responsa_book_catalog.dart';
import 'package:test/test.dart';

/// טקסט בקידוד הארכיון: CP862, סוגריים הפוכים, `\0` כמפריד.
List<int> cp862(String text) => [
  for (final unit in text.codeUnits)
    switch (unit) {
      >= 0x05D0 && <= 0x05EA => 0x80 + unit - 0x05D0,
      0x28 => 0x29,
      0x29 => 0x28,
      0x5B => 0x5D,
      0x5D => 0x5B,
      _ => unit,
    },
];

/// רשומה של `FILE06`, כמו ב-CD25.
List<int> entry(int id, String text, {int group = 3, int part = 0}) {
  final body = cp862(text);
  return [
    group,
    id >> 8,
    id & 0xFF,
    part,
    body.length & 0xFF,
    body.length >> 8,
    ...body,
  ];
}

Uint8List catalog(List<List<int>> entries) => Uint8List.fromList([
  // הכותרת של CD25.
  0xE4, 0x05, 0x01, 0x00, 0xA9, 0x7A, 0x02, 0x00,
  for (final e in entries) ...e,
]);

void main() {
  group('authorOf — צורות הרשומה ב-CD25', () {
    test('מחבר של ספר אחד: הספר בסוגריים נשמט, השם בסדר של FILE65', () {
      expect(
        ResponsaBookCatalog.authorOf(
          'אבא שאול, ר\' בן ציון (שו"ת אור לציון)\u0000שו"ת אור לציון'
          '*אבא שאול בן ציון',
        ),
        "ר' בן ציון אבא שאול",
      );
    });

    test('כינוי ואחריו הספר: הכינוי נשאר, לחיפוש', () {
      expect(
        ResponsaBookCatalog.authorOf(
          'אבן דאוד, ר\' אברהם בן דוד הלוי (הראב"ד [הראשון]; ספר האמונה '
          'הרמה)\u0000אמונה רמה*אבן דאוד אברהם',
        ),
        'ר\' אברהם בן דוד הלוי אבן דאוד (הראב"ד [הראשון])',
      );
    });

    test('מחבר של כמה ספרים: מה שבסוגריים הוא כינוי', () {
      expect(
        ResponsaBookCatalog.authorOf(
          'אבן גבירול, ר\' שלמה בן יהודה (רשב"ג)*מבחר הפנינים\u0000מבחר '
          'פנינים*שלמה אבן גבירול',
        ),
        'ר\' שלמה בן יהודה אבן גבירול (רשב"ג)',
      );
    });

    test('בלי פסיק ובלי חלופות למחבר', () {
      expect(
        ResponsaBookCatalog.authorOf(
          'ר\' אברהם בן הרמב"ם*שו"ת רבי אברהם בן הרמב"ם\u0000שו"ת ברכת אברהם',
        ),
        'ר\' אברהם בן הרמב"ם',
      );
    });

    test('רשומת ספר אינה מחבר', () {
      expect(ResponsaBookCatalog.authorOf('אבן האזל\u0000אבן האזל'), isNull);
    });
  });

  group('authors', () {
    test('לפי מזהה החיבור, רק רשומות מחבר', () {
      final authors = ResponsaBookCatalog.authors(
        catalog([
          entry(2401, 'אבן האזל\u0000אבן האזל', group: 63),
          entry(2401, "מלצר, ר' איסר זלמן (אבן האזל)\u0000אבן האזל*מלצר"),
          entry(6216, 'אבא שאול, ר\' בן ציון (שו"ת אור לציון)\u0000x*y'),
        ]),
      )!;
      expect(authors, {2401: "ר' איסר זלמן מלצר", 6216: "ר' בן ציון אבא שאול"});
    });

    test('חיבור בתוך חיבור (חלק שאינו 0) ומזהה 0 אינם נלקחים', () {
      final authors = ResponsaBookCatalog.authors(
        catalog([
          entry(1825, "ר' אברהם בן דוד*בעלי הנפש\u0000בעלי הנפש*ראב\"ד"),
          entry(
            1825,
            'ר\' זרחיה הלוי (רז"ה)*השגות הרז"ה\u0000השגות*זרחיה',
            part: 18,
          ),
          entry(0, "קארו, ר' יוסף*שולחן ערוך\u0000שו\"ע*קארו"),
        ]),
      )!;
      expect(authors, {1825: "ר' אברהם בן דוד"});
    });

    test('שני מחברים לאותו חיבור: שניהם', () {
      final authors = ResponsaBookCatalog.authors(
        catalog([
          entry(5021, 'דוראן, ר\' צמח (שו"ת יכין ובועז ח"א)\u0000a*b'),
          entry(5021, 'דוראן, ר\' שמעון (שו"ת יכין ובועז ח"ב)\u0000a*b'),
        ]),
      )!;
      expect(authors[5021], "ר' צמח דוראן; ר' שמעון דוראן");
    });

    test('רשומות שאינן מכסות את הקובץ בדיוק — המבנה אינו מוכר', () {
      final bytes = catalog([entry(2401, "מלצר, ר' איסר זלמן*a\u0000b*c")]);
      expect(
        ResponsaBookCatalog.authors(Uint8List.fromList([...bytes, 0x03])),
        isNull,
      );
      expect(ResponsaBookCatalog.authors(Uint8List(4)), isNull);
    });
  });

  test('ארכיון בלי מחברים ב-FILE65: המחברים מהקטלוג (29, 32)', () {
    final dir = Directory.systemTemp.createTempSync('responsa_catalog06');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file06 = catalog([
      entry(2401, "מלצר, ר' איסר זלמן (אבן האזל)\u0000אבן האזל*מלצר"),
    ]);
    // FILE65 בלי אף אדם (`ר' `): כך הטבלה נראית לשירות ב-29 וב-32.
    final file65 = Uint8List(ResponsaAuthorTable.recordSize)
      ..[1] = 1
      ..setAll(2, cp862('אבן האזל'));
    const headerSize = 2 + 2 * ResponsaAuthorTable.directoryEntrySize;
    final header = ByteData(headerSize)..setUint16(0, 2, Endian.little);
    final bytes = header.buffer.asUint8List();
    void dir0(int index, String name, int offset, int size) {
      final at = 2 + index * ResponsaAuthorTable.directoryEntrySize;
      bytes.setAll(at, name.codeUnits);
      header
        ..setUint32(at + 20, offset, Endian.little)
        ..setUint32(at + 24, size, Endian.little);
    }

    dir0(0, 'FILE65.RN2', headerSize, file65.length);
    dir0(1, 'FILE06', headerSize + file65.length, file06.length);
    final archive = File(p.join(dir.path, 'FILE00'))
      ..writeAsBytesSync([...bytes, ...file65, ...file06]);

    final table = ResponsaAuthorTableReader.forArchive(archive.path);
    expect(table.source, 'FILE06');
    expect(table.authorOf(2401), "ר' איסר זלמן מלצר");
    expect(table.knows(2401), isTrue);
    // חיבור בלי רשומת מחבר אינו "מוכר": הביבליוגרפיה יכולה למלא אותו.
    expect(table.knows(3), isFalse);
  });
}
