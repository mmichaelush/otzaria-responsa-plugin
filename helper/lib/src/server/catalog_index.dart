import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// חיפוש בזיכרון על הקטלוג: כ-8.5 עד 13.5 אלף ספרים, ולכן סריקה מלאה בכל
/// שאילתה מהירה מספיק ופשוטה יותר מאינדקס.
///
/// ההשוואה ב-[ResponsaHebrew.spellingKey], כדי שכתיב מלא וחסר, גרשיים
/// וסופיות לא יפספסו ספר. המחבר נמצא גם בנתיב העץ (`שו"ת > מהרש"א > ...`),
/// ולכן הנתיב חלק ממרחב החיפוש.
class CatalogIndex {
  CatalogIndex(Iterable<ResponsaCatalogBook> books)
    : _entries = [for (final book in books) _Entry(book)] {
    for (final entry in _entries) {
      _byKey[entry.book.key] = entry.book;
    }
  }

  final List<_Entry> _entries;
  final Map<String, ResponsaCatalogBook> _byKey = {};

  int get length => _entries.length;

  ResponsaCatalogBook? byKey(String key) => _byKey[key];

  /// כל ההתאמות, מהטובה ביותר. שאילתה ריקה אינה מחזירה דבר, כדי לא להציף
  /// את המסך באלפי ספרים.
  List<ResponsaCatalogBook> search(String query) {
    final tokens = ResponsaHebrew.tokens(query);
    if (tokens.isEmpty) return const [];
    final whole = tokens.join(' ');
    final hits = <({_Entry entry, int rank})>[];
    for (final entry in _entries) {
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
}

class _Entry {
  _Entry(this.book)
    : title = ResponsaHebrew.spellingKey(book.title),
      author = ResponsaHebrew.spellingKey(book.author),
      path = ResponsaHebrew.spellingKey(book.contextPath.replaceAll('/', ' '));

  final ResponsaCatalogBook book;
  final String title;
  final String author;
  final String path;

  /// `null` = לא מתאים. דרגה נמוכה = התאמה טובה יותר: כותרת זהה, כותרת
  /// שמתחילה בשאילתה, כל המילים בכותרת, בכותרת ובמחבר, ולבסוף בנתיב.
  int? rank(List<String> tokens, String whole) {
    var inTitle = 0;
    var inAuthor = 0;
    for (final token in tokens) {
      if (title.contains(token)) {
        inTitle++;
      } else if (author.contains(token)) {
        inAuthor++;
      } else if (!path.contains(token)) {
        return null;
      }
    }
    if (title == whole) return 0;
    if (title.startsWith(whole)) return 1;
    if (inTitle == tokens.length) return 2;
    if (inTitle + inAuthor == tokens.length) return 3;
    return 4;
  }
}
