/// הערה אישית אחת מ-`DATA\annot_db` של בר אילן (טבלת `COMMENT`).
///
/// השמות כאן הם של התוכן ולא של העמודות, כי שם עמודה אינו אומר מה המשתמש
/// רואה. [source] הוא "מראה המקום" שבר אילן כותבת ליד ההערה, ו-[title]
/// הכותרת שהמשתמש נתן לה; ההתאמה נשענת על הנחה זו (docs/ARCHITECTURE.md),
/// ולכן שניהם מגיעים לתוסף ולא רק אחד מהם.
class ResponsaNote {
  /// מספר השורה בקובץ. עמודת `id` אינה מזהה: היא מתחילה מ-1 לכל מחבר (נמדד
  /// חי), ולכן ספרים שונים חולקים אותו `id`.
  final int id;

  /// גוף ההערה (`cmnt`).
  final String text;

  /// כותרת ההערה (`koteret`).
  final String? title;

  /// מראה המקום (`source`).
  final String? source;

  /// המילה או הביטוי שההערה מוצמדת אליהם (`mila`).
  final String? quote;

  /// התאריך (`date`, ששמור כ-`yymmdd`) כ-`YYYY-MM-DD`; ערך אחר כמות שהוא.
  final String? date;

  /// סוג ההערה (`type`).
  final int? kind;

  /// קואורדינטות המיקום הפנימי של בר אילן: מחבר, ספר, מסמך, פסקה, משפט,
  /// מילה והיסט. אינן מזהות ספר בקטלוג (docs/ARCHITECTURE.md), ולכן הן
  /// מגיעות לאבחון בלבד.
  final Map<String, int> position;

  const ResponsaNote({
    required this.id,
    required this.text,
    this.title,
    this.source,
    this.quote,
    this.date,
    this.kind,
    this.position = const {},
  });

  Map<String, Object?> toJson() => {
    'id': id,
    'text': text,
    'title': ?title,
    'source': ?source,
    'quote': ?quote,
    'date': ?date,
    'kind': ?kind,
    if (position.isNotEmpty) 'position': position,
  };

  /// הערה בלי גוף ובלי כותרת אינה שווה הצגה: זו הצמדה ריקה.
  bool get isEmpty =>
      text.trim().isEmpty && (title == null || title!.trim().isEmpty);
}
