// כלי פיתוח: חיפוש ישיר בקטלוג שבמחשב, בלי השירות ובלי אוצריא. שימושי
// לבדיקת דירוג החיפוש מול הקטלוג האמיתי.
//
//   dart run tool/search.dart "שו""ת רשב""א" [--catalog=<path>] [--limit=10]
import 'dart:io';

import 'package:responsa_helper/src/server/catalog_store.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';

Future<void> main(List<String> arguments) async {
  final query = arguments.where((a) => !a.startsWith('--')).join(' ');
  String option(String name, String fallback) => arguments
      .firstWhere(
        (a) => a.startsWith('--$name='),
        orElse: () => '--$name=$fallback',
      )
      .substring(name.length + 3);
  final catalog = option('catalog', HelperPaths.resolve().catalog);
  final limit = int.parse(option('limit', '10'));
  if (query.isEmpty) {
    stderr.writeln(
      'שימוש: dart run tool/search.dart <שאילתה> [--catalog=] [--limit=]',
    );
    exit(2);
  }
  final index = await CatalogStore(catalog).index();
  if (index == null) {
    stderr.writeln('אין קטלוג ב-$catalog');
    exit(1);
  }
  final hits = index.search(query);
  stdout.writeln('${hits.length} תוצאות ל-"$query":');
  for (final book in hits.take(limit)) {
    stdout.writeln(
      '  ${book.title}  |  ${book.author ?? ''}  |  ${book.contextPath}',
    );
  }
}
