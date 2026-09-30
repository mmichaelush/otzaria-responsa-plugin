// כלי מדידה ידני: מריץ חיפושי טקסט בבר אילן החי ומדווח את התשובה והזמן.
// RESPONSA_QUERIES="ואהבת לרעך כמוך|קקקזזזז|שבת" dart test --run-skipped test/live_search_text_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/text/responsa_query.dart';
import 'package:test/test.dart';

void main() {
  test('search text', () async {
    final queries =
        (Platform.environment['RESPONSA_QUERIES'] ??
                'ואהבת לרעך כמוך|קקקזזזז|שבת')
            .split('|');
    final controller = ResponsaController(allowAutoStart: () => true);

    for (final raw in queries) {
      final query = ResponsaQuery.parse(raw);
      if (query == null) {
        print('"$raw": no Hebrew words');
        continue;
      }
      final watch = Stopwatch()..start();
      final report = await controller.searchText(query.text);
      final outcome = report.outcome;
      print(
        '"${query.text}" ${watch.elapsedMilliseconds}ms: '
        '${report.ok ? outcome!.state.name : 'FAILED ${report.failure?.name}'}'
        '${outcome?.count == null ? '' : ' count=${outcome!.count}'}'
        '${outcome?.message == null ? '' : ' message="${outcome!.message}"'}'
        '${report.message == null ? '' : ' error="${report.message}"'}'
        ' front=${outcome?.broughtToFront} window=${outcome?.window}',
      );
      // בר אילן שומר את תשובתו על המסך; ההמתנה נותנת לבודק לראות אותה.
      await Future<void>.delayed(const Duration(seconds: 3));
    }
  }, timeout: const Timeout(Duration(minutes: 10)));
}
