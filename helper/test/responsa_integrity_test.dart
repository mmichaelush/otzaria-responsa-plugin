import 'dart:io';

import 'package:responsa_helper/src/native/responsa_integrity.dart';
import 'package:test/test.dart';

void main() {
  test('רמת השלמות של התהליך עצמו נקראת, ושווה בשתי הדרכים', () {
    final own = ResponsaIntegrity.own;
    expect(own, isNotNull);
    expect(own, anyOf(ResponsaIntegrity.medium, ResponsaIntegrity.high));
    expect(ResponsaIntegrity.ofProcess(pid), own);
    expect(ResponsaIntegrity.blocks(pid), isFalse);
  });

  test('תהליך שאינו קיים — לא ידוע, ולא חוסם', () {
    expect(ResponsaIntegrity.ofProcess(0x7FFFFFF0), isNull);
    expect(ResponsaIntegrity.blocks(0x7FFFFFF0), isFalse);
  });

  test('חוסם רק כשהיעד גבוה מהשירות', () {
    const medium = ResponsaIntegrity.medium;
    const high = ResponsaIntegrity.high;
    expect(ResponsaIntegrity.levelBlocks(medium, high), isTrue);
    expect(ResponsaIntegrity.levelBlocks(high, medium), isFalse);
    expect(ResponsaIntegrity.levelBlocks(medium, medium), isFalse);
    expect(ResponsaIntegrity.levelBlocks(null, high), isFalse);
    expect(ResponsaIntegrity.levelBlocks(medium, null), isFalse);
  });
}
