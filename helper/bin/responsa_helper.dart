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

  /// מופע אחר של השירות כבר מאזין לפורט. אין מה לעשות.
  static const int alreadyRunning = 3;

  /// תוכנה אחרת תופסת את הפורט.
  static const int portTaken = 4;
}

const int defaultPort = 39700;

const String _usage =
    '''
responsa_helper — שירות מקומי שמחבר את אוצריא לפרויקט השו"ת (בר אילן).

  --port=<n>        פורט (ברירת מחדל $defaultPort). לפיתוח בלבד.
  --data-dir=<dir>  תיקיית נתונים (ברירת מחדל %LOCALAPPDATA%\\OtzariaResponsa).
  --version         מדפיס גרסה ויוצא.
  --help            העזרה הזו.

היומן: %LOCALAPPDATA%\\OtzariaResponsa\\helper.log, או OTZARIA_RESPONSA_LOG.''';

Future<void> main(List<String> arguments) async {
  final options = _parse(arguments);
  if (options == null) {
    stderr.writeln(_usage);
    exit(ExitCodes.usage);
  }
  if (options.containsKey('help')) {
    stdout.writeln(_usage);
    return;
  }
  if (options.containsKey('version')) {
    stdout.writeln(HelperService.serverVersion);
    return;
  }

  final port = int.tryParse(options['port'] ?? '$defaultPort');
  if (port == null || port < 1 || port > 65535) {
    stderr.writeln('פורט לא תקין: ${options['port']}');
    exit(ExitCodes.usage);
  }

  rotateLog();
  final paths = HelperPaths.resolve(override: options['data-dir'])
    ..ensureExists();

  final HttpServer server;
  try {
    // ההאזנה לפורט היא גם נעילת המופע היחיד.
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
  } on SocketException catch (error) {
    final ours = await _isOurService(port);
    logLine(
      ours
          ? 'already running on port $port'
          : 'port $port is taken by another program: $error',
    );
    exit(ours ? ExitCodes.alreadyRunning : ExitCodes.portTaken);
  }

  final service = HelperService(backend: NativeResponsaBackend(), paths: paths);
  final api = HttpApi(service, port: port);
  logLine(
    'responsa_helper ${HelperService.serverVersion} listening on '
    '127.0.0.1:$port, data ${paths.dataDir}, pid $pid',
  );

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

Future<bool> _isOurService(int port) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 2);
  try {
    final request = await client.get('127.0.0.1', port, '/health');
    final response = await request.close().timeout(const Duration(seconds: 3));
    final body = await response.transform(utf8.decoder).join();
    final json = jsonDecode(body);
    return json is Map && json['service'] == HelperService.serviceId;
  } catch (_) {
    return false;
  } finally {
    client.close(force: true);
  }
}
