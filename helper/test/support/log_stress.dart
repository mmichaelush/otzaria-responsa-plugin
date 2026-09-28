import 'dart:isolate';

import 'package:responsa_helper/src/log.dart';

/// מריצים כתהליך נפרד עם OTZARIA_RESPONSA_LOG: כמה איזולטים כותבים יחד.
Future<void> main(List<String> arguments) async {
  final isolates = int.parse(arguments[0]);
  final lines = int.parse(arguments[1]);
  await Future.wait([
    for (var i = 0; i < isolates; i++)
      Isolate.run(() {
        for (var n = 0; n < lines; n++) {
          logLine('isolate $i line $n');
        }
      }),
  ]);
}
