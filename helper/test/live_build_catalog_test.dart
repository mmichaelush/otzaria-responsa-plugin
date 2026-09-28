// כלי מדידה ידני: בונה את הקטלוג כמו השירות (כולל העלאת בר אילן) לקובץ שב-RESPONSA_TARGET.
// RESPONSA_TARGET=<db> dart test --run-skipped test/live_build_catalog_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:test/test.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';

void main() {
  test('build catalog', () async {
    final target = Platform.environment['RESPONSA_TARGET'];
    expect(target, isNotNull, reason: 'RESPONSA_TARGET חובה');
    print('target: $target');

    final watch = Stopwatch()..start();
    var lastReport = 0;
    await for (final progress in ResponsaCatalogBuildService().build(
      targetPath: target!,
    )) {
      if (progress.scannedNodes - lastReport >= 100000) {
        lastReport = progress.scannedNodes;
        print(
          '  ${progress.stage.name}: $lastReport '
          '(${watch.elapsed.inSeconds}s)',
        );
      }
      if (progress.error != null) {
        fail('build failed: ${progress.error}');
      }
      if (progress.stage.name == 'done') {
        print(
          'done: ${progress.books} books from ${progress.scannedNodes} '
          'nodes in ${watch.elapsed}',
        );
      }
    }

    final repository = ResponsaCatalogRepository(target);
    final info = await repository.info();
    print(
      'catalog: ${info.bookCount} books, schema ${info.schemaVersion}, '
      'version ${info.sourceVersion}, from ${info.installPath}',
    );
    expect(info.bookCount, greaterThan(8000));
    expect(info.isOutdated, isFalse);

    final books = await repository.loadBooks();
    print('loaded ${books.length}; sample:');
    for (final book in books.take(5)) {
      print('   ${book.title}  || ${book.otzariaCategory}');
    }
  }, timeout: const Timeout(Duration(minutes: 30)));
}
