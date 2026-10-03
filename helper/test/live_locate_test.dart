// כלי מדידה ידני: מקומות מדויקים (`בראשית ב ג`) בעמוד כתיבת המקורות של בר
// אילן החי. בלי RESPONSA_OPEN רק מנתח ומדפיס את התוצאות, ואינו פותח חלון.
// RESPONSA_REFS="בראשית ב ג|ברכות דף ב" [RESPONSA_OPEN=1] dart test --run-skipped test/live_locate_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:test/test.dart';

void main() {
  test('locate', () async {
    final refs = (Platform.environment['RESPONSA_REFS'] ?? 'בראשית ב ג')
        .split('|')
        .map((ref) => ref.trim())
        .where((ref) => ref.isNotEmpty);
    final open = Platform.environment['RESPONSA_OPEN'] == '1';
    final controller = ResponsaController(allowAutoStart: () => false);

    for (final ref in refs) {
      final watch = Stopwatch()..start();
      final report = await controller.locate(ref, listOnly: !open);
      watch.stop();
      print('[$ref] ${watch.elapsedMilliseconds}ms ok=${report.ok}');
      if (!report.ok) {
        print('   failure=${report.failure?.name} ${report.message}');
        continue;
      }
      if (report.choices.isNotEmpty) {
        print('   ${report.choices.length} choices:');
        for (final choice in report.choices.take(25)) {
          print('     - $choice');
        }
        if (open) {
          final opened = await controller.locate(ref, index: 0);
          print(
            '   open #0 -> ok=${opened.ok} window="${opened.window}" '
            '${opened.failure?.name ?? ''} ${opened.message ?? ''}',
          );
        }
      } else {
        print('   opened window="${report.window}"');
      }
    }
  });
}
