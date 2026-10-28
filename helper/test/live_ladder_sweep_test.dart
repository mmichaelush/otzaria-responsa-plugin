// כלי מדידה ידני: לכל ספר בקטלוג, איזו חוליה בסולם ההפניות בר אילן מזהה. אינו
// פותח חלונות (מנתח בלבד), ולכן מהיר פי כמה מ-`live_open_sample_test` ואפשר
// להריץ אותו על מאות ספרים. כך נמצאים ספרים שאף חוליה בסולם שלהם אינה מזוהה,
// לפני שמשתמש מדווח עליהם.
// RESPONSA_DB=<catalog.db> [RESPONSA_N=300] [RESPONSA_SEED=7] [RESPONSA_PATTERN=<regex על הכותרת>] \
//   [RESPONSA_FROM=<אינדקס התחלה, כשרצים בקבוצות>] dart test --run-skipped test/live_ladder_sweep_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';
import 'dart:math';

import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:test/test.dart';

void main() {
  test('ladder sweep', () async {
    final path = Platform.environment['RESPONSA_DB']!;
    final count = int.parse(Platform.environment['RESPONSA_N'] ?? '300');
    final seed = int.parse(Platform.environment['RESPONSA_SEED'] ?? '7');
    final from = int.parse(Platform.environment['RESPONSA_FROM'] ?? '0');
    final pattern = Platform.environment['RESPONSA_PATTERN'];

    final db = sqlite3.open(path, mode: OpenMode.readOnly);
    final rows = db
        .select('SELECT title, open_ref, alt_refs FROM books ORDER BY book_pk')
        .map(
          (r) => (
            title: r['title'].toString(),
            refs: <String>[
              r['open_ref'].toString(),
              ...(r['alt_refs']?.toString() ?? '')
                  .split('\n')
                  .where((s) => s.trim().isNotEmpty),
            ],
          ),
        )
        .toList();
    final installPath = db
        .select("SELECT value FROM db_meta WHERE key='install_path'")
        .map((r) => r['value'].toString())
        .firstOrNull;
    db.close();

    final pool = pattern == null
        ? rows
        : rows.where((r) => RegExp(pattern).hasMatch(r.title)).toList();
    final picked = pattern == null
        ? (List.of(pool)..shuffle(Random(seed))).skip(from).take(count).toList()
        : pool.skip(from).take(count).toList();
    print('catalog: ${rows.length} books, sweeping ${picked.length}');

    final controller = ResponsaController(allowAutoStart: () => true);
    final byRung = <int, int>{};
    final failures = <String>[];
    final watch = Stopwatch()..start();
    for (final row in picked) {
      var found = -1;
      for (var i = 0; i < row.refs.length; i++) {
        final report = await controller.locate(
          row.refs[i],
          installPath: installPath,
          listOnly: true,
        );
        if (!report.ok || report.choices.isEmpty) continue;
        if (ResponsaAutomation.hasPlausibleResult(
          report.choices,
          row.refs[i],
          row.title,
        )) {
          found = i;
          break;
        }
      }
      byRung[found] = (byRung[found] ?? 0) + 1;
      if (found < 0) {
        failures.add('${row.title}  tried=${row.refs}');
        print('  FAIL ${row.title}');
      } else if (found > 0) {
        print('  rung $found: ${row.title}  [${row.refs[found]}]');
      }
    }
    print(
      '\n=== ${picked.length} books in ${watch.elapsed.inSeconds}s; '
      'by rung (-1 = none): ${Map.fromEntries(byRung.entries.toList()..sort((a, b) => a.key.compareTo(b.key)))}',
    );
    for (final failure in failures) {
      print('  - $failure');
    }
  }, timeout: const Timeout(Duration(hours: 6)));
}
