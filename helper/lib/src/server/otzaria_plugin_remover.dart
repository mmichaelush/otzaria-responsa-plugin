import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/log.dart';
import 'package:sqlite3/sqlite3.dart';

/// מה קרה בהסרה. המתקין קורא את קוד היציאה ([exitCode]).
enum PluginRemoval {
  /// הרישום והתיקיות נמחקו.
  removed(0),

  /// התוסף אינו רשום באף אוצריא שנמצאה, ואין לו תיקיות.
  notInstalled(10),

  /// התוסף רשום, ואוצריא פתוחה: היא שומרת את רשימת התוספים בזיכרון.
  otzariaRunning(11),

  /// יש תיקייה של התוסף, אבל הרישום שלה לא נמצא (מסד במקום לא מוכר).
  /// מחיקת התיקייה בלבד הייתה משאירה תוסף שבור באוצריא.
  unknownLocation(12),

  failed(13);

  final int exitCode;
  const PluginRemoval(this.exitCode);
}

/// מסיר תוסף מאוצריא סגורה, כמו "מחק" בהגדרות ← כלים: השורות שלו בכל
/// הטבלאות של `plugins_host.db` (הרישום, ההרשאות, האחסון, רשימת הספרים
/// לחיפוש הספרייה), ותיקיות `plugins/installed|data|cache/<id>`
/// (PluginInstallerService.uninstallPlugin באוצריא). לאוצריא אין פקודה
/// חיצונית להסרת תוסף.
///
/// המסד יושב לפעמים מחוץ לתיקיית הנתונים (ליד הספרייה, או במקום שנבחר
/// בהגדרות), והנתיב שמור בהעדפות של אוצריא (Hive). לכן נבדקים כל הנתיבים
/// שבהעדפות, ונמחק רק מסד שבאמת רשום בו התוסף.
class OtzariaPluginRemover {
  final String pluginId;

  /// תיקיות הנתונים של אוצריא ([dataRoots]).
  final List<String> roots;

  /// אוצריא פתוחה. ניתן להחלפה בבדיקות.
  final bool Function() otzariaRunning;

  OtzariaPluginRemover({
    required this.pluginId,
    required this.roots,
    bool Function()? otzariaRunning,
  }) : otzariaRunning = otzariaRunning ?? isOtzariaRunning;

  static const String databaseName = 'plugins_host.db';

  /// `%APPDATA%\otzaria`, ואוצריא ניידת (`portable.marker` ליד ה-exe)
  /// שומרת הכול ב-`otzaria_data` שליד ה-exe (AppPaths.getDataRootPath).
  static List<String> dataRoots({
    required Iterable<String> otzariaExes,
    String? appData,
  }) {
    final roots = <String>[];
    void add(String path) {
      final normalized = p.normalize(path);
      if (!roots.any((root) => p.equals(root, normalized))) {
        roots.add(normalized);
      }
    }

    for (final exe in otzariaExes) {
      final dir = p.dirname(exe);
      if (File(p.join(dir, 'portable.marker')).existsSync()) {
        add(p.join(dir, 'otzaria_data'));
      }
    }
    if (appData != null && appData.isNotEmpty) add(p.join(appData, 'otzaria'));
    return roots;
  }

  PluginRemoval run() {
    try {
      return _run();
    } catch (error, stack) {
      logLine('OtzariaPluginRemover: $error\n$stack');
      return PluginRemoval.failed;
    }
  }

  PluginRemoval _run() {
    final databases = [
      for (final root in roots)
        for (final path in databaseCandidates(root))
          if (File(path).existsSync()) (root: root, path: path),
    ];
    final registered = [
      for (final database in databases)
        if (_isRegistered(database.path, database.root)) database.path,
    ];
    final folders = [
      for (final root in roots)
        for (final kind in const ['installed', 'data', 'cache'])
          if (Directory(p.join(root, 'plugins', kind, pluginId)) case final dir
              when dir.existsSync())
            dir,
    ];
    logLine(
      'OtzariaPluginRemover: $pluginId, roots ${roots.join('; ')}; '
      'databases ${databases.map((d) => d.path).join('; ')}; registered in '
      '${registered.isEmpty ? 'none' : registered.join('; ')}; '
      'folders ${folders.map((d) => d.path).join('; ')}',
    );
    if (registered.isEmpty) {
      return folders.any(
            (dir) => p.basename(p.dirname(dir.path)) == 'installed',
          )
          ? PluginRemoval.unknownLocation
          : PluginRemoval.notInstalled;
    }
    if (otzariaRunning()) return PluginRemoval.otzariaRunning;
    for (final path in registered) {
      _deleteRows(path);
    }
    for (final dir in folders) {
      dir.deleteSync(recursive: true);
    }
    logLine('OtzariaPluginRemover: removed $pluginId');
    return PluginRemoval.removed;
  }

  /// רשום, ומותקן בתיקייה של [root]. מסד ב-ProgramData (ספרייה משותפת)
  /// או תוסף פיתוח שנטען מתיקייה אחרת אינם נוגעים בהם.
  bool _isRegistered(String path, String root) {
    final db = sqlite3.open(path, mode: OpenMode.readOnly);
    try {
      final rows = db.select(
        'SELECT install_path FROM plugin_installation WHERE plugin_id = ?',
        [pluginId],
      );
      if (rows.isEmpty) return false;
      final installPath = rows.first['install_path'];
      return installPath is String &&
          p.isWithin(
            p.join(root, 'plugins', 'installed', pluginId),
            installPath,
          );
    } on SqliteException {
      return false;
    } finally {
      db.close();
    }
  }

