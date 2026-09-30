import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/build_coordinator.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:responsa_helper/src/server/peer_session.dart';

typedef _JsonHandler =
    Future<Map<String, Object?>> Function(Map<String, Object?> body);

/// שכבת ה-HTTP מעל [HelperService]. כללי האבטחה (docs/PROTOCOL.md §2) נאכפים
/// לפני הניתוב, על כל בקשה.
class HttpApi {
  HttpApi(
    this._service, {
    required this.port,
    this.heartbeat = const Duration(seconds: 10),
    int? Function(int clientPort)? clientSession,
    int? ownSession,
  }) : _clientSession =
           clientSession ??
           ((clientPort) =>
               PeerSession.ofClient(clientPort: clientPort, serverPort: port)),
       _ownSession = ownSession ?? PeerSession.own {
    _get = {
      '/health': (_) async => _service.health(),
      '/status': (_) => _service.status(),
      '/icon': (_) => _service.icon(),
      '/catalog/export': (_) => _service.export(),
    };
    _post = {
      '/catalog/cancel': (_) async => {
        'ok': true,
        'wasRunning': _service.builds.cancel(),
      },
      '/catalog/search': _service.search,
      '/catalog/books': _service.books,
      '/book/open': _service.open,
      '/text/search': _service.searchText,
    };
  }

  final HelperService _service;
  final int port;
  final Duration heartbeat;
  final int? Function(int clientPort) _clientSession;
  final int? _ownSession;

  static const int maxBodyBytes = 64 * 1024;
  static const String buildPath = '/catalog/build';

  late final Map<String, _JsonHandler> _get;
  late final Map<String, _JsonHandler> _post;

  Future<void> handle(HttpRequest request) async {
    final watch = Stopwatch()..start();
    final response = request.response;
    response.headers
      ..set(HttpHeaders.cacheControlHeader, 'no-store')
      ..set('X-Content-Type-Options', 'nosniff');
    try {
      _guard(request);
      final path = request.uri.path;
      if (path == buildPath) {
        _requireMethod(request, 'POST');
        final body = await _readJson(request);
        final mode = body['mode'] ?? 'start';
        if (mode != 'start' && mode != 'attach') {
          throw const ApiError.badRequest('mode חייב להיות start או attach.');
        }
        await _streamBuild(
          request,
          mode == 'start' ? _service.startBuild() : _service.builds.attach(),
        );
      } else if (_get[path] case final handler?) {
        _requireMethod(request, 'GET');
        await _sendJson(response, 200, await handler(const {}));
      } else if (_post[path] case final handler?) {
        _requireMethod(request, 'POST');
        await _sendJson(response, 200, await handler(await _readJson(request)));
      } else {
        throw const ApiError('notFound', 404, 'נקודת קצה לא מוכרת.');
      }
    } on ApiError catch (error) {
      await _sendError(response, error);
    } catch (error, stackTrace) {
      logLine(
        'HttpApi: ${request.method} ${request.uri.path}: $error\n$stackTrace',
      );
      await _sendError(
        response,
        ApiError('internal', 500, 'שגיאה פנימית בשירות: $error'),
      );
    } finally {
      logLine(
        '${request.method} ${request.uri.path} ${response.statusCode} '
        '${watch.elapsedMilliseconds}ms',
      );
    }
  }

  /// אוצריא פונה מ-Dart ואינה שולחת `Origin` או `Sec-Fetch-*`; דפדפן תמיד
  /// שולח אותן. בדיקת `Host` חוסמת DNS rebinding.
  void _guard(HttpRequest request) {
    final headers = request.headers;
    // `headers[...]` ולא `value`: כותרת כפולה הייתה זורקת ומחזירה 500.
    if (headers['origin'] != null ||
        headers['sec-fetch-site'] != null ||
        headers['sec-fetch-mode'] != null) {
      throw const ApiError.forbidden('בקשה מדפדפן אינה מותרת.');
    }
    final hosts = headers[HttpHeaders.hostHeader];
    final host = hosts != null && hosts.length == 1
        ? hosts.single.toLowerCase()
        : null;
    if (host != '127.0.0.1:$port' && host != 'localhost:$port') {
      throw const ApiError.forbidden('כתובת יעד לא מותרת.');
    }
    // משתמש Windows אחר שמחובר למחשב מגיע לאותו 127.0.0.1. הוא יקבל שירות
    // משלו על פורט אחר (bin/responsa_helper.dart).
    final remotePort = request.connectionInfo?.remotePort;
    if (_ownSession != null && remotePort != null) {
      final client = _clientSession(remotePort);
      if (client != null && client != _ownSession) {
        throw const ApiError(
          'otherSession',
          403,
          'השירות הזה שייך למשתמש Windows אחר שמחובר למחשב.',
        );
      }
    }
  }

