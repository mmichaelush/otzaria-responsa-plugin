import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';

import 'package:meta/meta.dart';
import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';

/// `GET /diagnostics`: מה שצריך כדי למצוא את שורש התקלה ממחשב שאין לנו גישה
/// אליו, בכמה שורות. נבנה רק כשמבקשים (העתקת פרטים, דיווח), ולכן אינו מציף
/// את היומן בכל בדיקה תקופתית. באנגלית: נתיבים וקודי שגיאה נקראים בה טוב יותר
/// מבתוך טקסט עברי.
class HelperDiagnostics {
  HelperDiagnostics._();

  /// מספר הרשומות מסוף היומן, ותקרת התווים שלהן.
  static const int tailEntries = 80;
  static const int tailChars = 6000;

  /// כמה מסוף קובץ היומן נקרא: מספיק ל-[tailEntries] גם עם עקבות מחסנית.
  static const int _readBytes = 128 * 1024;

  /// שורות של עקבות מחסנית שנשמרות לכל רשומה.
  static const int _stackLines = 6;

  /// גילוי ההתקנות סורק כל כונן ושואל את חלונות בר אילן, שעשוי להיות תקוע.
  /// אחרי החסם הסיכום יוצא בלעדיו (האיזולט ממשיך עד שיסיים, ונזרק).
  static const Duration _installationsTimeout = Duration(seconds: 8);

