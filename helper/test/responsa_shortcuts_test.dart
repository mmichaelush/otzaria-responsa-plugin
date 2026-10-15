import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/native/responsa_shortcuts.dart';
import 'package:test/test.dart';

/// קובץ `.lnk` מינימלי: כותרת של 0x4C בתים עם ShowCommand, ואחריה הנתיב
/// ב-ANSI וב-UTF-16, כמו ב-LinkInfo וב-StringData.
Uint8List shortcut(String target, int show) {
  final header = ByteData(0x4C)
    ..setUint32(0, 0x4C, Endian.little)
    ..setUint32(0x3C, show, Endian.little);
  final wide = ByteData(target.length * 2);
  for (var i = 0; i < target.length; i++) {
    wide.setUint16(i * 2, target.codeUnitAt(i), Endian.little);
  }
  return Uint8List.fromList([
    ...header.buffer.asUint8List(),
    ...latin1.encode(target.replaceAll(RegExp('[^\x00-\xff]'), '?')),
    0,
    ...wide.buffer.asUint8List(),
  ]);
}

void main() {
  const install = r'C:\Program Files (x86)\ResponsaCD32';

  test('ShowCommand מהכותרת', () {
    expect(
      ResponsaShortcuts.showCommandOf(shortcut('$install\\RESPONSA.exe', 3)),
      3,
    );
    expect(ResponsaShortcuts.showCommandOf(Uint8List(10)), isNull);
  });

  test('קיצור של ההתקנה, לא של המסיר ולא של התקנה אחרת', () {
    expect(
      ResponsaShortcuts.targets(shortcut('$install\\RESPONSA.exe', 1), install),
      isTrue,
    );
    expect(
      ResponsaShortcuts.targets(shortcut('$install\\unins000.exe', 1), install),
      isFalse,
    );
    expect(
      ResponsaShortcuts.targets(
        shortcut(r'C:\Program Files (x86)\ResponsaCD25\RESPONSA.exe', 1),
        install,
      ),
      isFalse,
    );
    // נתיב בעברית: ב-UTF-16.
    const hebrew = r'E:\פרוייקט השות 29+\ResponsaCD29C';
    expect(
      ResponsaShortcuts.targets(shortcut('$hebrew\\RESPONSA.exe', 1), hebrew),
      isTrue,
    );
  });

  group('showCommandFor', () {
    late Directory temp;
    setUp(() => temp = Directory.systemTemp.createTempSync('lnk_'));
    tearDown(() => temp.deleteSync(recursive: true));

    void write(String name, Uint8List bytes) => (File(
      p.join(temp.path, 'Programs', 'ResponsaCD32', name),
    )..createSync(recursive: true)).writeAsBytesSync(bytes);

    test('קיצור מוגדל: מוגדל', () {
      write('uninstall.lnk', shortcut('$install\\unins000.exe', 3));
      write('bar-ilan.lnk', shortcut('$install\\RESPONSA.exe', 3));
      expect(
        ResponsaShortcuts.showCommandFor(install, folders: [temp.path]),
        ResponsaShortcuts.showMaximized,
      );
    });

    test('קיצור רגיל, או אין קיצור: רגיל', () {
      expect(
        ResponsaShortcuts.showCommandFor(install, folders: [temp.path]),
        ResponsaShortcuts.showNormal,
      );
      write('bar-ilan.lnk', shortcut('$install\\RESPONSA.exe', 1));
      // המסיר מוגדל, אבל אינו בר אילן.
      write('uninstall.lnk', shortcut('$install\\unins000.exe', 3));
      expect(
        ResponsaShortcuts.showCommandFor(install, folders: [temp.path]),
        ResponsaShortcuts.showNormal,
      );
    });
  });

  test('CreateProcessW: מפעיל, ונכשל על קובץ שאינו קיים', () {
    final windows = Platform.environment['SystemRoot'] ?? r'C:\Windows';
    expect(
      ResponsaShortcuts.start(
        p.join(windows, 'System32', 'whoami.exe'),
        windows,
        ResponsaShortcuts.showNormal,
      ),
      isTrue,
    );
    expect(
      ResponsaShortcuts.start(
        p.join(windows, 'no-such-program.exe'),
        windows,
        ResponsaShortcuts.showNormal,
      ),
      isFalse,
    );
  }, testOn: 'windows');
}
