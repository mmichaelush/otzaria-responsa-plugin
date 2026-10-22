import 'dart:typed_data';

import 'package:responsa_helper/src/text/responsa_hebrew.dart';
import 'package:responsa_helper/src/text/responsa_names.dart';

/// מחבר לפי מזהה החיבור מתוך `DB\FILE00` - המקור הראשי; הביבליוגרפיה מותאמת
/// לפי שם (`ר"ש` על זרעים קיבל את רש"י) והיא רק נסיגה.
class ResponsaAuthorTable {
  final Map<int, String> _authors;
  final Set<int> _known;

  /// מאיזה קובץ בארכיון: `FILE65`, `FILE06` (הקטלוג), או ריק.
  final String source;

  const ResponsaAuthorTable._(this._authors, this._known, [this.source = '']);

  static const ResponsaAuthorTable empty = ResponsaAuthorTable._({}, {});

  /// מ"קטלוג ספרים" (`FILE06`): הוא מכיר רק חיבורים שיש להם מחבר, ולכן
  /// השאר נופלים לביבליוגרפיה.
  factory ResponsaAuthorTable.fromCatalog(
    Map<int, String> authors, {
    String source = 'FILE06',
  }) => ResponsaAuthorTable._(
    Map.unmodifiable(authors),
    Set.unmodifiable(authors.keys),
    source,
  );

  /// [primary] קודם; [fallback] רק לחיבור שאין לו שם ב-[primary]. כך כל
  /// מהדורה מקבלת מה שיש בה, באיזה קובץ שהוא: ב-25 וב-27 `FILE65` ממלא כמעט
  /// הכול, ב-29 וב-32 `FILE06`.
  static ResponsaAuthorTable merged(
    ResponsaAuthorTable primary,
    ResponsaAuthorTable fallback,
  ) {
    if (fallback.authorCount == 0) return primary;
    if (primary.authorCount == 0) return fallback;
    final authors = {...primary._authors};
    for (final MapEntry(key: id, value: name) in fallback._authors.entries) {
      authors.putIfAbsent(id, () => name);
    }
    final added = authors.length - primary._authors.length;
    return ResponsaAuthorTable._(
      Map.unmodifiable(authors),
      Set.unmodifiable({...primary._known, ...fallback._known}),
      added == 0 ? primary.source : '${primary.source}+${fallback.source}',
    );
  }

  bool get isEmpty => _known.isEmpty;

  /// כמה חיבורים יש להם מחבר.
  int get authorCount => _authors.length;

  /// האם הטבלה מכירה את החיבור. חיבור מוכר בלי מחבר הוא הצהרה של בר
  /// אילן שאין לו מחבר יחיד — תנ"ך, משנה, מדרש — ולא חוסר מידע.
  bool knows(int bookId) => _known.contains(bookId);

  /// המחבר של החיבור, או `null`.
  String? authorOf(int bookId) => _authors[bookId];

  /// מילת שם משותפת אחת מספיקה: השוואת שם משפחה בלבד פוסלת את אותו אדם
  /// בכתיב אחר (`הלברשטאם` מול `הלברשטם`).
  static bool mayBeSamePerson(String a, String b) =>
      _nameWords(a).intersection(_nameWords(b)).isNotEmpty;

  static Set<String> _nameWords(String name) {
    final words = <String>{};
    var father = false;
    for (final word in ResponsaHebrew.tokens(
      ResponsaNames.withoutQualifier(name),
    )) {
      if (father) {
        father = false;
      } else if (_fatherWords.contains(word)) {
        father = true;
      } else if (!_titleWords.contains(word)) {
        words.add(word);
      }
    }
    return words;
  }

  /// `בן` ו-`בר`: המילה שאחריהן היא שם האב — `רבי שלמה בן יצחק` אינו
  /// אותו אדם כמו `ר' יצחק אלפסי`.
  static const Set<String> _fatherWords = {'בנ', 'בר'};

