import 'package:responsa_helper/src/text/responsa_query.dart';

/// שאילתה בתחביר החיפוש המתקדם של בר אילן, כפי שנבנתה בדיאלוג החיפוש
/// המתקדם של התוסף או הוקלדה בו ידנית: `נר [1:4] שבת`, `#!אהרון`,
/// `8: ($שומר/%מצא) #(אכל/גנב)`.
///
/// את התחביר עצמו בודק בר אילן, ומשיב בהודעה משלו ("שגיאה בהגדרת
/// השאילתה"), שמגיעה למשתמש כמות שהיא. כאן נבדק רק מה שאסור שיגיע אליו:
/// תווים שאינם חלק מהתחביר, שורות, אורך חריג וסוגריים שאינם מאוזנים.
class ResponsaAdvancedQuery {
  /// השאילתה, בלי ניקוד ועם רווח יחיד בין רכיבים.
  final String text;

  const ResponsaAdvancedQuery._(this.text);

  /// שדה השאילתה של בר אילן ארוך מזה, אבל שאילתה ארוכה מזה כבר אינה
  /// חיפוש אלא ציטוט.
  static const int maxLength = 300;

  /// אותיות, ספרות, גרש וגרשיים, ותווי התחביר: מאפייני מילה
  /// (`# * ! + $ - % ^`), משפחה וחיפוש שמור (`< > { }`), תווים כלליים
  /// (`? ~ @`), חלופות (`( / )`) ומרחקים (`[1:4]`, `10:`).
  static final RegExp _allowed = RegExp(
    r'''^[א-ת0-9"' #*!+$\-%^<>{}?~@()/\[\]:]+$''',
  );

  static final RegExp _letter = RegExp('[א-ת]');
  static final RegExp _spaces = RegExp(r'\s+');

  static const Map<String, String> _pairs = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>',
  };

  /// זורק [FormatException] עם הסבר למשתמש.
  static ResponsaAdvancedQuery parse(String input) {
    if (input.contains('\n') || input.contains('\r')) {
      throw const FormatException('השאילתה צריכה להיות בשורה אחת.');
    }
    final text = ResponsaQuery.normalize(input).replaceAll(_spaces, ' ').trim();
    if (!_letter.hasMatch(text)) {
      throw const FormatException('בשאילתה אין אף מילה בעברית.');
    }
    if (text.length > maxLength) {
      throw const FormatException(
        'השאילתה ארוכה מדי. אפשר לחפש עד $maxLength תווים.',
      );
    }
    if (!_allowed.hasMatch(text)) {
      final bad = text.split('').firstWhere((char) => !_allowed.hasMatch(char));
      throw FormatException('התו "$bad" אינו חלק מהתחביר של בר אילן.');
    }
    _checkPairs(text);
    return ResponsaAdvancedQuery._(text);
  }

  /// כל סוגר נסגר בסוגר המתאים לו ובסדר הנכון. בלי הבדיקה בר אילן היה
  /// משיב בהודעה כללית שאינה אומרת מה לתקן.
  static void _checkPairs(String text) {
    final open = <String>[];
    for (final char in text.split('')) {
      if (_pairs.containsKey(char)) {
        open.add(char);
      } else if (_pairs.containsValue(char)) {
        if (open.isEmpty || _pairs[open.last] != char) {
          throw FormatException('יש "$char" בלי סוגר פותח מתאים.');
        }
        open.removeLast();
      }
    }
    if (open.isNotEmpty) {
      throw FormatException('הסוגר "${open.last}" לא נסגר.');
    }
  }

  @override
  String toString() => text;
}
