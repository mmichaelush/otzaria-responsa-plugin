import 'package:responsa_helper/src/native/responsa_search_scope.dart';
import 'package:test/test.dart';

/// השמות כאן מעץ המאגרים של "חיפוש מתקדם" ב-CD25 (2.10.2026), בסדר
/// החזותי שבו העץ שומר אותם, מול שמות התצוגה שבקטלוג (עץ העיון).
void main() {
  int? match(String wanted, List<String> tree) =>
      ResponsaSearchScope.matchName(wanted, tree);

  const roots = [
    'תנ"ך',
    'ספרות חז"ל',
    'מפרשי תנ"ך',
    '(ספרי שאלות ותשובות (שו"ת',
    'אנציקלופדיות שונות',
  ];

  test('שם זהה, אחרי סידור הסוגריים', () {
    expect(match('ספרי שאלות ותשובות (שו"ת)', roots), 3);
    expect(match('ספרות חז"ל', roots), 1);
  });

  test('הסתייגות שקיימת רק בעץ העיון', () {
    expect(match('תנ"ך (החומש מחולק לפרקים)', roots), 0);
    expect(match('מפרשי תנ"ך (החומש מחולק לפרקים)', roots), 2);
  });

  test('כתיב מלא וחסר', () {
    expect(match('אנצקלופדיות שונות', roots), 4);
  });

  test('לא נמצא, או יותר מהתאמה אחת', () {
    expect(match('זוהר', roots), isNull);
    expect(match('ספרי', ['ספרי הלכה', 'ספרי מוסר']), isNull);
  });

  test('"/" בשם הומר בקטלוג ל-"∕"', () {
    expect(match('אבן/שהם'.replaceAll('/', '∕'), ['אבן/שהם']), 0);
  });
}