  /// תארים ומילות יחוס, אחרי [ResponsaHebrew.spellingKey] — `רבי` הוא
  /// `רב`, `הלוי` הוא `הל`. שני אנשים שונים חולקים אותן תמיד.
  static const Set<String> _titleWords = {
    'ר',
    'רב',
    'הרב',
    'רבנ',
    'הכהנ',
    'הל',
    'אבנ',
    'ד',
    'דה',
  };

  /// גרסת קריאת הארכיון. "אין מחברים בארכיון" שנרשם ברשימה (`none`) תקף רק
  /// לגרסה שבדקה; כשהקריאה משתפרת (2: `FILE25` של 103 בתים, ו-`Responsa.ini`
  /// ב-UTF-16), הרשימה מוצעת שוב להשלמה ([HelperService]).
  static const int readerRevision = 2;

  /// הגדלים שנמדדו: `FILE65`, ו-`FILE25` במהדורות עד 25.
  static const int recordSize = 73;

  /// `FILE25` במהדורות החדשות (נמדד ב-32): שם החיבור ארוך יותר. הטבלה שלא
  /// נקראה בגלל הגודל השאירה כל חיבור בלי "כותרת באותו מדור", ולכן כל
  /// המחברים נפסלו — מה שנראה כ-`FILE65` ריק.
  static const int titleRecordSize = 103;

  /// הגדלים שנמדדו הם רק נסיגה כשהתוכן אינו מכריע. הגודל נקבע מהקובץ עצמו
  /// ([_layout]), כי מהדורה חדשה (28, 33...) יכולה לשנות אותו שוב.
  static const List<int> _knownSizes = [recordSize, titleRecordSize];

  static const int _minRecordSize = 16;
  static const int _maxRecordSize = 512;

  /// לקביעת המבנה די בתחילת הקובץ; קובץ של מגה-בייט נבדק כך בפחות ממיליון
  /// פעולות לגודל מועמד.
  static const int _scoredBytes = 64 << 10;

  /// גודל רשומה בספריית המכל.
  static const int directoryEntrySize = 28;

  static const String _titlesMember = 'FILE25';
  static const String _authorsMember = 'FILE65';

  /// הבית הנמוך של `lParam` בסדר בתים הפוך: `0x6109` בעץ הוא `2401` בטבלה.
  static int bookIdOf(int param) =>
      ((param & 0xFF) << 8) | ((param >> 8) & 0xFF);

  /// האם [name] הוא אחד מהקבצים שהטבלה נבנית מהם.
  static bool isTableMember(String name) {
    final base = name.split('.').first.toUpperCase();
    return base == _titlesMember || base == _authorsMember;
  }

  /// `u16` מספר רשומות, ולכל קובץ שם של 20 בתים, `u32` היסט ו-`u32` גודל.
  /// `null` כשהמבנה אינו מוכר.
  static List<({String name, int offset, int size})>? parseDirectory(
    Uint8List header,
    int archiveLength,
  ) {
    if (header.length < 2) return null;
    final bytes = ByteData.sublistView(header);
    final count = bytes.getUint16(0, Endian.little);
    if (count == 0 || header.length < 2 + count * directoryEntrySize) {
      return null;
    }
    final entries = <({String name, int offset, int size})>[];
    for (var i = 0; i < count; i++) {
      final at = 2 + i * directoryEntrySize;
      final nameBytes = header.sublist(at, at + 20);
      final end = nameBytes.indexOf(0);
      final name = String.fromCharCodes(
        nameBytes.sublist(0, end < 0 ? 20 : end),
      );
      final offset = bytes.getUint32(at + 20, Endian.little);
      final size = bytes.getUint32(at + 24, Endian.little);
      // רשומה שמצביעה מחוץ לקובץ פירושה שהמבנה אינו מה שחשבנו.
      if (name.isEmpty || offset + size > archiveLength) return null;
      entries.add((name: name, offset: offset, size: size));
    }
    return entries;
  }

