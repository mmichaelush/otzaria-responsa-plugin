@TestOn('windows')
library;

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// כמה איזולטים שכותבים יחד (השרת, פתיחה, בנייה) לא מאבדים שורות.
void main() {
  test('כתיבה מקבילה מאיזולטים שומרת כל שורה', () async {
    final dir = Directory.systemTemp.createTempSync('responsa_log');
    final log = p.join(dir.path, 'helper.log');
    final result = await Process.run(
      Platform.resolvedExecutable,
      ['test/support/log_stress.dart', '4', '1500'],
      environment: {'OTZARIA_RESPONSA_LOG': log},
    );
    expect(result.exitCode, 0, reason: '${result.stderr}');
    final lines = File(
      log,
    ).readAsLinesSync().where((line) => line.contains(' isolate ')).toList();
    expect(lines, hasLength(6000));
    expect(
      lines.every((line) => RegExp(r'isolate \d line \d+$').hasMatch(line)),
      isTrue,
    );
    dir.deleteSync(recursive: true);
  }, timeout: const Timeout(Duration(minutes: 2)));
}
