// כלי מחקר ידני: האם הסריקה המקוצרת (`ResponsaCatalogBuilder.mayContainBooks`)
// מניבה את אותו קטלוג כמו סריקה מלאה. עובד על דאמפ מלא של live_dump_tree_test,
// בלי להריץ את בר אילן. להריץ על כל מהדורה חדשה, לפני שמסתמכים על הקיצור.
// RESPONSA_DUMPS="<cd25.tsv>;<cd29.tsv>" dart test --run-skipped test/live_prune_check_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'dart:io';

import 'package:responsa_helper/src/native/responsa_catalog_builder.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:test/test.dart';

List<ResponsaTreeNode> _load(String source) => [
  for (final line in File(source).readAsLinesSync().skip(1))
    if (line.split('\t') case [
      final level,
      final param,
      final children,
      ...final name,
    ])
      ResponsaTreeNode(
        level: int.parse(level),
        param: int.parse(param),
        childCount: int.parse(children),
        name: name.join('\t'),
        path: '',
      ),
];

/// מה שהסריקה רואה: צומת שאין נכנסים אליו נרשם, צאצאיו לא.
List<ResponsaTreeNode> _scanned(List<ResponsaTreeNode> nodes) {
  final out = <ResponsaTreeNode>[];
  int? skipBelow;
  for (final node in nodes) {
    if (skipBelow != null) {
      if (node.level > skipBelow) continue;
      skipBelow = null;
    }
    out.add(node);
    if (node.childCount > 0 &&
        !ResponsaCatalogBuilder.mayContainBooks(node.param)) {
      skipBelow = node.level;
    }
  }
  return out;
}

String _describe(ResponsaBookRow row) =>
    '${row.chain.map((c) => '${c.level}:${c.param}:${c.name}').join(' > ')}'
    ' | ${row.anchor} | ${row.nestedInBook}';

void main() {
  final dumps = (Platform.environment['RESPONSA_DUMPS'] ?? '')
      .split(';')
      .where((path) => path.isNotEmpty);
  for (final source in dumps) {
    test(source, () {
      final all = _load(source);
      final scanned = _scanned(all);
      final full = ResponsaCatalogBuilder.classify(all);
      final quick = ResponsaCatalogBuilder.classify(scanned);
      print(
        'nodes ${all.length} -> ${scanned.length} '
        '(${(100 * scanned.length / all.length).toStringAsFixed(1)}%), '
        'books ${full.length} vs ${quick.length}',
      );
      expect(quick.map(_describe).toList(), full.map(_describe).toList());
      expect(
        ResponsaCatalogBuilder.buildOpenRefs(quick),
        ResponsaCatalogBuilder.buildOpenRefs(full),
      );
    }, timeout: const Timeout(Duration(minutes: 10)));
  }
}