  static Future<Map<String, Object?>> collect({
    required String serverVersion,
    required DateTime startedAt,
    required int? sessionId,
    required Future<ResponsaCatalogInfo> Function() catalog,
    required String? lastBuild,
    required String? runningBuild,
    File? skipFile,
  }) async {
    // היומן קודם ובלי תלות בשאר: הוא מה שמסביר תקלה שעוד לא ראינו, וכשל
    // בחלק אחר אסור שיאבד אותו.
    final logTail = _logTail();
    // גילוי ההתקנות והמופעים חוסם (FFI והודעות לחלונות), ולכן באיזולט.
    final installations = await _part(
      'installations',
      () => Isolate.run(_installations).timeout(_installationsTimeout),
    );
    final catalogLines = await _part(
      'book list',
      () async => [_catalogLine(await catalog())],
    );
    final uptime = DateTime.now().difference(startedAt);
    final minutes = (uptime.inMinutes % 60).toString().padLeft(2, '0');
    final lines = [
      // ב-Windows בעברית הגרסה עטופה בסימני כיווניות (U+200F).
      'service $serverVersion, '
          '${Platform.operatingSystemVersion.replaceAll(RegExp('[\u200e\u200f"]'), '')}, '
          'up ${uptime.inHours}h${minutes}m'
          '${sessionId == null ? '' : ', session $sessionId'}',
      if (logFilePath != null)
        r'log: %LOCALAPPDATA%\OtzariaResponsa\helper.log',
      ...installations,
      ...catalogLines,
      if (runningBuild != null) 'book list: reading now, $runningBuild',
      'last book list read: ${lastBuild ?? 'none since the service started'}',
      if (skipFile != null)
        if (ResponsaBuildSkipList.describe(skipFile) case final skips?)
          'books that crashed Bar-Ilan: $skips',
    ];
    return {'summary': lines.join('\n'), 'logTail': logTail};
  }

  /// חלק של הסיכום. כשל או חסם זמן — שורה שאומרת זאת, ולא 500 לכל הבקשה.
  static Future<List<String>> _part(
    String what,
    Future<List<String>> Function() read,
  ) async {
    try {
      return await read();
    } on TimeoutException {
      return ['$what: no answer within ${_installationsTimeout.inSeconds}s'];
    } catch (error) {
      logLine('HelperDiagnostics: $what failed: $error');
      return ['$what: failed: $error'];
    }
  }

  static List<String> _installations() {
    final lines = <String>[];
    final found = ResponsaInstallationDiscovery.discover();
    if (found.isEmpty) lines.add('installations: none found');
    for (final installation in found) {
      final instances = [
        for (final instance in ResponsaInstallationDiscovery.instancesOf(
          installation.installPath,
        ))
          instance.usable
              ? '${instance.pid} "${instance.title}" '
                    '(${instance.openWindows} book windows)'
              : '${instance.pid} (parked)',
      ];
      lines.add(
        'installation: ${installation.installPath}, '
        'edition ${installation.version ?? '?'}, '
        'from ${installation.source}, '
        'exe ${installation.exists ? 'ok' : 'MISSING'}, '
        'archive ${installation.archivePath == null ? 'NOT FOUND' : 'ok'}, '
        'running: ${instances.isEmpty ? 'no' : instances.join(', ')}',
      );
      if (installation.archivePath == null && installation.exists) {
        lines.add('  no archive: ${archiveHints(installation)}');
      }
    }
    final unavailable = ResponsaInstallationDiscovery.unavailableDrives();
    if (unavailable.isNotEmpty) {
      lines.add('unavailable drives (skipped): ${unavailable.join(', ')}');
    }
    return lines;
  }

  /// קבצים גדולים מזה נרשמים בתיקיית ההתקנה: אחד מהם הוא כנראה הארכיון.
  static const int _largeFileBytes = 5 << 20;
  static const int _maxListedEntries = 40;

  /// בלי ארכיון אין טבלת מחברים (ב-CD30 ומעלה: "author for 0 books"). מה
  /// שהשירות בדק, ומה יש בתיקייה, כדי שדיווח אחד יראה איפה הארכיון שם.
  @visibleForTesting
  static String archiveHints(ResponsaInstallation installation) {
    final settings = installation.iniSettings;
    final parts = [
      'data ${installation.dataLocation ?? 'none'}',
      'sh_hdisk ${settings['sh_hdisk'] ?? 'none'}',
      'sh_cdrom ${settings['sh_cdrom'] ?? 'none'}',
    ];
    try {
      final entries = Directory(
        installation.installPath,
      ).listSync(followLinks: false)..sort((a, b) => a.path.compareTo(b.path));
      final listed = <String>[];
      for (final entry in entries) {
        final name = p.basename(entry.path);
        if (entry is Directory) {
          listed.add('$name/');
        } else if (entry is File) {
          final size = entry.lengthSync();
          if (size >= _largeFileBytes) listed.add('$name ${size >> 20}MB');
        }
      }
      final shown = listed.take(_maxListedEntries).join(', ');
      parts.add(
        'folder: $shown'
        '${listed.length > _maxListedEntries ? ', … (${listed.length})' : ''}',
      );
    } catch (error) {
      parts.add('folder: $error');
    }
    return parts.join('; ');
  }

  static String _catalogLine(ResponsaCatalogInfo info) {
    if (!info.exists) return 'book list: not read yet';
    return 'book list: ${info.bookCount} books, '
        'edition ${info.sourceVersion ?? '?'}, '
        'schema ${info.schemaVersion ?? '?'}'
        '${info.isOutdated ? ' (outdated)' : ''}, '
        '${info.nodeCount ?? '?'} rows, read ${info.builtAt ?? '?'}, '
        // מחבר חסר = חיפוש לפי מחבר לא ימצא את הספר. בלי ארכיון אין טבלה.
        'author for ${info.fingerprint['books_with_author'] ?? '?'} books '
        '(author table: ${info.fingerprint['author_table_entries'] ?? '?'})';
  }

  static String _logTail() {
    final path = logFilePath;
    if (path == null) return '';
    try {
      final current = _readEnd(File(path), _readBytes);
      // אחרי סיבוב היומן הקובץ הנוכחי קצר, והכשל האחרון בקובץ הקודם.
      final room = _readBytes - current.length;
      final previous = room > 4096 ? _readEnd(File('$path.1'), room) : '';
      return tail('$previous\n$current');
    } catch (error) {
      return 'log not readable: $error';
    }
  }

  /// עד [bytes] בתים מסוף [file], משורה שלמה. קובץ חסר — ''.
  static String _readEnd(File file, int bytes) {
    if (!file.existsSync()) return '';
    final handle = file.openSync();
    try {
      final length = handle.lengthSync();
      final start = length > bytes ? length - bytes : 0;
      handle.setPositionSync(start);
      final text = const Utf8Decoder(
        allowMalformed: true,
      ).convert(handle.readSync(length - start));
      // קריאה מאמצע הקובץ מתחילה באמצע שורה (ואולי באמצע תו).
      return start > 0 ? text.substring(text.indexOf('\n') + 1) : text;
    } finally {
      handle.closeSync();
    }
  }

  /// בקשות שהצליחו (`GET /health 200 3ms`) הן רעש: התוסף שואל כל כמה שניות.
  static final RegExp _routine = RegExp(r'^(GET|POST) /\S* 2\d\d \d+ms$');

  static final RegExp _timestamp = RegExp(r'^\d{4}-\d\d-\d\dT[\d:.]+ ');

  /// סוף היומן, לקריאה בדיווח:
  /// - רשומה מתחילה בחותמת זמן, ושורות ההמשך (עקבות מחסנית) שייכות לה, עד
  ///   [_stackLines];
  /// - בקשות שהצליחו מסוננות;
  /// - קבוצה של עד 4 רשומות שחוזרת ברצף (התוסף בודק שוב ושוב ונכשל באותו
  ///   מקום) נשארת פעם אחת, עם שורה שאומרת כמה פעמים חזרה ועד מתי.
  @visibleForTesting
  static String tail(String text) {
    final entries = <({String stamp, String body})>[];
    for (final line in const LineSplitter().convert(text)) {
      final trimmed = line.trimRight();
      if (trimmed.isEmpty) continue;
      final stamp = _timestamp.firstMatch(trimmed);
      if (stamp != null) {
        entries.add((
          stamp: stamp.group(0)!.trim(),
          body: trimmed.substring(stamp.end),
        ));
      } else if (entries.isNotEmpty &&
          '\n'.allMatches(entries.last.body).length < _stackLines) {
        final last = entries.removeLast();
        entries.add((stamp: last.stamp, body: '${last.body}\n  $trimmed'));
      }
    }
    final kept = [
      for (final entry in entries)
        if (!_routine.hasMatch(entry.body)) entry,
    ];

    final out = <String>[];
    // המפתחות של מה שנכתב מאז הסיכום האחרון: אחריו לא משווים לאותה קבוצה.
    final keys = <String>[];
    var i = 0;
    while (i < kept.length) {
      var period = 1;
      var repeats = 0;
      for (; period <= 4; period++) {
        repeats = _repeats(kept, i, keys, period);
        if (repeats > 0) break;
      }
      if (repeats > 0) {
        i += repeats * period;
        out.add(
          '  ... the $period entr${period == 1 ? 'y' : 'ies'} above repeated '
          '$repeats more time${repeats == 1 ? '' : 's'}, '
          'until ${_clock(kept[i - 1].stamp)}',
        );
        keys.clear();
        continue;
      }
      final entry = kept[i];
      out.add('${_clock(entry.stamp, withDate: true)} ${entry.body}');
      keys.add(_key(entry.body));
      i++;
    }

    final recent = out.length > tailEntries
        ? out.sublist(out.length - tailEntries)
        : out;
    var result = recent.join('\n');
    if (result.length > tailChars) {
      result = result.substring(result.length - tailChars);
      result = result.substring(result.indexOf('\n') + 1);
    }
    return result;
  }

  /// כמה פעמים [period] הרשומות האחרונות שנכתבו (ב-[keys]) חוזרות ברצף
  /// מ-[at].
  static int _repeats(
    List<({String stamp, String body})> entries,
    int at,
    List<String> keys,
    int period,
  ) {
    if (keys.length < period) return 0;
    var repeats = 0;
    var start = at;
    while (start + period <= entries.length) {
      for (var k = 0; k < period; k++) {
        if (_key(entries[start + k].body) != keys[keys.length - period + k]) {
          return repeats;
        }
      }
      repeats++;
      start += period;
    }
    return repeats;
  }

  /// `2026-10-06T00:18:26.123` → `2026-10-06 00:18:26`, או רק השעה.
  static String _clock(String stamp, {bool withDate = false}) {
    if (stamp.length < 19) return stamp;
    return withDate
        ? stamp.substring(0, 19).replaceFirst('T', ' ')
        : stamp.substring(11, 19);
  }

  /// בלי משכי זמן: `GET /status 500 152ms` ו-`… 149ms` הם אותה רשומה.
  static String _key(String body) => body.replaceAll(RegExp(r'\d+ms\b'), 'ms');
}
