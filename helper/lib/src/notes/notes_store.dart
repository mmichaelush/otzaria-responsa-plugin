import 'dart:io';

import 'package:responsa_helper/src/notes/annot_reader.dart';
import 'package:responsa_helper/src/notes/responsa_note.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// עמוד של הערות, עם הספירות שהמסך צריך.
class NotesPage {
  /// כל ההערות בקובץ, לפני סינון.
  final int all;

  /// כמה מהן תואמות את החיפוש.
  final int total;
  final List<ResponsaNote> notes;

  /// שורות ריקות שדולגו (ראו [AnnotSnapshot.empty]).
  final int empty;

  /// מתי הקובץ שונה לאחרונה, כדי שהמשתמש יידע כמה העותק עדכני.
  final DateTime? modified;

  const NotesPage({
    required this.all,
    required this.total,
    required this.notes,
    this.empty = 0,
    this.modified,
  });
}

/// ההערות של התקנה אחת, בזיכרון, עד שהקובץ משתנה. בלי זה כל עמוד היה קורא
/// את הקובץ כולו מחדש: כמה אלפי הערות, ועותק של הקובץ בכל בקשה.
class NotesStore {
  NotesStore({AnnotSnapshot Function(String path)? reader})
    : _read = reader ?? AnnotReader.read;

  final AnnotSnapshot Function(String path) _read;

  String? _path;
  int? _size;
  DateTime? _modified;
  AnnotSnapshot _snapshot = AnnotSnapshot.none;
  List<String> _haystacks = const [];

  /// [query] ריק = הכול. כל מילה בשאילתה חייבת להופיע בהערה, בכל אחד
  /// משדותיה, בלי ניקוד ובלי הבדל בין כתיב מלא לחסר.
  NotesPage page(
    String annotPath, {
    String query = '',
    int offset = 0,
    int limit = 100,
  }) {
    _refresh(annotPath);
    final words = ResponsaHebrew.tokens(query);
    final matching = <ResponsaNote>[
      for (var i = 0; i < _snapshot.notes.length; i++)
        if (words.every(_haystacks[i].contains)) _snapshot.notes[i],
    ];
    final end = (offset + limit).clamp(0, matching.length);
    return NotesPage(
      all: _snapshot.notes.length,
      total: matching.length,
      notes: matching.sublist(offset.clamp(0, matching.length), end),
      empty: _snapshot.empty,
      modified: _modified,
    );
  }

  /// קורא מחדש רק כשהקובץ אחר: נתיב, גודל או זמן שינוי.
  void _refresh(String annotPath) {
    final stat = File(annotPath).statSync();
    final unchanged =
        _path == annotPath &&
        _size == stat.size &&
        _modified == stat.modified &&
        stat.type != FileSystemEntityType.notFound;
    if (unchanged) return;
    _snapshot = _read(annotPath);
    _haystacks = [for (final note in _snapshot.notes) _haystack(note)];
    _path = annotPath;
    _size = stat.size;
    _modified = stat.modified;
  }

  /// באותה צורה ש-[ResponsaHebrew.tokens] מנרמלת את השאילתה.
  static String _haystack(ResponsaNote note) => ResponsaHebrew.spellingKey(
    [
      note.text,
      note.title,
      note.source,
      note.quote,
    ].whereType<String>().join(' '),
  );
}
