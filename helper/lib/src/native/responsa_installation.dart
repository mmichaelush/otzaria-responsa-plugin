import 'dart:convert';
import 'dart:io';

import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';
import 'package:responsa_helper/src/native/responsa_instance.dart';
import 'package:path/path.dart' as path;

/// ההתקנה שיש לעבוד מולה, יחד עם כל מופעיה החיים — כולל חונים.
typedef ResponsaSelection = ({
  ResponsaInstallation installation,
  List<ResponsaInstance> instances,
});

/// התקנה אחת של פרויקט השו"ת.
class ResponsaInstallation {
  final int? version;
  final String installPath;
  final String displayName;

  /// `registry` / `filesystem` / `runningProcess` — מאיפה היא נמצאה.
  final String source;

  const ResponsaInstallation({
    required this.version,
    required this.installPath,
    required this.displayName,
    required this.source,
  });

  String get executable =>
      path.join(installPath, ResponsaInstallationDiscovery.executableName);

  bool get exists => File(executable).existsSync();

  /// לפי שרשרת הפתרון של התוכנה (`Sh_hdisk` + `db\`). בהתקנה חלקית הארכיון על
  /// התקן נשלף שאות הכונן שלו משתנה, ו-`null` (לא מחובר) הוא מצב חוקי.
  String? get archivePath {
    for (final candidate in _archiveCandidates()) {
      if (File(candidate).existsSync()) return candidate;
    }
    return null;
  }

  Iterable<String> _archiveCandidates() sync* {
    final settings = iniSettings;
    if (settings['sh_hdisk'] case final value?) {
      yield path.join(value, 'db', 'FILE00');
    }
    yield path.join(installPath, 'DB', 'FILE00');
    if (dataLocation case final data?) yield path.join(data, 'DB', 'FILE00');
    if (settings['sh_cdrom'] case final value?) {
      yield path.join(value, 'db', 'FILE00');
      // ההתקן עצמו (דיסק-און-קי, או עותק שלו): `FILE00` בשורש, ליד
      // `INSTALL\` (docs/56 §23; ב-CD25 של משתמש 29C, 15.10.2026).
      yield path.join(value, 'FILE00');
    }
    final drives = ResponsaInstallationDiscovery.drives();
    for (final drive in drives) {
      yield path.join(drive, 'db', 'FILE00');
    }
    // 32C: האות של ההתקן נשלף (דיסק וירטואלי `F:`), וב-ini אין אותה — רק
    // התווית (`RESPONSAV32`) מזהה שזה ההתקן של המהדורה הזאת ולא של אחרת.
    for (final drive in drives) {
      if (_isMediaOfThisEdition(
        ResponsaInstallationDiscovery.volumeLabel(drive),
      )) {
        yield path.join(drive, 'FILE00');
      }
    }
    // מהדורה שקראה למפתחות אחרת (לא `Sh_hdisk` ולא `Sh_cdrom`): כל ערך ב-ini
    // שהוא נתיב. הארכיון נבחר בפועל רק אם הקובץ קיים, והאחרונים בתור כדי
    // שהמפתחות שנמדדו יקדימו.
    for (final value in settings.values) {
      if (!_looksLikePath(value)) continue;
      yield path.join(value, 'db', 'FILE00');
      yield path.join(value, 'FILE00');
    }
  }

  static bool _looksLikePath(String value) =>
      value.length >= 3 &&
      (RegExp(r'^[A-Za-z]:[\\/]').hasMatch(value) || value.startsWith(r'\\'));

  /// [label] הוא של התקן המהדורה: התווית מה-ini, ובלעדיה `RESPONSAV<גרסה>`
  /// (המספר הוא של ההתקנה, לא קבוע: 25, 28, 33...). כשגם הגרסה אינה ידועה,
  /// כל תווית שמתחילה ב-`RESPONSA`.
  bool _isMediaOfThisEdition(String? label) {
    if (label == null || label.isEmpty) return false;
    final upper = label.toUpperCase();
    final wanted = iniSettings['vollabel'];
    if (wanted != null && wanted.isNotEmpty) {
      return upper == wanted.toUpperCase();
    }
    final edition = version;
    if (edition == null) return upper.startsWith('RESPONSA');
    return upper == 'RESPONSAV$edition';
  }

