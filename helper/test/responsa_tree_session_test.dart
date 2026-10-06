@TestOn('windows')
library;

import 'dart:io';

import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:test/test.dart';

/// קריסה של בר אילן באמצע הקריאה נראית מבחוץ כמו "לא מגיב"; רק קוד היציאה
/// מבדיל ביניהם. כאן תהליך שהבדיקה עצמה מפעילה, ויוצא בקוד ידוע.
void main() {
  test('exitCode: null כשהתהליך רץ, והקוד שלו אחרי שיצא', () async {
    final child = await Process.start('cmd', [
      '/c',
      'ping -n 3 127.0.0.1 >nul & exit /b 7',
    ]);
    final session = ResponsaTreeSession.open(child.pid, 0);
    expect(session, isNotNull);
    try {
      expect(session!.exitCode(), isNull);
      expect(await child.exitCode, 7);
      expect(session.exitCode(), 7);
    } finally {
      session?.close();
    }
  });
}
