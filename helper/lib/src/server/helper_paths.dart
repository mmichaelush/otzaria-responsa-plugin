import 'dart:io';

import 'package:path/path.dart' as p;

/// מיקומי הנתונים של השירות. מחוץ לספריית אוצריא בכוונה: המתקין המלא של
/// אוצריא והעברת ספרייה מוחקים את מה שבתוכה, ובלי הקטלוג אובדים מזהי הספרים.
class HelperPaths {
  final String dataDir;

  const HelperPaths(this.dataDir);

  /// `%LOCALAPPDATA%\OtzariaResponsa`, או [override] לפיתוח ולבדיקות.
  factory HelperPaths.resolve({String? override}) {
    if (override != null && override.isNotEmpty) return HelperPaths(override);
    final base =
        Platform.environment['LOCALAPPDATA'] ??
        p.join(Platform.environment['USERPROFILE'] ?? '.', 'AppData', 'Local');
    return HelperPaths(p.join(base, 'OtzariaResponsa'));
  }

  String get catalog => p.join(dataDir, 'catalog.sqlite');

  String get iconCache => p.join(dataDir, 'responsa-icon.png');

  void ensureExists() => Directory(dataDir).createSync(recursive: true);
}
