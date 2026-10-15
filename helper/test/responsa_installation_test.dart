import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:test/test.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';

/// מספר המהדורה אינו מסונן מול רשימת מהדורות נתמכות: מהדורה שתצא מחר צריכה
/// להתגלות בלי שינוי קוד.
void main() {
  group('מספר המהדורה מכל מקור', () {
    test('שם תיקיית התקנה', () {
      expect(ResponsaInstallationDiscovery.versionFromText('ResponsaCD25'), 25);
      expect(ResponsaInstallationDiscovery.versionFromText('ResponsaCD31'), 31);
      // מהדורה שאינה קיימת היום מתגלה באותה מידה.
      expect(
        ResponsaInstallationDiscovery.versionFromText('ResponsaCD 40'),
        40,
      );
    });

    test('DisplayName בעברית מה-Registry', () {
      expect(
        ResponsaInstallationDiscovery.versionFromText('ResponsaCD25 גירסה 25'),
        25,
      );
      expect(
        ResponsaInstallationDiscovery.versionFromText('פרוייקט השו"ת גירסה 29'),
        29,
      );
    });

    test('כותרת החלון של מופע חי', () {
      // המקור האמין ביותר: הוא מגיע מהתוכנה עצמה ולכן עובד גם בהתקנה
      // שהועתקה או ששמה שונה.
      expect(
        ResponsaInstallationDiscovery.versionFromWindowTitle(
          'פרוייקט השו"ת : גירסה 25',
        ),
        25,
      );
      expect(
        ResponsaInstallationDiscovery.versionFromWindowTitle('Responsa 27'),
        27,
      );
    });

    test('טקסט בלי מספר אינו ממציא מספר', () {
      expect(ResponsaInstallationDiscovery.versionFromText('ResponsaCD'), null);
      expect(ResponsaInstallationDiscovery.versionFromText(null), null);
      expect(ResponsaInstallationDiscovery.versionFromText(''), null);
    });
  });

  group('טביעת אצבע', () {
    ResponsaFingerprint fingerprint({
      int? version = 25,
      String install = r'C:\Program Files (x86)\ResponsaCD25',
      int? size = 2140586529,
    }) => ResponsaFingerprint(
      version: version,
      installPath: install,
      file00Size: size,
    );

    test('זהות מלאה מתאימה', () {
      expect(fingerprint().matches(fingerprint()), isTrue);
    });

    test('נתיב התקנה שונה — אינו מתאים', () {
      expect(
        fingerprint().matches(fingerprint(install: r'E:\ResponsaCD25')),
        isFalse,
      );
    });

    test('גרסה שונה — אינה מתאימה', () {
      expect(fingerprint().matches(fingerprint(version: 29)), isFalse);
    });

    test('שדה שחסר באחד הצדדים אינו מכשיל', () {
      // אחרת קטלוג שנבנה לפני שנוסף שדה היה נפסל רק בגלל הוספתו —
      // וזה קורה בדיוק בהתקנה חלקית, שבה הארכיון אינו ליד קובץ ההרצה.
      expect(fingerprint().matches(fingerprint(size: null)), isTrue);
      expect(fingerprint(size: null).matches(fingerprint()), isTrue);
    });

    test('לוכסן סופי ואותיות גדולות אינם מבדילים', () {
      expect(
        fingerprint().matches(
          fingerprint(install: r'c:\program files (x86)\responsacd25\'),
        ),
        isTrue,
      );
    });

    test('מטא-דאטה עוברת הלוך ושוב', () {
      final restored = ResponsaFingerprint.fromMeta(fingerprint().toMeta());
      expect(restored, isNotNull);
      expect(restored!.matches(fingerprint()), isTrue);
    });
  });

  group('התקנה חלקית שנטענת מהתקן נשלף', () {
    late Directory root;

    setUp(() {
      root = Directory.systemTemp.createTempSync('responsa_partial');
    });

    tearDown(() {
      if (root.existsSync()) root.deleteSync(recursive: true);
    });

    ResponsaInstallation installationAt(String directory) =>
        ResponsaInstallation(
          version: null,
          installPath: directory,
          displayName: 'partial',
          source: 'filesystem',
        );

    test('תיקייה עם קובץ ההרצה היא התקנה, יהיה שמה אשר יהיה', () {
      File(p.join(root.path, 'RESPONSA.exe')).writeAsStringSync('');
      expect(installationAt(root.path).exists, isTrue);
    });

    test('אתר הנתונים נקרא מ-Responsa.env', () {
      final data = Directory(p.join(root.path, 'elsewhere'))
        ..createSync(recursive: true);
      File(p.join(root.path, 'Responsa.env')).writeAsStringSync(
        ['Something=1', 'DataLocation=${data.path}', 'Other=2'].join('\r\n'),
      );
      expect(installationAt(root.path).dataLocation, data.path);
    });

    test('הארכיון נמצא באתר הנתונים כשאינו ליד קובץ ההרצה', () {
      // זה בדיוק מצב ההתקנה החלקית: קובץ ההרצה על ההתקן הנשלף,
      // והמאגר במקום אחר לגמרי.
      final data = Directory(p.join(root.path, 'elsewhere'))
        ..createSync(recursive: true);
      Directory(p.join(data.path, 'DB')).createSync(recursive: true);
      File(p.join(data.path, 'DB', 'FILE00')).writeAsStringSync('');
      File(
        p.join(root.path, 'Responsa.env'),
      ).writeAsStringSync('DataLocation=${data.path}');
      expect(
        installationAt(root.path).archivePath,
        p.join(data.path, 'DB', 'FILE00'),
      );
    });

    test('אין Responsa.env — אין אתר נתונים, וזה מצב חוקי', () {
      expect(installationAt(root.path).dataLocation, isNull);
      expect(installationAt(root.path).archivePath, isNull);
    });

    test('נתיב המאגר נקרא מ-Sh_hdisk שב-Responsa.ini', () {
      // זו שרשרת פתרון הנתונים של התוכנה עצמה: env → DataLocation →
      // Responsa.ini → [Environment] Sh_hdisk + db\
      final data = Directory(p.join(root.path, 'data'))
        ..createSync(recursive: true);
      final disk = Directory(p.join(root.path, 'disk', 'db'))
        ..createSync(recursive: true);
      File(p.join(disk.path, 'FILE00')).writeAsStringSync('');
      File(
        p.join(root.path, 'Responsa.env'),
      ).writeAsStringSync('DataLocation=${data.path}');
      File(p.join(data.path, 'Responsa.ini')).writeAsStringSync(
        [
          '[Environment]',
          'Sh_hdisk=${p.join(root.path, 'disk')}',
          'VolLabel=RESPONSAV25',
          '',
          '[General]',
          'Sh_hdisk=לא מכאן',
        ].join('\r\n'),
      );
      final installation = installationAt(root.path);
      expect(installation.archivePath, p.join(disk.path, 'FILE00'));
      expect(installation.volumeLabel, 'RESPONSAV25');
    });

    test('ההתקן הנשלף (Sh_cdrom): FILE00 בשורש שלו, ליד INSTALL', () {
      // CD25 אצל משתמש 29C: `Sh_cdrom=E:\Documents\תוכנות\בארי-25\`, ובו
      // FILE00 (2GB), KE\, AP\ ו-INSTALL\ — בלי db\.
      final data = Directory(p.join(root.path, 'data'))
        ..createSync(recursive: true);
      final device = Directory(p.join(root.path, 'בארי-25'))
        ..createSync(recursive: true);
      Directory(p.join(device.path, 'INSTALL')).createSync();
      File(p.join(device.path, 'FILE00')).writeAsStringSync('');
      File(
        p.join(root.path, 'Responsa.env'),
      ).writeAsStringSync('DataLocation=${data.path}');
      File(p.join(data.path, 'Responsa.ini')).writeAsStringSync(
        ['[Environment]', 'Sh_cdrom=${device.path}\\'].join('\r\n'),
      );
      expect(
        installationAt(root.path).archivePath,
        p.join('${device.path}\\', 'FILE00'),
      );
    });

    test('מפתח מחוץ ל-[Environment] אינו נקרא', () {
      final data = Directory(p.join(root.path, 'data'))
        ..createSync(recursive: true);
      File(
        p.join(root.path, 'Responsa.env'),
      ).writeAsStringSync('DataLocation=${data.path}');
      File(
        p.join(data.path, 'Responsa.ini'),
      ).writeAsStringSync(['[General]', 'VolLabel=לא מכאן'].join('\r\n'));
      expect(installationAt(root.path).volumeLabel, isNull);
    });

    test('קובץ תצורה ב-ANSI עברי נקרא ואינו נזרק', () {
      // `Responsa.ini` נכתב ב-CP1255, ו-`readAsLinesSync` בברירת המחדל זורק
      // על העברית שבו ומאבד בשקט גם את המפתחות שהם ASCII טהור.
      final data = Directory(p.join(root.path, 'data'))
        ..createSync(recursive: true);
      final disk = Directory(p.join(root.path, 'disk', 'db'))
        ..createSync(recursive: true);
      File(p.join(disk.path, 'FILE00')).writeAsStringSync('');
      File(
        p.join(root.path, 'Responsa.env'),
      ).writeAsStringSync('DataLocation=${data.path}');
      // `0xE1 0xE5` הם `בו` ב-CP1255, ובתים בלתי-חוקיים ב-UTF-8.
      File(p.join(data.path, 'Responsa.ini')).writeAsBytesSync([
        ...'[Environment]\r\nSh_cdrom=D:\\'.codeUnits,
        0xE1,
        0xE5,
        ...'\r\nSh_hdisk=${p.join(root.path, 'disk')}\r\n'.codeUnits,
        ...'VolLabel=RESPONSAV25\r\n'.codeUnits,
      ]);
      final installation = installationAt(root.path);
      expect(installation.volumeLabel, 'RESPONSAV25');
      expect(installation.archivePath, p.join(disk.path, 'FILE00'));
    });

    test('אין Responsa.ini — מפה ריקה ולא חריג', () {
      expect(installationAt(root.path).iniSettings, isEmpty);
      expect(installationAt(root.path).volumeLabel, isNull);
    });
  });

  group('סריקת הכוננים', () {
    late Directory root;
    setUp(() => root = Directory.systemTemp.createTempSync('responsa_drives'));
    tearDown(() => root.deleteSync(recursive: true));

    test('כונן שאינו זמין אינו עוצר את הגילוי', () {
      // `Directory.existsSync` זורק על כל שגיאה שאינה "לא נמצא": כונן DVD
      // ריק (ERROR_NOT_READY), כונן רשת מנותק. שם בלתי-חוקי (ERROR_INVALID_NAME)
      // זורק באותה דרך, בלי תלות בחומרה. החריגה הגיעה ל-`/status` כ-`internal`.
      final install = Directory(p.join(root.path, 'ResponsaCD34'))
        ..createSync();
      File(p.join(install.path, 'RESPONSA.exe')).writeAsStringSync('');
      expect(
        () => Directory(r'C:\a<b').existsSync(),
        throwsA(isA<FileSystemException>()),
        reason: 'הבדיקה נשענת על כך שהנתיב זורק',
      );
      final found = ResponsaInstallationDiscovery.fromFileSystem(
        drives: [r'C:\a<b\', root.path],
        environment: {'ProgramFiles': r'C:\a<c'},
      );
      // אותה תיקייה עולה גם כילד וגם כשורש; `discover` מאחד לפי נתיב.
      expect(found.map((installation) => installation.installPath).toSet(), {
        install.path,
      });
      expect(found.first.version, 34);
    });
  });

  // כל פתיחה וחיפוש בוחרים התקנה פעמיים; במחשב עם כוננים איטיים סריקת
  // הכוננים הוסיפה לכל אחד מהם כ-25 שניות (CD32C, 13.10.2026).
  group('ההתקנה שממנה נקראה הרשימה, בלי סריקה', () {
    late Directory dir;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('ResponsaCD32C_');
      File(p.join(dir.path, 'RESPONSA.exe')).writeAsBytesSync(const [0]);
    });
    tearDown(() => dir.deleteSync(recursive: true));

    test('atPath: קיימת, גם עם לוכסן בסוף', () {
      final found = ResponsaInstallationDiscovery.atPath(
        '${dir.path}${p.separator}',
      );
      expect(found, isNotNull);
      expect(found!.installPath, dir.path);
      expect(found.source, 'catalog');
      expect(found.version, 32);
    });

    test('atPath: אין RESPONSA.exe, נתיב ריק, כונן שאינו קיים', () {
      File(p.join(dir.path, 'RESPONSA.exe')).deleteSync();
      expect(ResponsaInstallationDiscovery.atPath(dir.path), isNull);
      expect(ResponsaInstallationDiscovery.atPath(''), isNull);
      expect(ResponsaInstallationDiscovery.atPath(null), isNull);
      expect(ResponsaInstallationDiscovery.atPath(r'Q:\nowhere'), isNull);
    });

    test('selectInstallation בוחרת אותה מיד', () {
      final watch = Stopwatch()..start();
      final selection = ResponsaInstallationDiscovery.selectInstallation(
        preferredPath: dir.path,
      );
      expect(selection?.installation.installPath, dir.path);
      expect(selection!.instances, isEmpty);
      // בלי סריקת כוננים: מילישניות ולא שניות.
      expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
    });

    test('discover עם התקנות ידועות אינו סורק שוב', () {
      final known = [
        ResponsaInstallation(
          version: 32,
          installPath: dir.path,
          displayName: 'ResponsaCD32C',
          source: 'registry',
        ),
      ];
      final watch = Stopwatch()..start();
      final found = ResponsaInstallationDiscovery.discover(installed: known);
      // רק המופעים הרצים נוספים (אם יש כאלה במחשב שמריץ את הבדיקה).
      expect(found.map((i) => i.installPath), contains(dir.path));
      expect(watch.elapsed, lessThan(const Duration(seconds: 2)));
    });
  });
}
