import 'dart:io';

import 'package:path/path.dart' as path;
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/notes/responsa_note.dart';
import 'package:responsa_helper/src/text/responsa_text_decoding.dart';
import 'package:sqlite3/sqlite3.dart';

/// מה שנקרא מקובץ ההערות, ומה לא.
class AnnotSnapshot {
  final List<ResponsaNote> notes;

  /// שורות בלי גוף ובלי כותרת. נספרות כדי שהמספר שהמשתמש רואה יסביר את
  /// ההפרש מול בר אילן.
  final int empty;

  const AnnotSnapshot({required this.notes, this.empty = 0});

  static const AnnotSnapshot none = AnnotSnapshot(notes: []);
}

class AnnotReadException implements Exception {
  final String message;
  const AnnotReadException(this.message);

  @override
  String toString() => message;
}

/// קורא את `annot_db` של בר אילן. **לעולם לא כותב ולעולם לא פותח את הקובץ
/// המקורי**: בר אילן יכולה להחזיק אותו בכתיבה, ופתיחה שלנו על הקובץ החי
/// עלולה לנעול אותו או להשאיר `-journal` שבר אילן תנסה לשחזר. קוראים עותק.
class AnnotReader {
  AnnotReader._();

  static const String table = 'COMMENT';

  /// העמודות שנקראות. עמודה שחסרה במהדורה מסוימת פשוט אינה נבחרת, והשדה
  /// נשאר ריק, ולא נכשלת הקריאה כולה.
  static const List<String> _textColumns = [
    'cmnt',
    'koteret',
    'source',
    'mila',
    'date',
  ];
  static const List<String> _positionColumns = [
    'auth',
    'book',
    'doc',
    'piska',
    'mishpat',
    'word',
    'offset',
  ];

  /// [dbPath] הוא `annot_db`. [workDir] לעותק הזמני (בדיקות).
  static AnnotSnapshot read(String dbPath, {Directory? workDir}) {
    final source = File(dbPath);
    if (!source.existsSync()) return AnnotSnapshot.none;
    Directory? scratch;
    try {
      scratch = (workDir ?? Directory.systemTemp).createTempSync(
        'responsa-annot-',
      );
      final copy = _copyWithJournal(source, scratch);
      return _readCopy(copy);
    } on FileSystemException catch (error) {
      throw AnnotReadException(
        'לא ניתן לקרוא את קובץ ההערות של בר אילן: ${error.message}',
      );
    } on SqliteException catch (error) {
      throw AnnotReadException(
        'קובץ ההערות של בר אילן אינו קריא (${error.message}).',
      );
    } finally {
      try {
        scratch?.deleteSync(recursive: true);
      } on FileSystemException catch (error) {
        logLine('AnnotReader: temp cleanup failed: ${error.message}');
      }
    }
  }

  /// `-journal` ו-`-wal` נשארים ליד הקובץ כשבר אילן נסגרה באמצע כתיבה, או
  /// כשיש בו שינויים שטרם נכתבו אליו. בלעדיהם העותק עלול להיות חצי-כתוב או
  /// חסר את ההערות האחרונות; עמם SQLite משחזר אותו בעותק בלבד.
  static String _copyWithJournal(File source, Directory scratch) {
    final target = path.join(scratch.path, 'annot_db');
    source.copySync(target);
    for (final suffix in const ['-journal', '-wal']) {
      final side = File('${source.path}$suffix');
      if (side.existsSync()) side.copySync('$target$suffix');
    }
    return target;
  }

  /// נפתח לקריאה וכתיבה: זה עותק זמני, ושחזור של `-journal` כותב אליו. חיבור
  /// "קריאה בלבד" לא יכול לשחזר אותו (`SQLITE_READONLY_ROLLBACK`).
  static AnnotSnapshot _readCopy(String copy) {
    final db = sqlite3.open(copy);
    try {
      final columns = {
        for (final row in db.select('PRAGMA table_info($table)'))
          (row['name'] as String).toLowerCase(),
      };
      if (columns.isEmpty) return AnnotSnapshot.none;

      final selected = [
        'rowid AS _rowid',
        if (columns.contains('type')) 'type',
        for (final name in _textColumns)
          // לוב: כך הפענוח (UTF-8 או 1255) בידינו ולא בידי הספרייה.
          if (columns.contains(name)) 'CAST($name AS BLOB) AS $name',
        for (final name in _positionColumns)
          if (columns.contains(name)) '"$name"',
      ];
      final rows = db.select(
        'SELECT ${selected.join(', ')} FROM $table ORDER BY rowid',
      );

      final notes = <ResponsaNote>[];
      var empty = 0;
      for (final row in rows) {
        final note = _note(row, columns);
        if (note.isEmpty) {
          empty++;
        } else {
          notes.add(note);
        }
      }
      return AnnotSnapshot(notes: notes, empty: empty);
    } finally {
      db.close();
    }
  }

  static ResponsaNote _note(Row row, Set<String> columns) {
    String? text(String name) => columns.contains(name)
        ? _nonEmpty(ResponsaTextDecoding.fromSqlite(row[name]))
        : null;
    int? number(String name) =>
        columns.contains(name) && row[name] is int ? row[name] as int : null;

    return ResponsaNote(
      // `id` מתחיל מ-1 לכל מחבר (נמדד חי), ולכן אינו מזהה: מספר השורה כן.
      id: row['_rowid'] as int,
      text: text('cmnt') ?? '',
      title: text('koteret'),
      source: text('source'),
      quote: text('mila'),
      date: normalizeDate(text('date')),
      kind: number('type'),
      position: {for (final name in _positionColumns) name: ?number(name)},
    );
  }

  /// בר אילן שומרת תאריך כ-`yymmdd` (`261109` = 9.11.2026; נמדד חי). מוחזר
  /// כ-ISO, וערך בצורה אחרת נשאר כמות שהוא.
  static String? normalizeDate(String? raw) {
    final match = RegExp(r'^(\d\d)(\d\d)(\d\d)$').firstMatch(raw ?? '');
    if (match == null) return raw;
    final month = int.parse(match[2]!);
    final day = int.parse(match[3]!);
    if (month < 1 || month > 12 || day < 1 || day > 31) return raw;
    return '20${match[1]}-${match[2]}-${match[3]}';
  }

  static String? _nonEmpty(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}
