import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:test/test.dart';

/// ספר שבר אילן קרס בפתיחתו פעמיים לא נפתח שוב (בר אילן 30 קורס בכל פעם
/// באותו ספר). קריסה אחת אינה מספיקה: סגירה בידי המשתמש או קריסה אקראית לא
/// ימחקו ספר מהרשימה לתמיד. הרשימה לכל התקנה, ומתאפסת כשההתקנה משתנה.
void main() {
  late Directory root;
  late ResponsaBuildSkipList list;
  const install = r'C:\Program Files (x86)\ResponsaCD30C';
  const identity = '{"responsa_version":"30"}';
  const book = 'מפרשים ופוסקים על הבבלי > אחרונים על הבבלי > סדרי טהרה';

  setUp(() {
    root = Directory.systemTemp.createTempSync('responsa_skip');
    list = ResponsaBuildSkipList(File(p.join(root.path, 'build-skip.json')));
  });
  tearDown(() => root.deleteSync(recursive: true));

  test('ספר לא נפתח רק אחרי שתי קריסות', () {
    expect(list.recordCrash(install, identity, book), 1);
    expect(list.forInstallation(install, identity), isEmpty);
    expect(list.recordCrash(install, identity, book), 2);
    expect(list.forInstallation(install, identity), {book});
    // נשמר בין הפעלות של השירות, ובכל אותיות הנתיב.
    final again = ResponsaBuildSkipList(list.file);
    expect(again.forInstallation(install.toUpperCase(), identity), {book});
  });

  test('התקנה ששונתה (טביעת אצבע אחרת) מתחילה מאפס', () {
    list.recordCrash(install, identity, book);
    list.recordCrash(install, identity, book);
    const updated = '{"responsa_version":"31"}';
    expect(list.forInstallation(install, updated), isEmpty);
    expect(list.recordCrash(install, updated, book), 1);
  });

  test('לכל התקנה רשימה משלה', () {
    list.recordCrash(install, identity, book);
    list.recordCrash(install, identity, book);
    expect(
      list.forInstallation(r'C:\Program Files (x86)\ResponsaCD25', identity),
      isEmpty,
    );
  });

  test('תקרה: ספר חדש אחרי עשרה אינו נרשם, וקריאה לא ממשיכה', () {
    for (var i = 0; i < ResponsaBuildSkipList.maxPerInstallation; i++) {
      expect(list.recordCrash(install, identity, '$book $i'), 1);
    }
    expect(list.recordCrash(install, identity, '$book 99'), 0);
    // ספר שכבר ברשימה עדיין נספר.
    expect(list.recordCrash(install, identity, '$book 0'), 2);
  });

  test('קובץ פגום או שנערך ידנית אינו מפיל את הקריאה', () {
    for (final broken in ['{not json', '[]', '{"x": 1}', '{"c:\\\\a": []}']) {
      list.file.writeAsStringSync(broken);
      expect(list.forInstallation(install, identity), isEmpty, reason: broken);
    }
    list.file.writeAsStringSync(
      '{"${install.toLowerCase().replaceAll(r'\', r'\\')}": '
      '{"identity": ${'"${identity.replaceAll('"', r'\"')}"'}, "crashes": {"a": "x", "b": 2}}}',
    );
    expect(list.forInstallation(install, identity), {'b'});
  });

  test('describe: שורה לאבחון', () {
    expect(ResponsaBuildSkipList.describe(list.file), isNull);
    list.recordCrash(install, identity, book);
    expect(ResponsaBuildSkipList.describe(list.file), contains('"$book" x1'));
  });
}
