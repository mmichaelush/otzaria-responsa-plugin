import 'dart:typed_data';

import 'package:responsa_helper/src/server/startup_check.dart';
import 'package:test/test.dart';

void main() {
  test(
    'StartupApproved: בית ראשון זוגי מאושר, אי-זוגי מושבת, ובלי ערך מאושר',
    () {
      expect(StartupCheck.approvedEnabled(null), isTrue);
      expect(StartupCheck.approvedEnabled(Uint8List(0)), isTrue);
      expect(
        StartupCheck.approvedEnabled(Uint8List.fromList([2, 0, 0, 0])),
        isTrue,
      );
      expect(
        StartupCheck.approvedEnabled(Uint8List.fromList([6, 0, 0, 0])),
        isTrue,
      );
      expect(
        StartupCheck.approvedEnabled(Uint8List.fromList([3, 0, 0, 0])),
        isFalse,
      );
      expect(
        StartupCheck.approvedEnabled(Uint8List.fromList([7, 0, 0, 0])),
        isFalse,
      );
    },
  );

  test('describe לא זורקת ומציינת איך השירות הופעל', () {
    final before = StartupCheck.startedAtLogon;
    addTearDown(() => StartupCheck.startedAtLogon = before);
    StartupCheck.startedAtLogon = true;
    expect(StartupCheck.describe(), startsWith('startup:'));
    expect(StartupCheck.describe(), contains('started by the Run entry'));
    StartupCheck.startedAtLogon = false;
    expect(StartupCheck.describe(), contains('NOT started by the Run entry'));
  });
}
