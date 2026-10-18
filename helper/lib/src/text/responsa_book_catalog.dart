import 'dart:typed_data';

import 'package:responsa_helper/src/text/responsa_author_table.dart';

/// `FILE06` בארכיון: "קטלוג ספרים" שבחלון העיון של בר אילן, לפי שם הספר
/// ולפי מחבר. המחברים שבו הם המקור כשאין `FILE65` (בר אילן 29 ו-32: הטבלה
/// שם ריקה, והקטלוג מציג את המחברים).
///
/// אחרי 8 בתים של כותרת, רשומות עד סוף הקובץ: `u8` קבוצה, `u16` מזהה
/// החיבור (big-endian, כמו ב-`FILE65`), `u8` חלק בתוך החיבור (0 = החיבור
/// כולו), `u16` אורך (little-endian), והטקסט ב-CP862, בסדר ויזואלי. בטקסט
/// `\0` מפריד בין השם לשמות החלופיים, ורשומת מחבר יש בה `*`:
/// - `שם, ר' פרטי (ספר)\0חלופות לספר*חלופות למחבר` — מחבר של ספר אחד;
/// - `שם, ר' פרטי (כינוי)*ספר\0חלופות לספר*חלופות למחבר` — מחבר של כמה.
class ResponsaBookCatalog {
  ResponsaBookCatalog._();

  static const String member = 'FILE06';

  static const int _headerSize = 8;
  static const int _recordHead = 6;

  /// יותר מזה לחיבור אחד אינו רשימת מחברים (מזהה 0 ב-CD25: שמונה שונים).
  static const int _maxAuthorsPerBook = 3;

  /// המחברים לפי מזהה החיבור. `null` כשהמבנה אינו מוכר: הרשומות חייבות
  /// לכסות את הקובץ בדיוק, אחרת אין לסמוך על אף אחת מהן.
  ///
  /// הכותרת היא 8 בתים ב-CD25. במהדורה שבה היא באורך אחר, הרשומות מתחילות
  /// במקום שממנו הן מכסות את הקובץ עד סופו ויש בהן מחברים.
  static Map<int, String>? authors(Uint8List bytes) {
    final usual = _parse(bytes, _headerSize);
    if (usual != null) return usual;
    for (var start = 0; start <= _maxHeaderSize; start++) {
      if (start == _headerSize) continue;
      final found = _parse(bytes, start);
      if (found != null && found.isNotEmpty) return found;
    }
    return null;
  }

  static const int _maxHeaderSize = 64;

  static Map<int, String>? _parse(Uint8List bytes, int start) {
    if (bytes.length <= start) return null;
    final byBook = <int, List<String>>{};
    var at = start;
    while (at < bytes.length) {
      if (at + _recordHead > bytes.length) return null;
      final id = (bytes[at + 1] << 8) | bytes[at + 2];
      final part = bytes[at + 3];
      final length = bytes[at + 4] | (bytes[at + 5] << 8);
      final end = at + _recordHead + length;
      if (length == 0 || end > bytes.length) return null;
      final text = _decode(Uint8List.sublistView(bytes, at + _recordHead, end));
      at = end;
      // חלק שאינו 0 הוא חיבור בתוך החיבור (השגות הרז"ה בתוך "בעלי הנפש").
      if (text == null || id == 0 || part != 0) continue;
      final name = authorOf(text);
      if (name == null) continue;
      final names = byBook[id] ??= [];
      if (!names.contains(name)) names.add(name);
    }
    return joined(byBook);
  }

  /// כמה מחברים לחיבור: יחד, עד [_maxAuthorsPerBook]; יותר מזה אינו רשימה.
  static Map<int, String> joined(Map<int, List<String>> byBook) => {
    for (final MapEntry(key: id, value: names) in byBook.entries)
      if (names.isNotEmpty && names.length <= _maxAuthorsPerBook)
        id: names.join('; '),
  };

