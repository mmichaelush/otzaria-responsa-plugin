import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// חיפוש בזיכרון על הקטלוג: כ-8.5 עד 13.5 אלף ספרים, ולכן סריקה מלאה בכל
/// שאילתה מהירה מספיק ופשוטה יותר מאינדקס.
///
/// ההשוואה ב-[ResponsaHebrew.spellingKey], כדי שכתיב מלא וחסר, גרשיים
/// וסופיות לא יפספסו ספר. המחבר נמצא גם בנתיב העץ (`שו"ת > מהרש"א > ...`),
/// ולכן הנתיב חלק ממרחב החיפוש.
class CatalogIndex {
  CatalogIndex(Iterable<ResponsaCatalogBook> books, {this.builtAt})
    : _entries = [for (final book in books) _Entry(book)] {
    for (final entry in _entries) {
      _byKey[entry.book.key] = entry.book;
    }
  }

  final List<_Entry> _entries;
  final Map<String, ResponsaCatalogBook> _byKey = {};

  int get length => _entries.length;

  /// זמן הבנייה של הקובץ שממנו נטענו הספרים (`/catalog/export`), כשידוע.
  final String? builtAt;

  /// לפי השם (`loadBooks` ממיין כך).
  Iterable<ResponsaCatalogBook> get books =>
      _entries.map((entry) => entry.book);

  ResponsaCatalogBook? byKey(String key) => _byKey[key];

  /// כל ההתאמות, מהטובה ביותר. שאילתה ריקה אינה מחזירה דבר, כדי לא להציף
  /// את המסך באלפי ספרים. [path] מצמצם לקטגוריה ולכל מה שתחתיה.
  List<ResponsaCatalogBook> search(String query, {String path = ''}) {
    final tokens = ResponsaHebrew.tokens(query);
    if (tokens.isEmpty) return const [];
    final whole = tokens.join(' ');
    final hits = <({_Entry entry, int rank})>[];
    for (final entry in _entries) {
      if (!within(entry.book.contextPath, path)) continue;
      final rank = entry.rank(tokens, whole);
      if (rank != null) hits.add((entry: entry, rank: rank));
    }
    hits.sort((a, b) {
      final byRank = a.rank.compareTo(b.rank);
      if (byRank != 0) return byRank;
      final byLength = a.entry.title.length.compareTo(b.entry.title.length);
      if (byLength != 0) return byLength;
      return a.entry.book.title.compareTo(b.entry.book.title);
    });
    return [for (final hit in hits) hit.entry.book];
  }

  /// האם [contextPath] הוא [path] או קטגוריה שתחתיו. נתיב ריק = הכול.
  static bool within(String contextPath, String path) =>
      path.isEmpty || contextPath == path || contextPath.startsWith('$path/');

  /// רמה אחת בעץ: תתי-הקטגוריות של [path] (עם מספר הספרים בכל אחת, כולל
  /// תתי-קטגוריות) והספרים שיושבים בו עצמו, בסדר העץ של בר אילן.
  CatalogLevel browse(String path) {
    final counts = <String, int>{};
    final firstOrder = <String, int>{};
    final books = <ResponsaCatalogBook>[];
    final prefix = path.isEmpty ? '' : '$path/';
    for (final entry in _entries) {
      final book = entry.book;
      final context = book.contextPath;
      if (context == path) {
        books.add(book);
      } else if (context.startsWith(prefix)) {
        final rest = context.substring(prefix.length);
        final slash = rest.indexOf('/');
        final name = slash < 0 ? rest : rest.substring(0, slash);
        if (name.isEmpty) continue;
        counts[name] = (counts[name] ?? 0) + 1;
        final order = firstOrder[name];
        if (order == null || book.treeOrder < order) {
          firstOrder[name] = book.treeOrder;
        }
      }
    }
    final names = counts.keys.toList()
      ..sort((a, b) => firstOrder[a]!.compareTo(firstOrder[b]!));
    books.sort((a, b) => a.treeOrder.compareTo(b.treeOrder));
    return CatalogLevel(
      path: path,
      categories: [
        for (final name in names)
          (name: name, path: '$prefix$name', bookCount: counts[name]!),
      ],
      books: books,
    );
  }
}