  /// תיקיית נתוני המשתמש מ-`Responsa.env`; `null` כשהקובץ חסר - מצב חוקי.
  String? get dataLocation {
    for (final line in _readLines(path.join(installPath, 'Responsa.env'))) {
      final trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith('datalocation')) continue;
      final separator = trimmed.indexOf('=');
      if (separator < 0) continue;
      final value = trimmed.substring(separator + 1).trim();
      if (value.isNotEmpty) return value;
    }
    return null;
  }

  /// `Responsa.ini` ב-CP1255, ו-`readAsLinesSync` היה זורק ומפיל את כל הקובץ.
  /// `latin1` אחרון כי אינו זורק; ערך מעוות ייפסל ממילא בבדיקת קיום.
  static List<String> _readLines(String filePath) {
    final file = File(filePath);
    if (!file.existsSync()) return const [];
    late final List<int> bytes;
    try {
      bytes = file.readAsBytesSync();
    } catch (e) {
      logLine('ResponsaInstallation: cannot read $filePath: $e');
      return const [];
    }
    final wide = _decodeUtf16(bytes);
    if (wide != null) return const LineSplitter().convert(wide);
    for (final codec in <Encoding>[utf8, systemEncoding, latin1]) {
      try {
        return const LineSplitter().convert(codec.decode(bytes));
      } catch (_) {
        continue;
      }
    }
    return const [];
  }

  /// `Responsa.ini` של 32C הוא UTF-16 (42KB, "0 סעיפים" בקריאה כ-CP1255):
  /// בלעדי הפענוח לא נקראים `Sh_cdrom` ותווית ההתקן, וההתקנה נשארת בלי
  /// ארכיון. עם BOM, או בלעדיו כשכל בית שני אפס ברוב הקובץ.
  static String? _decodeUtf16(List<int> bytes) {
    if (bytes.length < 4) return null;
    final bigEndian = bytes[0] == 0xFE && bytes[1] == 0xFF;
    final littleEndian = bytes[0] == 0xFF && bytes[1] == 0xFE;
    var evenZeros = 0;
    var oddZeros = 0;
    final sample = bytes.length < 400 ? bytes.length : 400;
    for (var i = 0; i < sample; i++) {
      if (bytes[i] != 0) continue;
      if (i.isEven) {
        evenZeros++;
      } else {
        oddZeros++;
      }
    }
    final quarter = sample ~/ 4;
    final asLittle = littleEndian || (!bigEndian && oddZeros > quarter);
    final asBig = bigEndian || (!littleEndian && evenZeros > quarter);
    if (!asLittle && !asBig) return null;
    final start = bigEndian || littleEndian ? 2 : 0;
    final units = <int>[
      for (var i = start; i + 1 < bytes.length; i += 2)
        asLittle
            ? bytes[i] | (bytes[i + 1] << 8)
            : (bytes[i] << 8) | bytes[i + 1],
    ];
    return String.fromCharCodes(units);
  }

  /// `[Environment]` של `Responsa.ini`, במפתחות קטנים. הקובץ יושב באתר
  /// הנתונים ולא ליד קובץ ההרצה; מפה ריקה כשהוא חסר.
  Map<String, String> get iniSettings {
    final data = dataLocation;
    if (data == null) return const {};
    final values = <String, String>{};
    var inEnvironment = false;
    for (final line in _readLines(path.join(data, 'Responsa.ini'))) {
      final trimmed = line.trim();
      if (trimmed.startsWith('[')) {
        inEnvironment = trimmed.toLowerCase() == '[environment]';
        continue;
      }
      if (!inEnvironment) continue;
      final separator = trimmed.indexOf('=');
      if (separator <= 0) continue;
      final value = trimmed.substring(separator + 1).trim();
      if (value.isEmpty) continue;
      values[trimmed.substring(0, separator).trim().toLowerCase()] = value;
    }
    return values;
  }

  /// תווית ההתקן הנשלף שהתוכנה מחפשת (`RESPONSAV25`), אם היא רשומה.
  String? get volumeLabel => iniSettings['vollabel'];

  Map<String, Object?> toJson() => {
    'version': version,
    'installPath': installPath,
    'displayName': displayName,
    'source': source,
    'exists': exists,
  };
}

/// טביעת אצבע של התקנה — מה שקושר קטלוג שנבנה להתקנה שממנה נבנה.
class ResponsaFingerprint {
  final int? version;
  final String installPath;
  final String? exeVersion;
  final String? exeSha256;
  final int? file00Size;
  final int? file00Mtime;

  const ResponsaFingerprint({
    required this.version,
    required this.installPath,
    this.exeVersion,
    this.exeSha256,
    this.file00Size,
    this.file00Mtime,
  });

  Map<String, String> toMeta() => {
    if (version case final value?) 'responsa_version': '$value',
    'install_path': installPath,
    'exe_version': ?exeVersion,
    'exe_sha256': ?exeSha256,
    if (file00Size case final value?) 'file00_size': '$value',
    if (file00Mtime case final value?) 'file00_mtime': '$value',
  };

  static ResponsaFingerprint? fromMeta(Map<String, String> meta) {
    final installPath = meta['install_path'];
    if (installPath == null || installPath.isEmpty) return null;
    return ResponsaFingerprint(
      version: int.tryParse(meta['responsa_version'] ?? ''),
      installPath: installPath,
      exeVersion: meta['exe_version'],
      exeSha256: meta['exe_sha256'],
      file00Size: int.tryParse(meta['file00_size'] ?? ''),
      file00Mtime: int.tryParse(meta['file00_mtime'] ?? ''),
    );
  }

  /// שדה שחסר באחד הצדדים אינו מכשיל, אחרת קטלוג ישן נפסל בגלל שדה חדש.
  bool matches(ResponsaFingerprint? other) {
    if (other == null) return false;
    if (_conflicts(version, other.version)) return false;
    if (_conflicts(exeVersion, other.exeVersion)) return false;
    if (_conflicts(exeSha256, other.exeSha256)) return false;
    if (_conflicts(file00Size, other.file00Size)) return false;
    if (_conflicts(file00Mtime, other.file00Mtime)) return false;
    final mine = installPath.toLowerCase().replaceAll(RegExp(r'[\\/]+$'), '');
    final theirs = other.installPath.toLowerCase().replaceAll(
      RegExp(r'[\\/]+$'),
      '',
    );
    return mine == theirs;
  }

  static bool _conflicts(Object? a, Object? b) =>
      a != null && b != null && a != b;
}
