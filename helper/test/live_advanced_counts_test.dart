// כלי מדידה ידני: מריץ שאילתות בתחביר של "חיפוש מתקדם" בבר אילן החי, בכל
// המאגרים, ומדפיס את מספר התוצאות. כך נמדד מה בר אילן מקבל (למשל חלופות עם
// סימני צורה בתוכן: `(#נר/^נר)`) ומה הוא מחזיר: איחוד של שתי שאילתות אמור
// להיות לפחות הגדולה מהן, ולא יותר מסכומן.
// RESPONSA_QUERIES="#נר|^נר|(#נר/^נר)" dart test --run-skipped test/live_advanced_counts_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:test/test.dart';

void main() {
  test('advanced counts', () async {
    final queries =
        (Platform.environment['RESPONSA_QUERIES'] ?? '#נר|^נר|(#נר/^נר)')
            .split('|')
            .map((query) => query.trim())
            .where((query) => query.isNotEmpty);
    final controller = ResponsaController(allowAutoStart: () => true);

    for (final query in queries) {
      final watch = Stopwatch()..start();
      final report = await controller.searchText(
        query,
        setup: const ResponsaSearchSetup(advanced: true, allDatabases: true),
      );
      final outcome = report.outcome;
      print(
        '[$query] ${watch.elapsedMilliseconds}ms: '
        '${report.ok ? outcome!.state.name : 'FAILED ${report.failure?.name}'}'
        '${outcome?.count == null ? '' : ' count=${outcome!.count}'}'
        '${outcome?.message == null ? '' : ' message="${outcome!.message}"'}'
        '${report.message == null ? '' : ' error="${report.message}"'}',
      );
    }
  }, timeout: const Timeout(Duration(minutes: 30)));
}
