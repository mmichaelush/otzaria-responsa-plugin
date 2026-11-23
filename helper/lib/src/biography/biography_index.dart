import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// פריט אחד ב"כלים ← ביוגרפיה" של בר אילן: חיבור שיש עליו מאמר. [path] הוא
/// הדרך אליו בעץ, כולל שמו, ומה שמאתר אותו שוב בפתיחה ([title] הוא האחרון).
class BiographyEntry {
  final List<String> path;

  const BiographyEntry(this.path);

  String get title => path.last;

  /// שורת הפרדה בעץ (`---- שאר הראשונים ----`): בר אילן מציגה אותה כפריט
  /// ברשימה, אבל אין מאמר מאחוריה, והלחיצה עליה אינה פותחת חלון.
  bool get isSeparator => _separator.hasMatch(title.trim());

  static final RegExp _separator = RegExp(
    r'^[\-–—=_*~.]{2,}|^[^\p{L}\p{N}]*$',
    unicode: true,
  );

  factory BiographyEntry.fromJson(Object? json) {
    if (json is List &&
        json.isNotEmpty &&
        json.every((part) => part is String)) {
      return BiographyEntry(List<String>.unmodifiable(json.cast<String>()));
    }
    throw const FormatException('biography entry');
  }

  List<String> toJson() => path;
}

/// הפריטים שבעץ, של התקנה אחת. נקרא פעם אחת מבר אילן, ונשמר בקובץ.
class BiographyIndex {
  /// ההתקנה והמהדורה שמהן נקרא: מהדורה אחרת היא עץ אחר.
  final String installKey;
  final List<BiographyEntry> entries;

  const BiographyIndex({required this.installKey, required this.entries});

  Map<String, Object?> toJson() => {
    'installKey': installKey,
    'entries': [for (final entry in entries) entry.toJson()],
  };

  static BiographyIndex? fromJson(Object? json) {
    if (json is! Map || json['installKey'] is! String) return null;
    final raw = json['entries'];
    if (raw is! List) return null;
    try {
      return BiographyIndex(
        installKey: json['installKey']! as String,
        entries: [for (final entry in raw) BiographyEntry.fromJson(entry)],
      );
    } on FormatException {
      return null;
    }
  }

  /// הפריט של ספר בשם [bookTitle], או `null`. רק התאמה **חד-משמעית**: שם
  /// שמתאים לשני פריטים נדחה, כי ביוגרפיה של חיבור אחר גרועה מהיעדרה. השם
  /// נבדק כמות שהוא, ואחר כך בלי מה שבסוגריים (`(מהדורה שנייה)`).
  BiographyEntry? find(String bookTitle) {
    for (final candidate in _variants(bookTitle)) {
      final matches = _titled(candidate);
      if (matches.length == 1) return matches.single;
      if (matches.length > 1) return null;
    }
    return null;
  }

  /// הפריט של ספר: קודם לפי שמו ([find]), ואם אין, לפי החיבור שהוא חלק ממנו.
  /// בעץ של בר אילן המאמר שייך לחיבור (`בעל שם טוב`), והספרים שבקטלוג הם חלקיו
  /// (`בעל שם טוב בראשית פרשת נח`), ולכן בלי השלב השני רוב הספרים נשארים בלי
  /// ביוגרפיה. [context] הוא הדרך אל הספר בעץ, מהשורש, בלי שם הספר. עולים
  /// מהקרוב אל הרחוק, ועוצרים בראשון שיש לו פריט **אחד** (או ששאר הנתיב שלו
  /// מכריע בין כמה). כמה פריטים ללא הכרעה — אין ביוגרפיה.
  BiographyEntry? findFor(String bookTitle, {List<String> context = const []}) {
    final own = find(bookTitle);
    if (own != null) return own;
    for (var depth = context.length - 1; depth >= 0; depth--) {
      final matches = _titled(context[depth]);
      if (matches.isEmpty) continue;
      if (matches.length == 1) return matches.single;
      final above = context.sublist(0, depth);
      final narrowed = [
        for (final entry in matches)
          if (_pathFits(entry, above)) entry,
      ];
      return narrowed.length == 1 ? narrowed.single : null;
    }
    return null;
  }

  List<BiographyEntry> _titled(String name) {
    final key = ResponsaHebrew.spellingKey(name);
    if (key.isEmpty) return const [];
    return [
      for (final entry in entries)
        if (ResponsaHebrew.spellingKey(entry.title) == key) entry,
    ];
  }

  /// האם כל מה שמעל הפריט בעץ הביוגרפיות מופיע, לפי הסדר, מעל הספר בקטלוג.
  /// העצים אינם זהים (בר אילן מחלקת את הקטגוריות אחרת בכל אחד), ולכן זו
  /// תת-סדרה ולא שוויון.
  static bool _pathFits(BiographyEntry entry, List<String> above) {
    var next = 0;
    final wanted = [
      for (final part in entry.path.take(entry.path.length - 1))
        ResponsaHebrew.spellingKey(part),
    ];
    for (final part in above) {
      if (next < wanted.length &&
          ResponsaHebrew.spellingKey(part) == wanted[next]) {
        next++;
      }
    }
    return next == wanted.length;
  }

  static final RegExp _parenthetical = RegExp(r'\s*[\(\[][^)\]]*[\)\]]\s*');

  static Iterable<String> _variants(String title) sync* {
    yield title;
    final stripped = title.replaceAll(_parenthetical, ' ').trim();
    if (stripped.isNotEmpty && stripped != title) yield stripped;
  }
}

/// מה שבר אילן מעתיקה מחלון הביוגרפיה: שורה ראשונה `ביוגרפיה - <שם>`, ואחריה
/// המאמר.
class BiographyText {
  final String title;
  final String body;

  const BiographyText({required this.title, required this.body});

  static const String titlePrefix = 'ביוגרפיה - ';

  /// `null` כשזה אינו מאמר ביוגרפיה של [expectedTitle]: אין כותרת
  /// `ביוגרפיה - <שם>` בשורה הראשונה, השם שבה אינו של הפריט שנבחר, או שאין
  /// אחריה גוף. הבדיקה מגינה מפני טקסט שהועתק מחלון אחר (ספר שהמשתמש פתח):
  /// הוא לא יוצג ולא יישמר כביוגרפיה.
  static BiographyText? parse(String raw, {required String expectedTitle}) {
    final lines = raw
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .split('\n');
    final head = lines.first.trim();
    if (!head.startsWith(titlePrefix.trim())) return null;
    final title = head.substring(titlePrefix.trim().length).trim();
    if (!_sameTitle(title, expectedTitle)) return null;
    final body = lines.sublist(1).join('\n').trim();
    return body.isEmpty ? null : BiographyText(title: title, body: body);
  }

  /// אותו שם בכתיב שווה, או שאחד מהם כולל את השני (בר אילן מוסיפה לפעמים
  /// סוגריים או מחבר לכותרת החלון).
  static bool _sameTitle(String a, String b) {
    final first = ResponsaHebrew.spellingKey(a);
    final second = ResponsaHebrew.spellingKey(b);
    if (first.isEmpty || second.isEmpty) return false;
    return first == second || first.contains(second) || second.contains(first);
  }
}
