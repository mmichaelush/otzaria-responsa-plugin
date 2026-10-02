import 'package:responsa_helper/src/text/responsa_advanced_query.dart';
import 'package:test/test.dart';

/// השאילתות כאן נבדקו חי בחיפוש המתקדם של CD25 (2.10.2026): התחביר עובר
/// כמות שהוא, ובר אילן הוא שבודק אותו.
void main() {
  String parse(String input) => ResponsaAdvancedQuery.parse(input).text;

  group('עובר כמות שהוא', () {
    for (final query in [
      'נר [1:4] שבת',
      'חכמים [-1:1] תקנו',
      '10: עגונה גוי עדות',
      '(קוצץ/עוקר/משחית) [1:3] (עץ/אילן/נטיעה)',
      '#!אהרון הכהן',
      '#נר# -בני',
      r'8: ($שומר/%מצא) #(אכל/גנב/מכר) *(פקדון/אבידה)*',
      '*ט(ע/י/@)ל(ע/י/@)פ(א/ו)ן*',
      '*א~~ב* ^אמר',
      '<שבט> {חיפוש}',
      'רמב"ם ר\' יוסי',
    ]) {
      test(query, () => expect(parse(query), query));
    }
  });

  test('ניקוד, גרשיים טיפוגרפיים ורווחים כפולים מנורמלים', () {
    expect(parse('  בְּרֵאשִׁית   [1:4]  רמב״ם '), 'בראשית [1:4] רמב"ם');
  });

  group('נדחה עם הסבר', () {
    void rejects(String input, String fragment) {
      expect(
        () => ResponsaAdvancedQuery.parse(input),
        throwsA(
          isA<FormatException>().having(
            (e) => e.message,
            'message',
            contains(fragment),
          ),
        ),
        reason: input,
      );
    }

    test('בלי עברית', () => rejects('[1:4] 10:', 'אין אף מילה'));
    test('תו זר', () => rejects('נר & שבת', '"&"'));
    test('לטינית', () => rejects('נר shabbat', '"s"'));
    test('שורה חדשה', () => rejects('נר\nשבת', 'בשורה אחת'));
    test('ארוך מדי', () => rejects('שבת ' * 100, 'ארוכה מדי'));
    test('סוגר שלא נסגר', () => rejects('(עץ/אילן', '"("'));
    test('סוגר בלי פותח', () => rejects('נר [1:4]] שבת', '"]"'));
    test('סוגרים מוצלבים', () => rejects('(עץ [1:4) שבת]', '")"'));
  });
}