class CatalogLevel {
  const CatalogLevel({
    required this.path,
    required this.categories,
    required this.books,
  });

  final String path;
  final List<({String name, String path, int bookCount})> categories;
  final List<ResponsaCatalogBook> books;

  bool get exists => path.isEmpty || categories.isNotEmpty || books.isNotEmpty;
}

class _Entry {
  _Entry(this.book)
    : title = ResponsaHebrew.spellingKey(book.title),
      author = ResponsaHebrew.spellingKey(book.author),
      path = ResponsaHebrew.spellingKey(book.contextPath.replaceAll('/', ' ')) {
    titleWords = _words(title);
    authorWords = _words(author);
    pathWords = _words(path);
  }

  final ResponsaCatalogBook book;
  final String title;
  final String author;
  final String path;
  late final List<String> titleWords;
  late final List<String> authorWords;
  late final List<String> pathWords;

  static List<String> _words(String key) =>
      key.split(' ').where((word) => word.isNotEmpty).toList();

  /// אותיות השימוש שמתחברות לתחילת מילה (`והרשב"א`, `לרמב"ם`).
  static const String _prefixLetters = 'והבכלמש';

  /// תארים שמקלידים לפני שם (`הרב עובדיה יוסף`), כשבבר אילן המחבר רשום
  /// `ר' עובדיה יוסף` או בלי תואר. מילה שלא נמצאה פוסלת ספר, ולכן תואר
  /// שאינו בספר אינו נספר, כל עוד יש בשאילתה מילה אחרת.
  static final Set<String> _honorifics = {
    for (final word in const [
      'הרב',
      'הרבנים',
      'רבי',
      'ר\'',
      'רבנו',
      'רבינו',
      'מרן',
      'הגאון',
      'הגה"ק',
      'הרה"ג',
      'הרה"ק',
      'מהר"ר',
      'מוהר"ר',
      'אדמו"ר',
      'האדמו"ר',
      'הקדוש',
      'זצ"ל',
      'זצוק"ל',
      'זיע"א',
      'ז"ל',
      'שליט"א',
    ])
      ResponsaHebrew.spellingKey(word),
  };

  /// מילה ששאילתה מתחילה אותה, ולא תת-מחרוזת בכל מקום: `שת` (מ"שו"ת") אסור
  /// שיתאים ל"החדשות". מילה שמתחילה באות שימוש נבדקת גם בלעדיה, וכך גם
  /// שאילתה שמתחילה בה' הידיעה (`החיד"א`, `הרמב"ם`), כשהשם רשום בלעדיה.
  static bool _matches(List<String> words, String token) =>
      _startsAny(words, token) ||
      (token.length > 3 &&
          token.startsWith('ה') &&
          _startsAny(words, token.substring(1)));

  static bool _startsAny(List<String> words, String token) {
    for (final word in words) {
      if (word.startsWith(token)) return true;
      if (word.length > token.length &&
          _prefixLetters.contains(word[0]) &&
          word.startsWith(token, 1)) {
        return true;
      }
    }
    return false;
  }

  /// `null` = לא מתאים. דרגה נמוכה = התאמה טובה יותר: כותרת זהה, כותרת
  /// שמתחילה בשאילתה, כל המילים בכותרת, בכותרת ובמחבר, ולבסוף בנתיב.
  /// תואר שלא נמצא (`_honorifics`) אינו נספר.
  int? rank(List<String> tokens, String whole) {
    var inTitle = 0;
    var inAuthor = 0;
    var unmatchedHonorifics = 0;
    for (final token in tokens) {
      if (_matches(titleWords, token)) {
        inTitle++;
      } else if (_matches(authorWords, token)) {
        inAuthor++;
      } else if (_matches(pathWords, token)) {
        continue;
      } else if (_honorifics.contains(token)) {
        unmatchedHonorifics++;
      } else {
        return null;
      }
    }
    final counted = tokens.length - unmatchedHonorifics;
    if (counted == 0) return null;
    if (title == whole) return 0;
    if (title.startsWith(whole)) return 1;
    if (inTitle == counted) return 2;
    if (inTitle + inAuthor == counted) return 3;
    return 4;
  }
}
