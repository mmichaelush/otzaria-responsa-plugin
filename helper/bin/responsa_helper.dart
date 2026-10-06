import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:responsa_helper/src/server/http_api.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';

/// קודי יציאה. המתקין ובדיקות ההפעלה נשענים עליהם.
abstract final class ExitCodes {
  static const int ok = 0;
  static const int usage = 2;

  /// מופע של השירות, של אותו משתמש, כבר רץ. אין מה לעשות.
  static const int alreadyRunning = 3;

  /// כל הפורטים בטווח תפוסים בידי תוכנות אחרות או משתמשים אחרים.
  static const int portTaken = 4;
}

/// הפורט הראשון בטווח. התוסף סורק את אותו טווח (responsa-domain.js).
const int firstPort = 39700;

/// משתמש Windows נוסף שמחובר למחשב מקבל את הפורט הפנוי הבא: 127.0.0.1
/// משותף לכל המשתמשים, והשירות של כל אחד מסרב לבקשות של האחרים.
const int portCount = 10;

const String _usage = '''
responsa_helper — שירות מקומי שמחבר את אוצריא לפרויקט השו"ת (בר אילן).

  --port=<n>        פורט קבוע, בלי חיפוש בטווח. לפיתוח בלבד.
  --data-dir=<dir>  תיקיית נתונים (ברירת מחדל %LOCALAPPDATA%\\OtzariaResponsa).
  --version         מדפיס גרסה ויוצא.
  --help            העזרה הזו.

היומן: %LOCALAPPDATA%\\OtzariaResponsa\\helper.log, או OTZARIA_RESPONSA_LOG.''';

/// שירות רקע אסור שימות בשקט: כל שגיאה שלא נתפסה נרשמת ביומן.
Future<void> main(List<String> arguments) => runZonedGuarded(
  () => _run(arguments),
  (error, stackTrace) => logLine('uncaught: $error\n$stackTrace'),
)!;

Future<void> _run(List<String> arguments) async {
  final options = _parse(arguments);
  // השירות הוא תוכנת GUI בלי קונסול, ולכן גם העזרה והגרסה נכתבות ליומן.
  if (options == null || options.containsKey('help')) {
    _say(_usage);
    exit(options == null ? ExitCodes.usage : ExitCodes.ok);
  }
  if (options.containsKey('version')) {
    _say(HelperService.serverVersion);
    return;
  }

  final List<int> ports;
  if (options['port'] case final value?) {
    final port = int.tryParse(value);
    if (port == null || port < 1 || port > 65535) {
      _say('פורט לא תקין: $value');
      exit(ExitCodes.usage);
    }
    ports = [port];
  } else {
    ports = [for (var i = 0; i < portCount; i++) firstPort + i];
  }

  final paths = HelperPaths.resolve(override: options['data-dir'])
    ..ensureExists();

  final server = await _bindFirstFree(ports);
  // אחרי ה-bind ולא לפניו: מופע שני שיוצא מיד לא יסובב את היומן של הפעיל.
  rotateLog();

  final port = server.port;
  final service = HelperService(backend: NativeResponsaBackend(), paths: paths);
  final api = HttpApi(service, port: port);
  logLine(
    'responsa_helper ${HelperService.serverVersion} listening on '
    '127.0.0.1:$port, data ${paths.dataDir}, pid $pid, '
    '${Platform.operatingSystemVersion}',
  );
  // היומן מסובב גם בזמן ריצה: שירות שרץ שבועות, ותוסף שבודק כל 10 שניות
  // מול שירות שנכשל, היו מגדילים אותו בלי סוף.
  Timer.periodic(const Duration(minutes: 30), (_) => rotateLog());

  unawaited(
    ProcessSignal.sigint.watch().first.then((_) async {
      logLine('shutting down');
      await server.close(force: true);
      exit(ExitCodes.ok);
    }),
  );

  await for (final request in server) {
    unawaited(api.handle(request));
  }
}

/// ההאזנה לפורט היא גם נעילת המופע היחיד. פורט תפוס בידי השירות של אותו
/// משתמש = כבר רצים; בידי משתמש אחר או תוכנה אחרת = מנסים את הבא.
Future<HttpServer> _bindFirstFree(List<int> ports) async {
  for (final port in ports) {
    try {
      return await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    } on SocketException catch (error) {
      switch (await _probe(port)) {
        case _Occupant.ourSession:
          logLine('already running on port $port');
          exit(ExitCodes.alreadyRunning);
        case _Occupant.otherSession:
          logLine('port $port belongs to another Windows user; trying next');
        case _Occupant.foreign:
          logLine(
            'port $port is taken by another program '
            '(${error.osError?.errorCode} ${error.osError?.message}); '
            'trying next',
          );
      }
    }
  }
  logLine('no free port in ${ports.first}-${ports.last}');
  exit(ExitCodes.portTaken);
}

enum _Occupant { ourSession, otherSession, foreign }

Future<_Occupant> _probe(int port) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
  try {
    final request = await client.get('127.0.0.1', port, '/health');
    final response = await request.close().timeout(const Duration(seconds: 3));
    final json = jsonDecode(await response.transform(utf8.decoder).join());
    if (json is! Map) return _Occupant.foreign;
    final error = json['error'];
    if (error is Map && error['code'] == 'otherSession') {
      return _Occupant.otherSession;
    }
    return json['service'] == HelperService.serviceId
        ? _Occupant.ourSession
        : _Occupant.foreign;
  } catch (_) {
    return _Occupant.foreign;
  } finally {
    client.close(force: true);
  }
}

void _say(String text) {
  logLine(text);
  if (hasStdout) stdout.writeln(text);
}

/// `null` = ארגומנטים לא תקינים.
Map<String, String?>? _parse(List<String> arguments) {
  final options = <String, String?>{};
  for (final argument in arguments) {
    if (!argument.startsWith('--')) return null;
    final body = argument.substring(2);
    final equals = body.indexOf('=');
    final name = equals < 0 ? body : body.substring(0, equals);
    if (!const {'port', 'data-dir', 'version', 'help'}.contains(name)) {
      return null;
    }
    options[name] = equals < 0 ? null : body.substring(equals + 1);
  }
  return options;
}
