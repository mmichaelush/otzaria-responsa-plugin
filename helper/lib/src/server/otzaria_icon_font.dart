import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;

/// גופן האייקונים של אוצריא, מתוך תיקיית ההתקנה של האוצריא שפונה לשירות.
///
/// התוסף מצייר את האייקונים של אוצריא עצמה, בגרסה שמותקנת אצל המשתמש, בלי
/// לארוז אותם: השירות קורא את הגופן ואת שמות הגליפים שבו, והתוסף טוען אותו
/// כ-`FontFace`. אייקון שאינו בגופן (גרסה ישנה של אוצריא) נשאר מהאייקונים
/// שבתוסף.
class OtzariaIconFont {
  const OtzariaIconFont({required this.bytes, required this.glyphs});

  final Uint8List bytes;

  /// שם הגליף (`book_24_regular`) ← נקודת הקוד שלו בגופן.
  final Map<String, int> glyphs;

  /// הנתיב בתוך התקנה של אוצריא (Flutter), יחסית לתיקייה של otzaria.exe.
  static const List<String> relativePath = [
    'data',
    'flutter_assets',
    'packages',
    'otzaria_icons',
    'lib',
    'fonts',
    'otzaria_icons.otf',
  ];

  /// קודם ליד ה-exe שפנה לשירות (כך גם בנייה מקומית או התקנה ניידת מקבלות
  /// את הגופן שלהן), ואחר כך במקומות ההתקנה הרגילים.
  static List<String> candidates({
    String? clientExe,
    Map<String, String> environment = const {},
  }) {
    final dirs = <String>[
      if (clientExe != null &&
          p.basename(clientExe).toLowerCase() == 'otzaria.exe')
        p.dirname(clientExe),
      if (environment['ProgramFiles'] case final dir?) p.join(dir, 'Otzaria'),
      if (environment['LOCALAPPDATA'] case final dir?)
        p.join(dir, 'Programs', 'Otzaria'),
    ];
    return [
      for (final dir in dirs) p.joinAll([dir, ...relativePath]),
    ];
  }

  /// גופן האייקונים של אוצריא הוא כ-100KB; קובץ גדול בהרבה אינו הגופן.
  static const int maxFileBytes = 4 * 1024 * 1024;

  /// תקרה למספר נקודות הקוד שנקראות מ-cmap: גופן פגום (טווח 0..0x10FFFF)
  /// היה מריץ לולאה ארוכה ומנפח זיכרון.
  static const int maxCodepoints = 0x20000;

  static final Map<String, ({DateTime modified, OtzariaIconFont? font})>
  _cache = {};

  /// הגופן הראשון שנמצא ונקרא, או `null`. נשמר בזיכרון לפי נתיב ותאריך,
  /// כך שעדכון של אוצריא נקרא מחדש.
  static Future<OtzariaIconFont?> load(Iterable<String> paths) async {
    for (final path in paths) {
      final file = File(path);
      try {
        final modified = await file.lastModified();
        final cached = _cache[path];
        if (cached != null && cached.modified == modified) {
          if (cached.font case final font?) return font;
          continue;
        }
        OtzariaIconFont? font;
        if (await file.length() <= maxFileBytes) {
          final bytes = await file.readAsBytes();
          try {
            final glyphs = glyphNames(bytes);
            if (glyphs.isNotEmpty) {
              font = OtzariaIconFont(bytes: bytes, glyphs: glyphs);
            }
          } on FormatException {
            font = null;
          }
        }
        // גם כשל נשמר, כדי שקובץ פגום לא ייקרא וינותח בכל בקשה.
        _cache[path] = (modified: modified, font: font);
        if (font != null) return font;
      } on FileSystemException {
        continue;
      }
    }
    return null;
  }

  /// שם ← נקודת קוד, לכל גליף שיש לו גם שם וגם נקודת קוד. השמות מטבלת
  /// `CFF ` (גופן OpenType), או מ-`post` בגרסה 2 (TrueType).
  static Map<String, int> glyphNames(Uint8List bytes) {
    try {
      return _glyphNames(ByteData.sublistView(bytes));
    } on RangeError {
      // היסט שמצביע מחוץ לקובץ: קובץ פגום או שאינו גופן.
      throw const FormatException('קובץ גופן פגום');
    }
  }

