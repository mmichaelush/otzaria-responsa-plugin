import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:test/test.dart';

/// ספר שפתיחתו הפילה את בר אילן לא נפתח שוב (בר אילן 30 קורס בכל פעם באותו
/// ספר). הרשימה נשמרת לכל התקנה, ויש לה תקרה.
void main() {
  late Directory root;
  late ResponsaBuildSkipList list;
  const install = r'C:\Program Files (x86)\ResponsaCD30C';
  const book = 'מפרשים ופוסקים על הבבלי > אחרונים על הבבלי > סדרי טהרה';

  setUp(() {
    root = Directory.systemTemp.createTempSync('responsa_skip');
    list = ResponsaBuildSkipList(File(p.join(root.path, 'build-skip.json')));
  });
  tearDown(() => root.deleteSync(recursive: true));

  test('נשמר, נקרא בכל אותיות הנתיב, ולא נוסף פעמיים', () {
    expect(list.forInstallation(install), isEmpty);
    expect(list.add(install, book), isTrue);
    expect(list.forInstallation(install.toUpperCase()), {book});
    expect(list.add(install, book), isFalse);
    // קובץ חדש, אותו מקום: נשמר בין הפעלות של השירות.
    final again = ResponsaBuildSkipList(list.file);
    expect(again.forInstallation(install), {book});
  });

  test('לכל התקנה רשימה משלה', () {
    list.add(install, book);
    expect(
      list.forInstallation(r'C:\Program Files (x86)\ResponsaCD25'),
      isEmpty,
    );
  });

  test('תקרה: אחרי עשרה ספרים לא ממשיכים לדלג', () {
    for (var i = 0; i < ResponsaBuildSkipList.maxPerInstallation; i++) {
      expect(list.add(install, '$book $i'), isTrue);
    }
    expect(list.add(install, '$book 99'), isFalse);
  });

  test('קובץ פגום אינו מפיל את הקריאה', () {
    list.file.writeAsStringSync('{not json');
    expect(list.forInstallation(install), isEmpty);
    expect(list.add(install, book), isTrue);
    expect(list.forInstallation(install), {book});
  });
}