  /// מחבר רק עם כותרת באותו מדור, רק אדם (`ר' `), ובלי מחבר כשיש שניים.
  /// קובץ במבנה לא צפוי מדולג כולו - מחבר שגוי גרוע מהיעדר מחבר.
  static ResponsaAuthorTable parse(Map<String, Uint8List> members) {
    final titles = <String, Set<int>>{};
    final authors = <String, Map<int, String>>{};
    for (final entry in members.entries) {
      final parts = entry.key.toUpperCase().split('.');
      if (parts.length != 2) continue;
      switch (parts.first) {
        case _titlesMember:
          // רק המזהים; הטקסט של הכותרות אינו בשימוש.
          final records = _records(entry.value, strict: false);
          if (records == null) continue;
          titles[parts.last] = {for (final record in records.list) record.id};
        case _authorsMember:
          final records = _records(entry.value, strict: true);
          if (records == null) continue;
          authors[parts.last] = {
            for (final record in records.list) record.id: ?record.text,
          };
      }
    }

    final known = {for (final ids in titles.values) ...ids};
    final found = <int, Set<String>>{};
    for (final MapEntry(key: section, value: byId) in authors.entries) {
      final sectionTitles = titles[section] ?? const <int>{};
      for (final MapEntry(key: id, value: name) in byId.entries) {
        if (!sectionTitles.contains(id)) continue;
        final person = asPerson(name);
        if (person == null) continue;
        (found[id] ??= {}).add(person);
      }
    }
    return ResponsaAuthorTable._(
      {
        for (final MapEntry(key: id, value: names) in found.entries)
          if (names.length == 1) id: names.single,
      },
      known,
      'FILE65',
    );
  }

  static const String _personLead = "ר' ";

  /// אדם: `ר' פרטי משפחה`, או בסדר של הקטלוג, `משפחה, ר' פרטי` (מהדורה
  /// שכתבה כך גם את `FILE65`), שהופך לסדר הראשון. אחרת `null`.
  static String? asPerson(String name) {
    if (name.startsWith(_personLead)) return name;
    final comma = name.indexOf(', $_personLead');
    if (comma <= 0) return null;
    final surname = name.substring(0, comma).trim();
    final given = name.substring(comma + 2).trim();
    return '$given $surname';
  }

  /// רשומות הקובץ: `u16` מזהה (big-endian) וטקסט CP862 עד `\0`, בגודל קבוע.
  /// הגודל וההיסט נקבעים מהתוכן ([_layout]), לא לפי מהדורה; `null` כשאין
  /// גודל שהקובץ מתחלק בו. [strict]: קובץ שרוב רשומותיו אינן טקסט קריא אינו
  /// המבנה שחשבנו (מחבר שגוי גרוע מהיעדר מחבר), ורשומה בודדת שאינה קריאה
  /// מדולגת. בלי [strict] (מזהים בלבד) הטקסט אינו קובע.
  static ({int size, List<({int id, String? text})> list})? _records(
    Uint8List bytes, {
    required bool strict,
  }) {
    final layout = _layout(bytes);
    if (layout == null) return null;
    final list = <({int id, String? text})>[];
    var readable = 0;
    for (var at = 0; at < bytes.length; at += layout) {
      final id = (bytes[at] << 8) | bytes[at + 1];
      final text = decodeCp862(bytes.sublist(at + 2, at + layout));
      if (text != null) readable++;
      list.add((id: id, text: text));
    }
    if (strict && readable * 10 < list.length * 9) return null;
    return (size: layout, list: list);
  }

