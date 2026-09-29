import 'package:responsa_helper/src/text/responsa_query.dart';
import 'package:test/test.dart';

/// טקסט שנבחר באוצריא מגיע עם ניקוד, טעמים, פיסוק ותווי עריכה; לבר אילן
/// מגיעות רק מילים עבריות, כי כל תו אחר הוא אופרטור בחיפוש המתקדם שלו.
void main() {
  String? query(String input) => ResponsaQuery.parse(input)?.text;

  /// תווים בלתי-נראים ותווים שקשה להבחין בהם בעין נבנים ממספרם.
  String char(int code) => String.fromCharCode(code);

  group('ניקוד וטעמים', () {
    test('ניקוד נמחק בלי לפצל מילה', () {
      expect(query('בְּרֵאשִׁית בָּרָא אֱלֹהִים'), 'בראשית ברא אלהים');
    });

    test('טעמים נמחקים', () {
      // בְּרֵאשִׁ֖ית בָּרָ֣א: טיפחא (U+0596) ומונח (U+05A3).
      final text =
          'ב${char(0x05BC)}${char(0x05B0)}ר${char(0x05B5)}אש${char(0x05C1)}'
          '${char(0x05B4)}${char(0x0596)}ית ב${char(0x05BC)}${char(0x05B8)}'
          'ר${char(0x05B8)}${char(0x05A3)}א';
      expect(query(text), 'בראשית ברא');
    });

    test('מקף מפריד בין מילים', () {
      expect(query('עַל${char(0x05BE)}פְּנֵי הַמָּיִם'), 'על פני המים');
    });

    test('סוף פסוק ופסק מפרידים', () {
      expect(query('הָאָרֶץ${char(0x05C3)} וַיֹּאמֶר'), 'הארץ ויאמר');
      expect(query('אֶחָד ${char(0x05C0)} שְׁנַיִם'), 'אחד שנים');
    });

    test('תווים בלתי-נראים אינם שוברים מילה', () {
      expect(query('של${char(0x200F)}ום ע${char(0x034F)}ולם'), 'שלום עולם');
      expect(query('${char(0xFEFF)}שלום${char(0x200B)}'), 'שלום');
    });
  });

  group('גרשיים וגרש', () {
    test('ראשי תיבות נשמרים', () {
      expect(query('דברי הרמב"ם'), 'דברי הרמב"ם');
      expect(query('אמר ר\' יוחנן'), 'אמר ר\' יוחנן');
    });

    test('גרשיים וגרש עבריים מנורמלים', () {
      expect(query('רמב${char(0x05F4)}ם'), 'רמב"ם');
      expect(query('ר${char(0x05F3)} יוחנן'), 'ר\' יוחנן');
    });

    test('מירכאות טיפוגרפיות מנורמלות', () {
      expect(query('רמב${char(0x201D)}ם'), 'רמב"ם');
      expect(query('ר${char(0x2019)} יוחנן'), 'ר\' יוחנן');
      expect(query('ר` יוחנן'), 'ר\' יוחנן');
    });

    test('שני גרשים הם גרשיים', () {
      expect(query("רמב''ם"), 'רמב"ם');
    });

    test('מירכאות סביב מילה נמחקות', () {
      expect(query('"שלום"'), 'שלום');
      expect(query('${char(0x201C)}שלום${char(0x201D)} לכם'), 'שלום לכם');
      expect(query('(\'שלום\')'), 'שלום\'');
    });

    test('גרש לפני מילה נמחק', () {
      expect(query('\'שלום'), 'שלום');
    });
  });

  group('תווים שאינם מילים עבריות', () {
    test('אופרטורים של החיפוש המתקדם', () {
      expect(
        query('#שלום *עולם! +אבא \$אמא -בן <בת> {אח} %אחות ^דוד ~דודה ?'),
        'שלום עולם אבא אמא בן בת אח אחות דוד דודה',
      );
    });

    test('פיסוק וסוגריים', () {
      expect(
        query('שלום, עולם. (אבא) [אמא]; בן: בת?'),
        'שלום עולם אבא אמא בן בת',
      );
    });

    test('אנגלית וספרות', () {
      expect(query('Rambam רמב"ם 123 hilchot הלכות'), 'רמב"ם הלכות');
      expect(query('דף 23 ע"ב'), 'דף ע"ב');
    });

    test('ליגטורות יידיש', () {
      expect(query('${char(0x05F0)}ארט'), 'ווארט');
    });

    test('רווחים מרובים', () {
      expect(query('  שלום \n\t עולם  '), 'שלום עולם');
    });
  });

  group('חיתוך', () {
    test('עד ${ResponsaQuery.maxWords} מילים', () {
      final words = [for (var i = 0; i < 15; i++) 'מילה'];
      final parsed = ResponsaQuery.parse(words.join(' '))!;
      expect(parsed.text.split(' '), hasLength(ResponsaQuery.maxWords));
      expect(parsed.truncated, isTrue);
    });

    test('בדיוק בתקרה אינו נחתך', () {
      final words = [for (var i = 0; i < ResponsaQuery.maxWords; i++) 'אב'];
      final parsed = ResponsaQuery.parse(words.join(' '))!;
      expect(parsed.truncated, isFalse);
    });

    test('תקרת אורך', () {
      final words = [for (var i = 0; i < 8; i++) 'א' * 20];
      final parsed = ResponsaQuery.parse(words.join(' '))!;
      expect(parsed.text.length, lessThanOrEqualTo(ResponsaQuery.maxLength));
      expect(parsed.truncated, isTrue);
    });

    test('מילה אחת ארוכה מהתקרה נחתכת', () {
      final parsed = ResponsaQuery.parse('ב' * 300)!;
      expect(parsed.text, hasLength(ResponsaQuery.maxLength));
      expect(parsed.truncated, isTrue);
    });

    test('בחירה קצרה אינה נחתכת', () {
      expect(ResponsaQuery.parse('שלום עולם')!.truncated, isFalse);
    });
  });

  group('אין מה לחפש', () {
    test('ריק', () {
      expect(ResponsaQuery.parse(''), isNull);
      expect(ResponsaQuery.parse(null), isNull);
      expect(ResponsaQuery.parse('   '), isNull);
    });

    test('פיסוק בלבד', () {
      expect(ResponsaQuery.parse('?!.,;:()[]{}"\'-*#'), isNull);
    });

    test('אנגלית וספרות בלבד', () {
      expect(ResponsaQuery.parse('Hello world 2026'), isNull);
    });

    test('ניקוד בלבד', () {
      expect(ResponsaQuery.parse('${char(0x05B8)}${char(0x0596)}'), isNull);
    });
  });
}
