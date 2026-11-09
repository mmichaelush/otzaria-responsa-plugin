// כלי מדידה ידני: עץ הביוגרפיות של בר אילן החי, כמה מהספרים שבקטלוג מתאימים
// לו, וקריאת מאמר אחד. בלי RESPONSA_READ רק הרשימה וההתאמה, ואף חלון מאמר אינו
// נפתח.
// [RESPONSA_BOOK="משנה ברורה"] [RESPONSA_READ=1] [RESPONSA_AUTOSTART=1] dart test --run-skipped test/live_biography_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/native/responsa_biography_controller.dart';
import 'package:test/test.dart';

void main() {
  test('biography index and one article', () async {
    final autoStart = Platform.environment['RESPONSA_AUTOSTART'] == '1';
    const reader = ResponsaBiographyController();
    final watch = Stopwatch()..start();
    final report = await reader.readIndex(allowLaunch: autoStart);
    print(
      'index: ${watch.elapsedMilliseconds}ms ok=${report.ok} '
      'entries=${report.entries.length} ${report.failure?.name ?? ''} '
      '${report.message ?? ''}',
    );
    if (!report.ok) return;
    for (final entry in report.entries.take(8)) {
      print('   ${entry.path.join(' > ')}');
    }
    final categories = {for (final e in report.entries) e.path.first};
    print('top-level categories: ${categories.length}');

    final index = BiographyIndex(installKey: 'live', entries: report.entries);
    final local = Platform.environment['LOCALAPPDATA'] ?? '';
    final catalogFile = p.join(local, 'OtzariaResponsa', 'catalog.sqlite');
    if (File(catalogFile).existsSync()) {
      final repository = ResponsaCatalogRepository(catalogFile);
      final books = await repository.loadBooks();
      var matched = 0;
      final misses = <String>[];
      for (final book in books) {
        if (index.find(book.title) != null) {
          matched++;
        } else if (misses.length < 12) {
          misses.add(book.title);
        }
      }
      print('catalog books: ${books.length}, with a biography: $matched');
    }

    final wanted = Platform.environment['RESPONSA_BOOK'];
    if (wanted == null || Platform.environment['RESPONSA_READ'] != '1') return;
    final entry = index.find(wanted);
    print('book "$wanted" -> ${entry?.path.join(' > ')}');
    if (entry == null) return;
    watch
      ..reset()
      ..start();
    final text = await reader.readText(entry, allowLaunch: autoStart);
    print(
      'text: ${watch.elapsedMilliseconds}ms ok=${text.ok} '
      '${text.failure?.name ?? ''} ${text.message ?? ''}',
    );
    final raw = text.text ?? '';
    print('chars=${raw.length}');
    print(raw.length > 400 ? raw.substring(0, 400) : raw);
  }, timeout: const Timeout(Duration(minutes: 15)));
}
