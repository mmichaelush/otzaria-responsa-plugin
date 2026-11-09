import 'dart:convert';
import 'dart:typed_data';

/// פענוח טקסט שבר אילן שמרה כבתים. UTF-8 הוא המצופה; Windows-1255 הוא
/// הנסיגה לתוכנה ישנה שכתבה לקובץ בקידוד המערכת, כדי שהערה בעברית לא
/// תהפוך לסימני שאלה. לעולם אינו זורק.
class ResponsaTextDecoding {
  ResponsaTextDecoding._();

  static String decode(List<int> bytes) {
    if (bytes.isEmpty) return '';
    try {
      return utf8.decode(bytes);
    } on FormatException {
      return windows1255(bytes);
    }
  }

  /// הערך של ה-SQLite הוא טקסט, בלוב או ריק; הכול הופך למחרוזת.
  static String? fromSqlite(Object? value) => switch (value) {
    null => null,
    final String text => text,
    final Uint8List bytes => decode(bytes),
    final List<int> bytes => decode(bytes),
    _ => '$value',
  };

  /// אותיות, ניקוד, סימני כיוון, שקל, מירכאות וקווים, וגם ‎×‎ ‎÷‎ € ™; כל השאר
  /// כמו Latin-1, שחופף ל-1255 בטווח הזה.
  static String windows1255(List<int> bytes) {
    final out = StringBuffer();
    for (final byte in bytes) {
      out.writeCharCode(_codePoint(byte));
    }
    return out.toString();
  }

  static int _codePoint(int byte) {
    if (byte >= 0xE0 && byte <= 0xFA) return 0x05D0 + (byte - 0xE0);
    if (byte >= 0xC0 && byte <= 0xD3) return 0x05B0 + (byte - 0xC0);
    return switch (byte) {
      0xD4 => 0x05F0,
      0xD5 => 0x05F1,
      0xD6 => 0x05F2,
      0xD7 => 0x05F3,
      0xD8 => 0x05F4,
      0x80 => 0x20AC,
      0x99 => 0x2122,
      0xA4 => 0x20AA,
      0xAA => 0x00D7,
      0xBA => 0x00F7,
      0x91 => 0x2018,
      0x92 => 0x2019,
      0x93 => 0x201C,
      0x94 => 0x201D,
      0x96 => 0x2013,
      0x97 => 0x2014,
      0xFD => 0x200E,
      0xFE => 0x200F,
      _ => byte,
    };
  }
}
