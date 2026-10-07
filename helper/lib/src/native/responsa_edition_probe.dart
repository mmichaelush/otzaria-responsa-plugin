import 'dart:io';

import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';

/// מה שונה במהדורה של בר אילן לעומת CD25, שבו נמדדו מזהי הפקדים. חלונות
/// החיפוש נבדקים בכל חיפוש, ושורה לכל מהדורה נשמרת בקובץ שליד היומן
/// ([fileName]) ונכנסת לפרטי האבחון. ביומן נכתב רק שינוי, כדי שמהדורה חדשה
/// תיראה בדיווח הראשון שלה.
class ResponsaEditionProbe {
  ResponsaEditionProbe._();

  static const String fileName = 'bar-ilan-editions.txt';

  /// הפקדים שהשירות נשען עליהם בכל סוג חיפוש, כפי שנמדדו ב-CD25 (7.10.2026).
  /// כפתורי המעבר: 1189, 1207, 1208, 1209; 1210 = "ניהול המאגרים".
  static const Map<String, List<int>> cd25 = {
    'חיפוש מתקדם': [
      1233,
      1,
      1065,
      1173,
      1024,
      1025,
      1189,
      1207,
      1208,
      1209,
      1210,
    ],
    'חיפוש קל': [1233, 1, 1163, 1024, 1189, 1207, 1208, 1209, 1210],
    'חיפוש טבלאי': [1, 1065, 1173, 1024, 1025, 1189, 1207, 1208, 1209, 1210],
    'חיפוש בניסוח חופשי': [1233, 1, 1024, 1189, 1207, 1208, 1209, 1210],
  };

  /// הכיתוב של תיבות הסימון שהשירות לוחץ עליהן, ב-CD25.
  static const Map<int, String> cd25Labels = {
    1024: 'חיפוש בכל המאגרים',
    1025: 'כולל ראשי תיבות',
    1173: 'הצג חלון ניהול הצורות',
  };

  /// שורה אחת: מה חסר בכל חלון שנמצא, וכיתוב שהשתנה. [windows] = כותרת ←
  /// מזהי הפקדים שבו; [labels] = מזהה ← כיתוב, מכל החלונות.
  @visibleForTesting
  static String describe(
    Map<String, Set<int>> windows,
    Map<int, String> labels,
  ) {
    final parts = <String>[];
    for (final MapEntry(key: kind, value: expected) in cd25.entries) {
      final title = windows.keys
          .where((t) => _plain(t) == _plain(kind))
          .firstOrNull;
      if (title == null) {
        parts.add('"$kind" not opened yet');
        continue;
      }
      final missing = expected.where((id) => !windows[title]!.contains(id));
      parts.add(
        missing.isEmpty
            ? '"$kind" as CD25'
            : '"$kind" missing ${missing.join(' ')}',
      );
    }
    final unknown = windows.keys.where(
      (t) => !cd25.keys.any((kind) => _plain(kind) == _plain(t)),
    );
    for (final title in unknown) {
      parts.add('unknown window "$title"');
    }
    for (final MapEntry(key: id, value: label) in cd25Labels.entries) {
      final actual = labels[id];
      if (actual != null && _plain(actual) != _plain(label)) {
        parts.add('$id is "${_plain(actual)}"');
      }
    }
    return parts.join('; ');
  }

  /// בלי `&` (מקש קיצור) ובלי רווחים כפולים.
  static String _plain(String text) =>
      text.replaceAll('&', '').replaceAll(RegExp(r'\s+'), ' ').trim();

  /// חלונות החיפוש של התהליך [pid] — גם המוסתרים, שבר אילן שומר אחרי
  /// הפתיחה הראשונה. [edition] מכותרת החלון הראשי.
  static void probe(int pid, String edition) {
    try {
      final windows = <String, Set<int>>{};
      final labels = <int, String>{};
      for (final hwnd in ResponsaWin32.topWindows(pid)) {
        if (ResponsaWin32.className(hwnd) != '#32770') continue;
        final children = ResponsaWin32.children(hwnd);
        final ids = {for (final c in children) ResponsaWin32.controlId(c)};
        // חלון חיפוש = יש בו את כפתורי המעבר.
        if (!ids.contains(1207) || !ids.contains(1209)) continue;
        windows[_plain(ResponsaWin32.windowText(hwnd))] = ids;
        for (final child in children) {
          final id = ResponsaWin32.controlId(child);
          if (cd25Labels.containsKey(id)) {
            labels[id] ??= ResponsaWin32.windowText(child);
          }
        }
      }
      record(edition, describe(windows, labels));
    } catch (error) {
      logLine('ResponsaEditionProbe: $error');
    }
  }

  /// הקובץ שליד היומן, או `null` בלי יומן (בבדיקות).
  static File? get file {
    final log = logFilePath;
    return log == null ? null : File(p.join(p.dirname(log), fileName));
  }

  /// שומר את השורה של [edition], וכותב ליומן רק כשהיא השתנתה.
  @visibleForTesting
  static void record(String edition, String line, {File? into}) {
    final target = into ?? file;
    final lines = <String, String>{};
    if (target != null && target.existsSync()) {
      for (final row in target.readAsLinesSync()) {
        final split = row.indexOf(': ');
        if (split > 0) {
          lines[row.substring(0, split)] = row.substring(split + 2);
        }
      }
    }
    if (lines[edition] == line) return;
    lines[edition] = line;
    logLine('ResponsaEditionProbe: $edition: $line');
    if (target == null) return;
    try {
      target.writeAsStringSync(
        [for (final e in lines.entries) '${e.key}: ${e.value}'].join('\n'),
      );
    } catch (error) {
      logLine('ResponsaEditionProbe: cannot write ${target.path}: $error');
    }
  }

  /// התוכן לפרטי האבחון, או `null`.
  static String? summary() {
    final target = file;
    if (target == null || !target.existsSync()) return null;
    try {
      final text = target.readAsStringSync().trim();
      return text.isEmpty ? null : text;
    } catch (_) {
      return null;
    }
  }
}
