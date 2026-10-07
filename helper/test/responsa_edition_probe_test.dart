import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_edition_probe.dart';
import 'package:test/test.dart';

/// המזהים כפי שנמדדו ב-CD25 (7.10.2026); מהדורה שבה הם שונים נכתבת ביומן.
void main() {
  Map<String, Set<int>> cd25() => {
    for (final e in ResponsaEditionProbe.cd25.entries) e.key: e.value.toSet(),
  };

  test('CD25 עצמו: כל החלונות כמו שנמדדו', () {
    expect(
      ResponsaEditionProbe.describe(cd25(), {
        1173: ' &הצג חלון ניהול הצורות',
        1024: ' חיפוש בכל ה&מאגרים  ',
      }),
      '"חיפוש מתקדם" as CD25; "חיפוש קל" as CD25; '
      '"חיפוש טבלאי" as CD25; "חיפוש בניסוח חופשי" as CD25',
    );
  });

  test('מהדורה אחרת: מזהה חסר, חלון שלא נפתח, חלון לא מוכר, כיתוב אחר', () {
    final windows = cd25()
      ..remove('חיפוש בניסוח חופשי')
      ..['חיפוש מתקדם']!.remove(1065)
      ..['חיפוש חכם'] = {1207, 1209};
    expect(
      ResponsaEditionProbe.describe(windows, {1173: 'בתוך פסקה'}),
      '"חיפוש מתקדם" missing 1065; "חיפוש קל" as CD25; '
      '"חיפוש טבלאי" as CD25; "חיפוש בניסוח חופשי" not opened yet; '
      'unknown window "חיפוש חכם"; 1173 is "בתוך פסקה"',
    );
  });

  test('שורה לכל מהדורה בקובץ, ושינוי מחליף אותה', () {
    final dir = Directory.systemTemp.createTempSync('responsa_editions');
    addTearDown(() => dir.deleteSync(recursive: true));
    final file = File(p.join(dir.path, ResponsaEditionProbe.fileName));
    ResponsaEditionProbe.record('edition 25', 'a', into: file);
    ResponsaEditionProbe.record('edition 31', 'b', into: file);
    ResponsaEditionProbe.record('edition 25', 'c', into: file);
    expect(file.readAsLinesSync(), ['edition 25: c', 'edition 31: b']);
  });
}
