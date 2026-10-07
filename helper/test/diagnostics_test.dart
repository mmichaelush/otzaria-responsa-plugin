import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/server/diagnostics.dart';
import 'package:test/test.dart';

/// השורות כאן כפי שהשירות כותב אותן ליומן. הדוגמה של "השירות לא מגיב" היא
/// מדיווח אמיתי (5.10.2026): הבדיקה החוזרת כל 10 שניות דחקה מהדיווח את כל
/// השאר.
void main() {
  String status(String time, int ms) => [
    '2026-10-06T00:$time.100000 GET /health 200 3ms',
    '2026-10-06T00:$time.200000 HttpApi: GET /status: FileSystemException: '
        "Exists failed, path = 'E:\\' (OS Error: The device is not ready, "
        'errno = 21)',
    '#0      _Directory.existsSync (dart:io/directory_impl.dart:94:7)',
    '#1      ResponsaInstallationDiscovery._fromFileSystem.scan',
    '2026-10-06T00:$time.300000 GET /status 500 ${ms}ms internal: '
        'שגיאה פנימית בשירות',
  ].join('\n');

  test('בלי ארכיון: מה נבדק, ותיקיות וקבצים גדולים בתיקיית ההתקנה', () {
    final root = Directory.systemTemp.createTempSync('responsa_archive');
    addTearDown(() => root.deleteSync(recursive: true));
    Directory(p.join(root.path, 'Data')).createSync();
    File(p.join(root.path, 'RESPONSA.exe')).writeAsBytesSync([0]);
    // קובץ של 6MB בלי לכתוב אותו: כתיבה אחרי הסוף.
    File(p.join(root.path, 'BIG.DAT')).openSync(mode: FileMode.write)
      ..setPositionSync(6 << 20)
      ..writeByteSync(0)
      ..closeSync();
    final hints = HelperDiagnostics.archiveHints(
      ResponsaInstallation(
        version: 31,
        installPath: root.path,
        displayName: 'test',
        source: 'registry',
      ),
    );
    expect(hints, contains('data none'));
    expect(hints, contains('folder: BIG.DAT 6MB, Data/'));
    expect(hints, isNot(contains('RESPONSA.exe')));
  });

  test('בקשות שהצליחו מסוננות, ועקבות המחסנית נשארות עם הרשומה', () {
    final tail = HelperDiagnostics.tail(status('18:26', 152));
    expect(tail, isNot(contains('GET /health')));
    expect(tail, contains('2026-10-06 00:18:26 HttpApi: GET /status'));
    expect(tail, contains('\n  #0      _Directory.existsSync'));
    expect(tail, contains('GET /status 500 152ms internal'));
  });

  test('כשל שחוזר בכל בדיקה נשאר פעם אחת, עם מספר החזרות ועד מתי', () {
    final log = [
      '2026-10-06T00:18:00.000000 responsa_helper 0.5.1 listening',
      for (var i = 0; i < 25; i++) status('18:${(26 + i) % 60}', 140 + i),
      '2026-10-06T00:22:00.000000 shutting down',
    ].join('\n');
    final tail = HelperDiagnostics.tail(log);
    expect(tail, contains('responsa_helper 0.5.1 listening'));
    expect('HttpApi: GET /status'.allMatches(tail), hasLength(1));
    expect(
      tail,
      contains('the 2 entries above repeated 24 more times, until 00:18:50'),
    );
    expect(tail.trim().split('\n').last, endsWith('shutting down'));
  });

  test('רשומות שונות אינן מקוצרות', () {
    final log = [
      for (var i = 0; i < 5; i++)
        '2026-10-06T09:3$i:00.000000 ResponsaTreeReader: section ${i + 1}/20',
    ].join('\n');
    final tail = HelperDiagnostics.tail(log);
    expect(tail, isNot(contains('repeated')));
    expect('section'.allMatches(tail), hasLength(5));
  });

  test('נחתך מההתחלה, בשורות שלמות, עד התקרה', () {
    final log = [
      for (var i = 0; i < 500; i++)
        '2026-10-06T09:00:00.000000 entry $i ${'x' * 100}',
    ].join('\n');
    final tail = HelperDiagnostics.tail(log);
    expect(tail.length, lessThanOrEqualTo(HelperDiagnostics.tailChars));
    expect(tail, startsWith('2026-10-06 09:00:00 entry'));
    expect(tail, endsWith('entry 499 ${'x' * 100}'));
  });
}
