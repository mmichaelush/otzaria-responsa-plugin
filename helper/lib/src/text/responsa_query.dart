import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// טקסט שנבחר באוצריא, כשאילתה לחיפוש בבר אילן: מילים עבריות בלבד. תווי
/// החיפוש המתקדם של בר אילן (`# * ! + $ - < > { } % ^ ~ ?`) הם אופרטורים,
/// ומשפט שמכיל אותם היה מחפש משהו אחר ממה שנבחר.
class ResponsaQuery {
  /// המילים, מופרדות ברווח יחיד.
  final String text;

  /// האם נחתך חלק מסוף הבחירה.
  final bool truncated;

  const ResponsaQuery._(this.text, this.truncated);

  /// חיפוש ארוך מזה הוא כבר ציטוט של פסקה, ולא יניב תוצאה.
  static const int maxWords = 10;
  static const int maxLength = 120;

  /// סימני פיסוק עבריים שמפרידים בין מילים: מקף, פסק, סוף פסוק, נו"ן הפוכה.
  static final RegExp _hebrewSeparators = RegExp('[\u05BE\u05C0\u05C3\u05C6]');

  /// ניקוד וטעמים, אחרי שהמפרידים שבאותו טווח כבר הוחלפו ברווח.
  static final RegExp _marks = RegExp('[\u0591-\u05C7]');

  /// תווים בלתי-נראים, כולל CGJ שבין סימני ניקוד. נמחקים בלי רווח, אחרת הם
  /// שוברים מילה לשתיים.
  static final RegExp _invisible = RegExp(
    '[\u00AD\u034F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]',
  );

  /// מילה = אותיות וגרשים. כל תו אחר (ספרות, לטינית, פיסוק, אופרטורים)
  /// מפריד.
  static final RegExp _word = RegExp('[א-ת"\']+');

  static const Map<String, String> _replacements = {
    '\u05F4': '"', // ״
    '\u201C': '"', // “
    '\u201D': '"', // ”
    '\u201E': '"', // „
    '\u2033': '"', // ″
    '\u05F3': "'", // ׳
    '\u2018': "'", // ‘
    '\u2019': "'", // ’
    '\u2032': "'", // ′
    '`': "'",
    // שני גרשים במקום גרשיים (`רמב''ם`), כפי שמקלידים בלי מקלדת עברית.
    "''": '"',
    // ליגטורות יידיש: בר אילן מחפש באותיות הנפרדות.
    '\u05F0': 'וו',
    '\u05F1': 'וי',
    '\u05F2': 'יי',
  };

  /// בלי ניקוד, טעמים ותווים בלתי-נראים, ועם גרש וגרשיים פשוטים: כך בר אילן
  /// מחפש. משותף לשאילתה מטקסט מסומן ולשאילתה המתקדמת.
  static String normalize(String input) {
    var value = ResponsaHebrew.foldPresentationForms(input)
        .replaceAll(_invisible, '')
        .replaceAll(_hebrewSeparators, ' ')
        .replaceAll(_marks, '');
    // לפי הסדר: הגרשים הטיפוגרפיים הופכים ל-`'` לפני הצירוף `''`.
    for (final entry in _replacements.entries) {
      value = value.replaceAll(entry.key, entry.value);
    }
    return value;
  }

  /// משפט ל"חיפוש בניסוח חופשי": אותן מילים, ויותר מהן.
  static const int maxSentenceWords = 40;
  static const int maxSentenceLength = 300;

  /// `null` כשלא נשארה אף מילה עברית.
  static ResponsaQuery? parse(
    String? input, {
    int maxWords = maxWords,
    int maxLength = maxLength,
  }) {
    if (input == null || input.isEmpty) return null;
    final value = normalize(input);

    final words = [
      for (final match in _word.allMatches(value))
        if (_clean(match[0]!) case final word when word.isNotEmpty) word,
    ];
    if (words.isEmpty) return null;

    final kept = <String>[];
    var length = -1;
    for (final word in words.take(maxWords)) {
      if (length + 1 + word.length > maxLength) break;
      kept.add(word);
      length += 1 + word.length;
    }
    // מילה אחת ארוכה מהתקרה אינה טקסט אמיתי; עדיף חלק ממנה מכלום.
    if (kept.isEmpty) {
      return ResponsaQuery._(words.first.substring(0, maxLength), true);
    }
    return ResponsaQuery._(kept.join(' '), kept.length < words.length);
  }

  static bool _isLetter(String char) {
    final code = char.codeUnitAt(0);
    return code >= 0x05D0 && code <= 0x05EA;
  }

  /// גרשיים נשמרים רק בתוך מילה (`רמב"ם`), כי בסופה הם מירכאות סוגרות. גרש
  /// נשמר גם בסוף מילה, שם הוא ראשי תיבות (`ר'`). בר אילן מחפש את שניהם
  /// (נמדד: `רמב"ם` מחזיר תוצאות).
  static String _clean(String raw) {
    final out = StringBuffer();
    var previous = '';
    for (var i = 0; i < raw.length; i++) {
      final char = raw[i];
      final keep =
          _isLetter(char) ||
          (previous.isNotEmpty &&
              _isLetter(previous) &&
              ((i + 1 < raw.length && _isLetter(raw[i + 1])) ||
                  (char == "'" && i + 1 == raw.length)));
      if (!keep) continue;
      out.write(char);
      previous = char;
    }
    return out.toString();
  }

  @override
  String toString() => text;
}