  /// בכל טבלה שיש בה `plugin_id`, ולא רק בחמש שאוצריא מכירה היום
  /// (PluginSystemDatabase.deletePlugin): טבלה שתתווסף תנוקה גם היא.
  void _deleteRows(String path) {
    final db = sqlite3.open(path);
    try {
      final tables = [
        for (final row in db.select(
          "SELECT name FROM sqlite_master WHERE type = 'table'",
        ))
          row['name'] as String,
      ];
      db.execute('BEGIN IMMEDIATE');
      try {
        for (final table in tables) {
          final columns = db.select('PRAGMA table_info("$table")');
          if (!columns.any((column) => column['name'] == 'plugin_id')) {
            continue;
          }
          db.execute('DELETE FROM "$table" WHERE plugin_id = ?', [pluginId]);
        }
        db.execute('COMMIT');
      } catch (_) {
        db.execute('ROLLBACK');
        rethrow;
      }
    } finally {
      db.close();
    }
  }

  /// המקומות האפשריים של `plugins_host.db` (AppPaths.resolvePluginsDbPath):
  /// `<נתונים>/databases`, נתיב שנבחר בהגדרות, או `databases` שליד הספרייה.
  static List<String> databaseCandidates(String root) {
    final candidates = <String>[p.join(root, 'databases', databaseName)];
    void add(String path) {
      if (!candidates.any((known) => p.equals(known, path))) {
        candidates.add(path);
      }
    }

    final preferences = File(p.join(root, 'app_preferences.hive'));
    if (preferences.existsSync()) {
      for (final path in preferencePaths(preferences.readAsBytesSync())) {
        add(p.join(path, databaseName));
        add(p.join(path, 'databases', databaseName));
        add(p.join(p.dirname(path), 'databases', databaseName));
      }
    }
    return candidates;
  }

  /// נתיבי Windows שבקובץ ההעדפות. מחרוזת ב-Hive נשמרת כאורך (4 בתים,
  /// little-endian) ואחריו UTF-8; נתיב שבתוך JSON נשמר עם `\\`.
  static List<String> preferencePaths(Uint8List bytes) {
    final found = <String>{};
    for (var i = 4; i + 3 <= bytes.length; i++) {
      if (!_isDriveLetter(bytes[i]) || bytes[i + 1] != 0x3A) continue;
      final slash = bytes[i + 2];
      if (slash != 0x5C && slash != 0x2F) continue;
      final length = ByteData.sublistView(
        bytes,
        i - 4,
        i,
      ).getUint32(0, Endian.little);
      if (length >= 3 && length <= 1024 && i + length <= bytes.length) {
        found.add(
          utf8.decode(bytes.sublist(i, i + length), allowMalformed: true),
        );
        continue;
      }
      // בתוך JSON: עד המרכאות.
      var end = i;
      while (end < bytes.length && end - i < 2048 && bytes[end] != 0x22) {
        end++;
      }
      if (end < bytes.length && bytes[end] == 0x22) {
        found.add(
          utf8
              .decode(bytes.sublist(i, end), allowMalformed: true)
              .replaceAll(r'\\', r'\'),
        );
      }
    }
    return [
      for (final path in found)
        if (!path.contains('�')) p.normalize(path.trim()),
    ];
  }

  static bool _isDriveLetter(int byte) =>
      (byte >= 0x41 && byte <= 0x5A) || (byte >= 0x61 && byte <= 0x7A);

  /// של המשתמש הזה בלבד: אוצריא של משתמש אחר אינה מחזיקה את המסד שלו.
  static bool isOtzariaRunning() {
    try {
      final user = Platform.environment['USERNAME'];
      final result = Process.runSync('tasklist', [
        '/FI',
        'IMAGENAME eq otzaria.exe',
        if (user != null && user.isNotEmpty) ...['/FI', 'USERNAME eq $user'],
        '/FO',
        'CSV',
        '/NH',
      ]);
      return '${result.stdout}'.toLowerCase().contains('"otzaria.exe"');
    } catch (_) {
      return false;
    }
  }
}

/// ה-exe של אוצריא שפנו לשירות (`/otzaria/icons`), כדי שההסרה תמצא גם
/// אוצריא ניידת. עד עשרה, האחרון ראשון.
class OtzariaClients {
  final String file;

  const OtzariaClients(this.file);

  static const int maxEntries = 10;

  List<String> read() {
    try {
      return [
        for (final line in File(file).readAsLinesSync())
          if (line.trim().isNotEmpty) line.trim(),
      ];
    } on FileSystemException {
      return const [];
    }
  }

  void remember(String exe) {
    final known = read();
    if (known.isNotEmpty && p.equals(known.first, exe)) return;
    final next = [
      exe,
      ...known.where((entry) => !p.equals(entry, exe)),
    ].take(maxEntries);
    try {
      File(file).writeAsStringSync('${next.join('\n')}\n');
    } on FileSystemException catch (error) {
      logLine('OtzariaClients: $error');
    }
  }
}
