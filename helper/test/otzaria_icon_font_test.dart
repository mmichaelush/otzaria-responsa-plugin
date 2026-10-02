import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/server/otzaria_icon_font.dart';
import 'package:test/test.dart';

/// גופני הבדיקה נוצרים ב-test/fixtures/make_icon_fonts.py: שני גליפים
/// משלנו, בשמות של אייקוני אוצריא.
void main() {
  const expected = {
    'book_24_regular': 0xE000,
    'search_in_the_library_24_regular': 0xE001,
  };

  test('שמות מגופן OpenType (CFF)', () {
    final bytes = File('test/fixtures/icons_cff.otf').readAsBytesSync();
    expect(OtzariaIconFont.glyphNames(bytes), expected);
  });

  test('שמות מגופן TrueType (post גרסה 2)', () {
    final bytes = File('test/fixtures/icons_post.ttf').readAsBytesSync();
    expect(OtzariaIconFont.glyphNames(bytes), expected);
  });

  test('cmap עם טווח עצום נדחה מיד, בלי לולאה ארוכה', () {
    // גופן מינימלי: טבלה אחת (cmap) עם קבוצת format 12 של 0..0x0FFFFFFF.
    final data = ByteData(12 + 16 + 4 + 8 + 28);
    data.setUint32(0, 0x4F54544F); // OTTO
    data.setUint16(4, 1);
    const cmap = 12 + 16;
    data
      ..setUint8(12, 0x63)
      ..setUint8(13, 0x6D)
      ..setUint8(14, 0x61)
      ..setUint8(15, 0x70) // 'cmap'
      ..setUint32(20, cmap)
      ..setUint32(24, 4 + 8 + 28)
      ..setUint16(cmap + 2, 1)
      ..setUint16(cmap + 4, 3)
      ..setUint16(cmap + 6, 10)
      ..setUint32(cmap + 8, 12);
    const sub = cmap + 12;
    data
      ..setUint16(sub, 12)
      ..setUint32(sub + 4, 28)
      ..setUint32(sub + 12, 1)
      ..setUint32(sub + 16, 0)
      ..setUint32(sub + 20, 0x0FFFFFFF)
      ..setUint32(sub + 24, 1);
    final watch = Stopwatch()..start();
    expect(
      () => OtzariaIconFont.glyphNames(data.buffer.asUint8List()),
      throwsFormatException,
    );
    expect(watch.elapsedMilliseconds, lessThan(1000));
  });

  test('קובץ שאינו גופן נדחה ב-FormatException', () {
    expect(
      () => OtzariaIconFont.glyphNames(File('pubspec.yaml').readAsBytesSync()),
      throwsFormatException,
    );
  });

  test('קודם ליד otzaria.exe שפנה לשירות, ואחר כך מקומות ההתקנה', () {
    final paths = OtzariaIconFont.candidates(
      clientExe: p.join('D:', 'dev', 'otzaria.exe'),
      environment: {
        'ProgramFiles': p.join('C:', 'Program Files'),
        'LOCALAPPDATA': p.join('C:', 'Users', 'u', 'AppData', 'Local'),
      },
    );
    final roots = [
      p.join('D:', 'dev'),
      p.join('C:', 'Program Files', 'Otzaria'),
      p.join('C:', 'Users', 'u', 'AppData', 'Local', 'Programs', 'Otzaria'),
    ];
    expect(paths, hasLength(3));
    for (var i = 0; i < 3; i++) {
      expect(p.isWithin(roots[i], paths[i]), isTrue, reason: paths[i]);
    }
    expect(paths.first, endsWith(p.joinAll(OtzariaIconFont.relativePath)));
    // תהליך אחר (לא אוצריא) אינו מקור לגופן.
    expect(
      OtzariaIconFont.candidates(clientExe: p.join('D:', 'x', 'chrome.exe')),
      isEmpty,
    );
  });

  test('הטעינה מדלגת על קובץ חסר או פגום', () async {
    final dir = Directory.systemTemp.createTempSync('otzaria_icons');
    addTearDown(() => dir.deleteSync(recursive: true));
    final broken = File(p.join(dir.path, 'broken.otf'))..writeAsStringSync('x');
    final good = File(p.join(dir.path, 'good.otf'))
      ..writeAsBytesSync(File('test/fixtures/icons_cff.otf').readAsBytesSync());

    final font = await OtzariaIconFont.load([
      p.join(dir.path, 'missing.otf'),
      broken.path,
      good.path,
    ]);
    expect(font?.glyphs, expected);
    expect(await OtzariaIconFont.load([broken.path]), isNull);
  });
}