  /// שם המחבר מרשומה, בצורה של `FILE65` (`ר' שלמה בן יהודה אבן גבירול`),
  /// עם הכינוי בסוגריים (`(רשב"ג)`) — לפיו מחפשים. `null` לרשומת ספר.
  static String? authorOf(String text) {
    final parts = text.split('*');
    if (parts.length < 2) return null;
    final head = parts.first;
    final separator = head.indexOf('\u0000');
    // `\0` לפני ה-`*` הראשון: הספר בסוגריים שבסוף השם.
    final singleBook = separator >= 0;
    return authorName(
      singleBook ? head.substring(0, separator) : head,
      singleBook: singleBook,
    );
  }

  /// [raw] כפי שבקטלוג: `שם, ר' פרטי (ספר)` למחבר של ספר אחד
  /// ([singleBook] — הספר נשמט, וכינוי שלפניו נשאר), או `שם, ר' פרטי
  /// (כינוי)` למחבר של כמה ספרים.
  static String? authorName(String raw, {required bool singleBook}) {
    final value = raw.trim();
    if (value.isEmpty) return null;
    final (:base, :note) = _splitNote(value);
    var nickname = note;
    if (singleBook && note != null) {
      final pieces = note.split(';');
      pieces.removeLast();
      nickname = pieces
          .map((p) => p.trim())
          .where((p) => p.isNotEmpty)
          .join('; ');
    }
    final name = _givenFirst(base);
    if (name.isEmpty) return null;
    return nickname == null || nickname.isEmpty ? name : '$name ($nickname)';
  }

  /// שם מהעץ של הקטלוג החי: מה שבסוף נשמר שם בסדר חזותי, בתחילת השם
  /// ומהופך (`([ר' אברהם בן דוד (הראב"ד [השלישי` הוא
  /// `ר' אברהם בן דוד (הראב"ד [השלישי])`).
  static String fromVisual(String raw) {
    final value = raw.trim();
    var lead = 0;
    while (lead < value.length && _closing.containsKey(value[lead])) {
      lead++;
    }
    if (lead == 0) return value;
    final tail = [
      for (final char in value.substring(0, lead).split('').reversed)
        _closing[char]!,
    ].join();
    return '${value.substring(lead).trim()}$tail';
  }

  /// מה שבסוף השם עובר בשמירה החזותית לתחילתו, בסדר הפוך ומהופך: גם גרש
  /// ומרכאות (`('ר' יוסף חיים (בן איש חי` הוא `ר' יוסף חיים (בן איש חי')`).
  static const Map<String, String> _closing = {
    '(': ')',
    '[': ']',
    '{': '}',
    "'": "'",
    '"': '"',
  };

  /// `אבן גבירול, ר' שלמה` → `ר' שלמה אבן גבירול`: כמו ב-`FILE65`.
  static String _givenFirst(String name) {
    final comma = name.indexOf(', ');
    if (comma < 0) return name.trim();
    final surname = name.substring(0, comma).trim();
    final given = name.substring(comma + 2).trim();
    if (surname.isEmpty) return given;
    if (given.isEmpty) return surname;
    return '$given $surname';
  }

  /// הסוגריים שבסוף השם, וגם כשיש בתוכם סוגריים מרובעים.
  static ({String base, String? note}) _splitNote(String raw) {
    if (!raw.endsWith(')')) return (base: raw, note: null);
    var depth = 0;
    for (var i = raw.length - 1; i >= 0; i--) {
      final char = raw[i];
      if (char == ')') depth++;
      if (char == '(') depth--;
      if (depth == 0) {
        return (
          base: raw.substring(0, i).trim(),
          note: raw.substring(i + 1, raw.length - 1).trim(),
        );
      }
    }
    return (base: raw, note: null);
  }

  /// כמו [ResponsaAuthorTable.decodeCp862], אבל `\0` הוא מפריד ולא סוף.
  static String? _decode(Uint8List bytes) {
    final pieces = <String>[];
    var start = 0;
    for (var i = 0; i <= bytes.length; i++) {
      if (i < bytes.length && bytes[i] != 0) continue;
      final piece = ResponsaAuthorTable.decodeCp862(
        Uint8List.sublistView(bytes, start, i),
      );
      if (piece == null) return null;
      pieces.add(piece);
      start = i + 1;
    }
    return pieces.join('\u0000');
  }
}