  static void _requireMethod(HttpRequest request, String method) {
    if (request.method != method) {
      throw ApiError(
        'methodNotAllowed',
        405,
        'השיטה ${request.method} אינה נתמכת כאן.',
      );
    }
  }

  static Future<Map<String, Object?>> _readJson(HttpRequest request) async {
    final type = request.headers.contentType;
    if (type == null || type.mimeType != 'application/json') {
      throw const ApiError(
        'unsupportedMediaType',
        415,
        'גוף הבקשה חייב להיות JSON.',
      );
    }
    // ממשיכים לקרוא גם אחרי החריגה: תשובה לפני סוף הגוף נראית ללקוח כמו
    // חיבור שנפל, והמשתמש היה רואה שגיאת רשת במקום הסיבה.
    final bytes = <int>[];
    var received = 0;
    await for (final chunk in request) {
      received += chunk.length;
      if (received <= maxBodyBytes) bytes.addAll(chunk);
    }
    if (received > maxBodyBytes) {
      throw const ApiError('tooLarge', 413, 'גוף הבקשה גדול מדי.');
    }
    if (bytes.isEmpty) return const {};
    try {
      final decoded = jsonDecode(utf8.decode(bytes));
      if (decoded is Map<String, Object?>) return decoded;
    } on FormatException {
      // נופל להודעה האחידה למטה.
    }
    throw const ApiError.badRequest('גוף הבקשה אינו אובייקט JSON תקין.');
  }

  /// ניתוק הלקוח מפסיק רק את ההאזנה, לא את הבנייה.
  Future<void> _streamBuild(
    HttpRequest request,
    Stream<BuildEvent> events,
  ) async {
    final response = request.response
      ..statusCode = 200
      ..bufferOutput = false;
    response.headers.contentType = ContentType(
      'application',
      'x-ndjson',
      charset: 'utf-8',
    );
    final done = Completer<void>();
    var open = true;
    // `flush` שני בזמן שהראשון ממתין זורק, ולכן כל כתיבה ממתינה לקודמתה.
    var writes = Future<void>.value();
    StreamSubscription<BuildEvent>? subscription;

    void finish() {
      if (!done.isCompleted) done.complete();
    }

    void write(Map<String, Object?> json) {
      writes = writes.then((_) async {
        if (!open) return;
        try {
          response.write('${jsonEncode(json)}\n');
          await response.flush();
        } catch (_) {
          open = false;
          await subscription?.cancel();
          finish();
        }
      });
    }

    final ticker = Timer.periodic(heartbeat, (_) {
      write(const {'type': 'heartbeat'});
    });
    subscription = events.listen(
      (event) => write(event.toJson()),
      onDone: finish,
    );
    // לקוח שהתנתק: מפסיקים להאזין מיד, ולא רק בכתיבה הבאה.
    unawaited(
      response.done.then((_) => finish(), onError: (Object _) => finish()),
    );
    await done.future;
    await subscription.cancel();
    ticker.cancel();
    await writes;
    await _close(response);
  }

  static Future<void> _sendJson(
    HttpResponse response,
    int status,
    Map<String, Object?> body,
  ) async {
    response
      ..statusCode = status
      ..headers.contentType = ContentType.json
      ..write(jsonEncode(body));
    await _close(response);
  }

  static Future<void> _sendError(HttpResponse response, ApiError error) async {
    try {
      await _sendJson(response, error.status, {'error': error.toJson()});
    } catch (_) {
      // כותרות כבר נשלחו (באמצע הזרמה) או שהלקוח התנתק; אין למי לדווח.
    }
  }

  static Future<void> _close(HttpResponse response) async {
    try {
      await response.close();
    } catch (_) {
      // לקוח שהתנתק אינו כשל של השירות.
    }
  }
}