  static Map<String, int> _glyphNames(ByteData data) {
    final tables = _tables(data);
    final cmap = tables['cmap'];
    if (cmap == null) throw const FormatException('אין טבלת cmap');
    final codepoints = _cmap(data, cmap.offset);
    final List<String?> names;
    if (tables['CFF '] case final cff?) {
      names = _cffNames(data, cff.offset);
    } else if (tables['post'] case final post?) {
      names = _postNames(data, post.offset);
    } else {
      throw const FormatException('אין שמות גליפים');
    }
    return {
      for (final entry in codepoints.entries)
        ?(entry.key < names.length ? names[entry.key] : null): entry.value,
    };
  }

  static Map<String, ({int offset, int length})> _tables(ByteData data) {
    if (data.lengthInBytes < 12) throw const FormatException('קובץ קצר מדי');
    final count = data.getUint16(4);
    final tables = <String, ({int offset, int length})>{};
    for (var i = 0; i < count; i++) {
      final record = 12 + i * 16;
      final tag = String.fromCharCodes([
        for (var j = 0; j < 4; j++) data.getUint8(record + j),
      ]);
      tables[tag] = (
        offset: data.getUint32(record + 8),
        length: data.getUint32(record + 12),
      );
    }
    return tables;
  }

  /// מזהה גליף ← נקודת הקוד הנמוכה שלו, מטבלת Unicode (3,10 או 3,1/0,x).
  static Map<int, int> _cmap(ByteData data, int cmap) {
    final count = data.getUint16(cmap + 2);
    int? best;
    var bestScore = -1;
    for (var i = 0; i < count; i++) {
      final record = cmap + 4 + i * 8;
      final platform = data.getUint16(record);
      final encoding = data.getUint16(record + 2);
      final offset = cmap + data.getUint32(record + 4);
      final format = data.getUint16(offset);
      final score = switch ((platform, encoding, format)) {
        (3, 10, 12) => 4,
        (0, _, 12) => 3,
        (3, 1, 4) => 2,
        (0, _, 4) => 1,
        // גופני אייקונים רבים נוצרים עם טבלת Symbol בלבד.
        (3, 0, 4) => 0,
        _ => -1,
      };
      if (score > bestScore) {
        best = offset;
        bestScore = score;
      }
    }
    if (best == null) throw const FormatException('אין טבלת Unicode ב-cmap');
    final result = <int, int>{};
    var mapped = 0;
    void spend(int length) {
      mapped += length;
      if (mapped > maxCodepoints) {
        throw const FormatException('cmap גדול מדי לגופן אייקונים');
      }
    }

    void add(int glyph, int codepoint) {
      if (glyph == 0) return;
      final previous = result[glyph];
      if (previous == null || codepoint < previous) result[glyph] = codepoint;
    }

    if (data.getUint16(best) == 12) {
      final groups = data.getUint32(best + 12);
      for (var i = 0; i < groups; i++) {
        final group = best + 16 + i * 12;
        final start = data.getUint32(group);
        final end = data.getUint32(group + 4);
        final glyph = data.getUint32(group + 8);
        if (end < start || end > 0x10FFFF) {
          throw const FormatException('קבוצה לא תקינה ב-cmap');
        }
        spend(end - start + 1);
        for (var c = start; c <= end; c++) {
          add(glyph + c - start, c);
        }
      }
      return result;
    }
    final segments = data.getUint16(best + 6) ~/ 2;
    final ends = best + 14;
    final starts = ends + segments * 2 + 2;
    final deltas = starts + segments * 2;
    final rangeOffsets = deltas + segments * 2;
    for (var s = 0; s < segments; s++) {
      final start = data.getUint16(starts + s * 2);
      final end = data.getUint16(ends + s * 2);
      final delta = data.getInt16(deltas + s * 2);
      final rangeAt = rangeOffsets + s * 2;
      final range = data.getUint16(rangeAt);
      if (end < start) throw const FormatException('מקטע לא תקין ב-cmap');
      spend(end - start + 1);
      for (var c = start; c <= end && c != 0xFFFF; c++) {
        final int glyph;
        if (range == 0) {
          glyph = (c + delta) & 0xFFFF;
        } else {
          final raw = data.getUint16(rangeAt + range + (c - start) * 2);
          glyph = raw == 0 ? 0 : (raw + delta) & 0xFFFF;
        }
        add(glyph, c);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------- CFF

  /// מספר המחרוזות הסטנדרטיות של CFF: SID נמוך מזה אינו שם של אייקון.
  static const int _standardStrings = 391;

  static List<String?> _cffNames(ByteData data, int cff) {
    final headerSize = data.getUint8(cff + 2);
    final names = _index(data, cff + headerSize);
    final topDicts = _index(data, names.end);
    final strings = _index(data, topDicts.end);
    if (topDicts.items.isEmpty) throw const FormatException('אין Top DICT');
    final top = _dict(data, topDicts.items.first);
    final charStrings = top[17];
    final charset = top[15];
    if (charStrings == null || charset == null || charset <= 2) {
      throw const FormatException('אין charset מותאם');
    }
    final glyphCount = data.getUint16(cff + charStrings);
    String? nameOf(int sid) {
      if (sid < _standardStrings) return null;
      final index = sid - _standardStrings;
      if (index >= strings.items.length) return null;
      final (start, end) = strings.items[index];
      return String.fromCharCodes(Uint8List.sublistView(data, start, end));
    }

    final result = List<String?>.filled(glyphCount, null);
    var at = cff + charset;
    final format = data.getUint8(at++);
    var glyph = 1;
    while (glyph < glyphCount) {
      if (format == 0) {
        result[glyph++] = nameOf(data.getUint16(at));
        at += 2;
      } else if (format == 1 || format == 2) {
        final first = data.getUint16(at);
        final left = format == 1
            ? data.getUint8(at + 2)
            : data.getUint16(at + 2);
        at += format == 1 ? 3 : 4;
        for (var i = 0; i <= left && glyph < glyphCount; i++) {
          result[glyph++] = nameOf(first + i);
        }
      } else {
        throw FormatException('charset לא מוכר: $format');
      }
    }
    return result;
  }

  /// INDEX של CFF: הפריטים כטווחי בתים מוחלטים, וסופו.
  static ({List<(int, int)> items, int end}) _index(ByteData data, int at) {
    final count = data.getUint16(at);
    if (count == 0) return (items: const [], end: at + 2);
    final offSize = data.getUint8(at + 2);
    int offset(int i) {
      var value = 0;
      for (var j = 0; j < offSize; j++) {
        value = (value << 8) | data.getUint8(at + 3 + i * offSize + j);
      }
      return value;
    }

    final base = at + 2 + (count + 1) * offSize;
    return (
      items: [
        for (var i = 0; i < count; i++)
          (base + offset(i), base + offset(i + 1)),
      ],
      end: base + offset(count),
    );
  }

  /// DICT של CFF: אופרטור ← האופרנד האחרון שלו (מספיק ל-charset ו-CharStrings).
  static Map<int, int> _dict(ByteData data, (int, int) range) {
    final (start, end) = range;
    final result = <int, int>{};
    final operands = <int>[];
    var at = start;
    while (at < end) {
      final b0 = data.getUint8(at++);
      if (b0 <= 21) {
        final op = b0 == 12 ? 1200 + data.getUint8(at++) : b0;
        if (operands.isNotEmpty) result[op] = operands.last;
        operands.clear();
      } else if (b0 == 28) {
        operands.add(data.getInt16(at));
        at += 2;
      } else if (b0 == 29) {
        operands.add(data.getInt32(at));
        at += 4;
      } else if (b0 == 30) {
        // מספר ממשי: מדלגים עד ה-nibble המסיים, ושומרים 0 במקומו.
        while (at < end) {
          final b = data.getUint8(at++);
          if ((b & 0x0F) == 0x0F || (b >> 4) == 0x0F) break;
        }
        operands.add(0);
      } else if (b0 >= 32 && b0 <= 246) {
        operands.add(b0 - 139);
      } else if (b0 >= 247 && b0 <= 250) {
        operands.add((b0 - 247) * 256 + data.getUint8(at++) + 108);
      } else if (b0 >= 251 && b0 <= 254) {
        operands.add(-(b0 - 251) * 256 - data.getUint8(at++) - 108);
      } else {
        throw FormatException('אופרנד DICT לא מוכר: $b0');
      }
    }
    return result;
  }

  // ---------------------------------------------------------------- post

  /// `post` בגרסה 2: אינדקס 258 ומעלה הוא שם מותאם (שמות Mac הסטנדרטיים
  /// אינם שמות של אייקונים).
  static List<String?> _postNames(ByteData data, int post) {
    if (data.getUint32(post) != 0x00020000) {
      throw const FormatException('post בלי שמות');
    }
    final glyphCount = data.getUint16(post + 32);
    final indexes = [
      for (var i = 0; i < glyphCount; i++) data.getUint16(post + 34 + i * 2),
    ];
    final custom = <String>[];
    var at = post + 34 + glyphCount * 2;
    final end = data.lengthInBytes;
    while (at < end) {
      final length = data.getUint8(at++);
      if (at + length > end) break;
      custom.add(
        String.fromCharCodes(Uint8List.sublistView(data, at, at + length)),
      );
      at += length;
    }
    return [
      for (final index in indexes)
        index >= 258 && index - 258 < custom.length
            ? custom[index - 258]
            : null,
    ];
  }
}