  /// גודל הרשומה שבו רוב הרשומות הן טקסט קריא שנגמר ב-`\0`. כפולה של הגודל
  /// האמיתי נותנת חצי מהרשומות, וחצי גודל חותך כל טקסט ארוך, ולכן הגודל
  /// האמיתי מנצח; בשוויון — הגדול. כשהתוכן אינו מכריע (טבלה קטנה מאוד, או
  /// בלי טקסט) נשארים הגדלים שנמדדו. קובץ עם בתים עודפים (כותרת או סוף)
  /// אינו מתחלק, ומדולג: מחבר שגוי גרוע מהיעדר מחבר.
  static int? _layout(Uint8List bytes) {
    int? best;
    var bestScore = 0;
    for (var size = _minRecordSize; size <= _maxRecordSize; size++) {
      if (size > bytes.length) break;
      if (bytes.length % size != 0) continue;
      // רשומה אחת בגודל הקובץ כולו היא כל קובץ; רק גודל שנמדד מוכר כך.
      if (bytes.length == size && !_knownSizes.contains(size)) continue;
      final (:score, :records) = _score(bytes, size);
      // רוב הרשומות טקסט: גודל שחותך את הרשומות האמיתיות משאיר חצי ריקות.
      if (score * 2 < records) continue;
      if (score > bestScore || (score == bestScore && score > 0)) {
        best = size;
        bestScore = score;
      }
    }
    if (best != null) return best;
    for (final size in _knownSizes) {
      if (bytes.isNotEmpty && bytes.length % size == 0) return size;
    }
    return null;
  }

  /// כמה רשומות, מתוך [records] בתחילת הקובץ, הן טקסט קריא (אותיות עברית או ASCII מודפס)
  /// שנגמר ב-`\0` בתוך הרשומה. מה שאחרי ה-`\0` אינו נבדק: ריפוד אינו
  /// מובטח.
  static ({int score, int records}) _score(Uint8List bytes, int size) {
    final end = _scoredBytes ~/ size * size;
    final limit = end > bytes.length ? bytes.length : end;
    var score = 0;
    var records = 0;
    for (var at = 0; at + size <= limit; at += size) {
      records++;
      var letters = 0;
      var terminated = false;
      var readable = true;
      for (var i = at + 2; i < at + size; i++) {
        final byte = bytes[i];
        if (byte == 0) {
          terminated = true;
          break;
        }
        if (byte >= 0x80 && byte <= 0x9A) {
          letters++;
        } else if (byte > 0x20 && byte < 0x7F) {
          letters++;
        } else if (byte != 0x20) {
          readable = false;
          break;
        }
      }
      if (readable && terminated && letters > 0) score++;
    }
    return (score: score, records: records);
  }

  /// מה נקרא מכל מדור, ליומן: `AH 25:103x2501 65:73x156`.
  /// כך דיווח אחד מראה איזה גודל רשומה יש במהדורה, בלי כלי בדיקה נוסף.
  static String describeTables(Map<String, Uint8List> members) {
    final sections = <String, List<String>>{};
    for (final entry in members.entries) {
      final parts = entry.key.toUpperCase().split('.');
      if (parts.length != 2) continue;
      final number = switch (parts.first) {
        _titlesMember => '25',
        _authorsMember => '65',
        _ => null,
      };
      if (number == null) continue;
      final records = _records(
        entry.value,
        strict: parts.first == _authorsMember,
      );
      (sections[parts.last] ??= []).add(
        records == null
            ? '$number:?${entry.value.length}'
            : '$number:${records.size}x${records.list.length}',
      );
    }
    final keys = sections.keys.toList()..sort();
    return [
      for (final key in keys) '$key ${sections[key]!.join(' ')}',
    ].join(', ');
  }

  /// `null` כשיש תו שאינו אות עברית או ASCII מודפס. הסוגריים הפוכים, כי
  /// טקסט DOS נכתב בסדר ויזואלי.
  static String? decodeCp862(Uint8List bytes) {
    final end = bytes.indexOf(0);
    final units = <int>[];
    for (final byte in end < 0 ? bytes : bytes.sublist(0, end)) {
      if (byte >= 0x80 && byte <= 0x9A) {
        units.add(0x05D0 + byte - 0x80);
      } else if (byte >= 0x20 && byte < 0x7F) {
        units.add(_mirrored[byte] ?? byte);
      } else {
        return null;
      }
    }
    return String.fromCharCodes(units).trim();
  }

  static const Map<int, int> _mirrored = {
    0x28: 0x29, // (
    0x29: 0x28, // )
    0x5B: 0x5D, // [
    0x5D: 0x5B, // ]
    0x7B: 0x7D, // {
    0x7D: 0x7B, // }
  };
}
