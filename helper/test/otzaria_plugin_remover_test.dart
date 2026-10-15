import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/server/otzaria_plugin_remover.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:test/test.dart';

/// ההסרה המלאה מוחקת מהמסד של אוצריא. כל טעות כאן מוחקת תוסף אחר, או
/// משאירה תוסף שבור; לכן כל מקרה נבדק מול מסד אמיתי בסכמה של אוצריא.
void main() {
  const id = 'com.otzaria-responsa';
  late Directory temp;
  late String root;

  setUp(() {
    temp = Directory.systemTemp.createTempSync('remover_');
    root = p.join(temp.path, 'otzaria');
  });
  tearDown(() => temp.deleteSync(recursive: true));

  /// הסכמה של PluginSystemDatabase (אוצריא, 10.2026), בקיצור.
  String database(
    String dir, {
    List<String> plugins = const [id, 'other'],
    String? installPath,
  }) {
    Directory(dir).createSync(recursive: true);
    final path = p.join(dir, OtzariaPluginRemover.databaseName);
    final db = sqlite3.open(path);
    db.execute('''
      CREATE TABLE plugin_installation (plugin_id TEXT PRIMARY KEY, install_path TEXT);
      CREATE TABLE plugin_permission_grant (plugin_id TEXT NOT NULL, permission TEXT);
      CREATE TABLE plugin_kv_store (plugin_id TEXT NOT NULL, key TEXT);
      CREATE TABLE plugin_runtime_log (id INTEGER PRIMARY KEY AUTOINCREMENT, plugin_id TEXT NOT NULL);
    ''');
    for (final plugin in plugins) {
      db.execute('INSERT INTO plugin_installation VALUES (?, ?)', [
        plugin,
        installPath ??
            p.join(root, 'plugins', 'installed', plugin, '.release-1'),
      ]);
      db.execute('INSERT INTO plugin_permission_grant VALUES (?, ?)', [
        plugin,
        'network.localhost',
      ]);
      db.execute('INSERT INTO plugin_kv_store VALUES (?, ?)', [plugin, 'k']);
      db.execute('INSERT INTO plugin_runtime_log (plugin_id) VALUES (?)', [
        plugin,
      ]);
    }
    db.close();
    return path;
  }

  Map<String, int> rows(String path, String plugin) {
    final db = sqlite3.open(path, mode: OpenMode.readOnly);
    try {
      return {
        for (final table in const [
          'plugin_installation',
          'plugin_permission_grant',
          'plugin_kv_store',
          'plugin_runtime_log',
        ])
          table:
              db.select(
                    'SELECT COUNT(*) AS n FROM $table WHERE plugin_id = ?',
                    [plugin],
                  ).first['n']
                  as int,
      };
    } finally {
      db.close();
    }
  }

  Directory folder(String kind, [String plugin = id]) =>
      Directory(p.join(root, 'plugins', kind, plugin))
        ..createSync(recursive: true);

  OtzariaPluginRemover remover({bool running = false}) => OtzariaPluginRemover(
    pluginId: id,
    roots: [root],
    otzariaRunning: () => running,
  );

  test('אוצריא סגורה: השורות והתיקיות של התוסף נמחקות, ושל אחר נשארות', () {
    final db = database(p.join(root, 'databases'));
    final installed = folder('installed');
    File(p.join(installed.path, '.release-1', 'manifest.json'))
      ..createSync(recursive: true)
      ..writeAsStringSync('{}');
    final data = folder('data');
    final other = folder('installed', 'other');

    expect(remover().run(), PluginRemoval.removed);
    expect(rows(db, id).values, everyElement(0));
    expect(rows(db, 'other').values, everyElement(1));
    expect(installed.existsSync(), isFalse);
    expect(data.existsSync(), isFalse);
    expect(other.existsSync(), isTrue);
  });

  test('אוצריא פתוחה: שום דבר אינו נמחק', () {
    final db = database(p.join(root, 'databases'));
    final installed = folder('installed');
    expect(remover(running: true).run(), PluginRemoval.otzariaRunning);
    expect(rows(db, id).values, everyElement(1));
    expect(installed.existsSync(), isTrue);
  });

  test('לא רשום ואין תיקייה: אינו מותקן, גם כשאוצריא פתוחה', () {
    database(p.join(root, 'databases'), plugins: ['other']);
    expect(remover(running: true).run(), PluginRemoval.notInstalled);
  });

  test('תיקייה בלי רישום שנמצא: התיקייה נשארת', () {
    database(p.join(root, 'databases'), plugins: ['other']);
    final installed = folder('installed');
    expect(remover().run(), PluginRemoval.unknownLocation);
    expect(installed.existsSync(), isTrue);
  });

  test('תוסף פיתוח, או מותקן בתיקייה של אוצריא אחרת: אינו נוגעים בו', () {
    final db = database(
      p.join(root, 'databases'),
      installPath: p.join(temp.path, 'dev', 'plugin'),
    );
    expect(remover().run(), PluginRemoval.notInstalled);
    expect(rows(db, id).values, everyElement(1));
  });

  test('מסד ליד הספרייה, לפי הנתיב שבהעדפות', () {
    final library = p.join(temp.path, 'lib', 'books');
    final db = database(p.join(temp.path, 'lib', 'databases'));
    Directory(root).createSync(recursive: true);
    File(
      p.join(root, 'app_preferences.hive'),
    ).writeAsBytesSync(hiveString(library));
    expect(remover().run(), PluginRemoval.removed);
    expect(rows(db, id).values, everyElement(0));
  });

  group('preferencePaths', () {
    test('מחרוזת Hive: אורך ואחריו UTF-8, גם בעברית', () {
      const path = r'D:\ספרים\אוצריא';
      expect(OtzariaPluginRemover.preferencePaths(hiveString(path)), [path]);
    });

    test('נתיב בתוך JSON', () {
      final bytes = Uint8List.fromList([
        0,
        0,
        0,
        0,
        ...utf8.encode(r'{"a":"E:\\data\\x","b":1}'),
      ]);
      expect(OtzariaPluginRemover.preferencePaths(bytes), [r'E:\data\x']);
    });
  });

  test('אוצריא ניידת: otzaria_data שליד ה-exe, לפני APPDATA', () {
    final portable = Directory(p.join(temp.path, 'portable'))..createSync();
    File(p.join(portable.path, 'portable.marker')).createSync();
    final installed = p.join(temp.path, 'installed', 'otzaria.exe');
    expect(
      OtzariaPluginRemover.dataRoots(
        otzariaExes: [p.join(portable.path, 'otzaria.exe'), installed],
        appData: p.join(temp.path, 'appdata'),
      ),
      [
        p.join(portable.path, 'otzaria_data'),
        p.join(temp.path, 'appdata', 'otzaria'),
      ],
    );
  });

  test('OtzariaClients: האחרון ראשון, בלי כפילויות', () {
    final clients = OtzariaClients(p.join(temp.path, 'clients.txt'));
    expect(clients.read(), isEmpty);
    clients
      ..remember(r'C:\a\otzaria.exe')
      ..remember(r'D:\b\otzaria.exe')
      ..remember(r'C:\a\otzaria.exe');
    expect(clients.read(), [r'C:\a\otzaria.exe', r'D:\b\otzaria.exe']);
  });
}

/// כמו ש-Hive כותב מחרוזת: אורך (4 בתים, little-endian) ואחריו UTF-8,
/// בתוך רשומה עם עוד בתים.
Uint8List hiveString(String value) {
  final text = utf8.encode(value);
  final length = ByteData(4)..setUint32(0, text.length, Endian.little);
  return Uint8List.fromList([
    1,
    2,
    0x04,
    ...length.buffer.asUint8List(),
    ...text,
    9,
    9,
  ]);
}
