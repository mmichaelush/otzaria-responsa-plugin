import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:responsa_helper/src/server/http_api.dart';
import 'package:test/test.dart';

import 'helpers/catalog_fixture.dart';
import 'helpers/fake_backend.dart';

/// שרת אמיתי על פורט פנוי, מול [FakeBackend]: בודק את החוזה של
/// docs/PROTOCOL.md מקצה לקצה, כולל כותרות האבטחה.
void main() {
  late Directory dir;
  late FakeBackend backend;
  late HelperService service;
  late HttpServer server;
  late HttpClient client;

  Future<void> start({
    bool withCatalog = true,
    int? Function(int clientPort)? clientSession,
  }) async {
    if (withCatalog) writeCatalog(dir);
    service = HelperService(backend: backend, paths: HelperPaths(dir.path));
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final api = HttpApi(
      service,
      port: server.port,
      heartbeat: const Duration(milliseconds: 50),
      clientSession: clientSession,
      ownSession: clientSession == null ? null : 1,
    );
    server.listen(api.handle);
  }

  setUp(() {
    dir = Directory.systemTemp.createTempSync('responsa_helper_http');
    backend = FakeBackend();
    client = HttpClient();
  });

  tearDown(() async {
    client.close(force: true);
    await server.close(force: true);
    try {
      dir.deleteSync(recursive: true);
    } on FileSystemException {
      // Windows מחזיק את קובץ ה-SQLite רגע אחרי הסגירה.
    }
  });

  Future<({int status, Object? json})> call(
    String method,
    String path, {
    Object? body,
    Map<String, String> headers = const {},
    bool json = true,
  }) async {
    final request = await client.open(method, '127.0.0.1', server.port, path);
    headers.forEach(request.headers.set);
    if (body != null) {
      if (json) request.headers.contentType = ContentType.json;
      request.write(body is String ? body : jsonEncode(body));
    }
    final response = await request.close();
    final text = await response.transform(utf8.decoder).join();
    return (
      status: response.statusCode,
      json: text.isEmpty ? null : jsonDecode(text),
    );
  }

  String? errorCode(Object? json) =>
      ((json as Map)['error'] as Map?)?['code'] as String?;

  group('אבטחה', () {
    setUp(() => start());

    test('בקשה מדפדפן נדחית', () async {
      for (final header in ['origin', 'sec-fetch-site', 'sec-fetch-mode']) {
        final result = await call(
          'GET',
          '/health',
          headers: {header: 'https://evil.example'},
        );
        expect(result.status, 403, reason: header);
        expect(errorCode(result.json), 'forbidden');
      }
    });

    test('Host זר נדחה (DNS rebinding)', () async {
      final result = await call(
        'GET',
        '/health',
        headers: {'host': 'evil.example:${server.port}'},
      );
      expect(result.status, 403);
    });

    test('POST בלי JSON נדחה', () async {
      final result = await call(
        'POST',
        '/catalog/search',
        body: 'q=x',
        json: false,
        headers: {'content-type': 'application/x-www-form-urlencoded'},
      );
      expect(result.status, 415);
    });

    test('שיטה שגויה ונתיב לא מוכר', () async {
      expect((await call('GET', '/book/open')).status, 405);
      expect((await call('OPTIONS', '/health')).status, 405);
      expect((await call('GET', '/nope')).status, 404);
    });

    test('גוף גדול מדי נדחה', () async {
      final result = await call(
        'POST',
        '/catalog/search',
        body: {'q': 'x' * (HttpApi.maxBodyBytes + 10)},
      );
      expect(result.status, 413);
    });

    test('JSON שאינו אובייקט נדחה', () async {
      final result = await call('POST', '/catalog/search', body: '[1,2]');
      expect(result.status, 400);
    });
  });

  group('מצב', () {
    test('health מזהה את השירות', () async {
      await start();
      final result = await call('GET', '/health');
      expect(result.status, 200);
      expect(result.json, containsPair('service', 'otzaria-responsa'));
      expect(result.json, containsPair('apiVersion', 1));
    });

    test('status מדווח על ההתקנה והקטלוג', () async {
      await start();
      final json = (await call('GET', '/status')).json as Map;
      expect(json['installed'], isTrue);
      expect(json['version'], 25);
      final catalog = json['catalog'] as Map;
      expect(catalog['exists'], isTrue);
      expect(catalog['bookCount'], sampleBooks.length);
      expect(catalog['matchesInstallation'], isTrue);
      expect(json['build'], {'state': 'idle'});
    });

    test('קטלוג ממחשב אחר מסומן', () async {
      backend.installPath = r'D:\Other';
      await start();
      final json = (await call('GET', '/status')).json as Map;
      expect((json['catalog'] as Map)['matchesInstallation'], isFalse);
    });

    test('בלי קטלוג', () async {
      await start(withCatalog: false);
      final json = (await call('GET', '/status')).json as Map;
      expect((json['catalog'] as Map)['exists'], isFalse);
    });
  });

  group('חיפוש', () {
    test('מחזיר ספרים ועימוד', () async {
      await start();
      final result = await call(
        'POST',
        '/catalog/search',
        body: {'q': 'מהרשא', 'limit': 1},
      );
      expect(result.status, 200);
      final json = result.json as Map;
      expect(json['total'], 2);
      expect((json['results'] as List).single, containsPair('key', '31'));
    });

    test('בלי קטלוג: catalogMissing', () async {
      await start(withCatalog: false);
      final result = await call('POST', '/catalog/search', body: {'q': 'x'});
      expect(result.status, 404);
      expect(errorCode(result.json), 'catalogMissing');
    });

    test('פרמטרים שגויים', () async {
      await start();
      for (final body in [
        {'q': 5},
        {'q': 'x', 'limit': 0},
        {'q': 'x', 'limit': 500},
        {'q': 'x', 'offset': -1},
      ]) {
        final result = await call('POST', '/catalog/search', body: body);
        expect(result.status, 400, reason: '$body');
      }
    });

    test('books מחזיר לפי הסדר ומשמיט מפתח לא קיים', () async {
      await start();
      final result = await call(
        'POST',
        '/catalog/books',
        body: {
          'keys': ['7', 'none', '1524'],
        },
      );
      final keys = [
        for (final book in (result.json as Map)['results'] as List)
          (book as Map)['key'],
      ];
      expect(keys, ['7', '1524']);
    });
  });

  group('פתיחה', () {
    setUp(() => start());

    test('שולח את ההפניות מהקטלוג, בסדרן', () async {
      final result = await call('POST', '/book/open', body: {'key': '1524'});
      expect(result.status, 200);
      expect(result.json, containsPair('ok', true));
      expect(backend.openCalls.single, ['רא"ש יבמות', 'רא"ש על יבמות']);
    });

    test('מפתח לא מוכר', () async {
      final result = await call('POST', '/book/open', body: {'key': '404'});
      expect(result.status, 404);
      expect(errorCode(result.json), 'unknownBook');
    });

    test('ספר שגוי מתורגם ל-wrongBook עם הודעה על הספר', () async {
      backend.onOpen = (_) async => const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.openedWrongBook,
        message: 'x',
        triedRefs: ['רא"ש יבמות'],
      );
      final result = await call('POST', '/book/open', body: {'key': '1524'});
      expect(result.status, 409);
      final error = (result.json as Map)['error'] as Map;
      expect(error['code'], 'wrongBook');
      expect(error['message'], contains('"יבמות"'));
      expect(error['details'], {
        'triedRefs': ['רא"ש יבמות'],
      });
    });

    test('בר אילן לא מותקן: notInstalled ולא notRunning', () async {
      backend
        ..installed = false
        ..onOpen = (_) async => const ResponsaOpenReport(
          ok: false,
          failure: ResponsaFailure.responsaNotRunning,
        );
      final result = await call('POST', '/book/open', body: {'key': '7'});
      expect(errorCode(result.json), 'notInstalled');
    });

    test('פתיחה שנייה בזמן הראשונה: busy', () async {
      final gate = Completer<ResponsaOpenReport>();
      backend.onOpen = (_) => gate.future;
      final first = call('POST', '/book/open', body: {'key': '7'});
      await Future<void>.delayed(const Duration(milliseconds: 100));
      final second = await call('POST', '/book/open', body: {'key': '1524'});
      expect(errorCode(second.json), 'busy');
      gate.complete(const ResponsaOpenReport(ok: true, usedRef: 'משנה ברורה'));
      expect((await first).status, 200);
    });
  });

  group('בנייה', () {
    setUp(() => start());

    /// פותח זרם בנייה ומחזיר את השורות כפי שהן מגיעות.
    Future<(HttpClientResponse, Stream<Map<String, Object?>>)> openBuild({
      String mode = 'start',
    }) async {
      final request = await client.post(
        '127.0.0.1',
        server.port,
        '/catalog/build',
      );
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({'mode': mode}));
      final response = await request.close();
      final lines = response
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .where((line) => line.isNotEmpty)
          .map((line) => jsonDecode(line) as Map<String, Object?>)
          .asBroadcastStream();
      return (response, lines);
    }

    Future<void> until(bool Function() condition) async {
      for (var i = 0; i < 100 && !condition(); i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
      expect(condition(), isTrue);
    }

    test('attach בלי בנייה: idle, ולא מתחיל בנייה', () async {
      final (_, lines) = await openBuild(mode: 'attach');
      expect(await lines.toList(), [
        {'type': 'idle'},
      ]);
      expect(backend.buildCalls, 0);
    });

    test('attach אחרי כשל: אירוע הכשל האחרון', () async {
      final (_, first) = await openBuild();
      final all = first.toList();
      await until(() => backend.buildEvents != null);
      backend.buildEvents!
        ..add(
          const ResponsaBuildProgress.failed(
            ResponsaBuildFailure.elevated,
            'מנהל מערכת',
          ),
        )
        ..close();
      await all;
      final (_, again) = await openBuild(mode: 'attach');
      final events = await again.toList();
      expect(events.single['code'], 'elevated');
      expect(backend.buildCalls, 1);
    });

    test('attach בזמן בנייה מצטרף אליה', () async {
      final (_, first) = await openBuild();
      final firstDone = first.drain<void>();
      await until(() => backend.buildEvents != null);
      final (_, joined) = await openBuild(mode: 'attach');
      final joinedAll = joined.toList();
      backend.buildEvents!
        ..add(
          const ResponsaBuildProgress(stage: ResponsaBuildStage.done, books: 7),
        )
        ..close();
      final events = await joinedAll;
      expect(events.last['type'], 'done');
      expect(backend.buildCalls, 1);
      await firstDone;
    });

    test('mode לא מוכר נדחה', () async {
      final result = await call(
        'POST',
        '/catalog/build',
        body: {'mode': 'restart'},
      );
      expect(result.status, 400);
    });

    test('זרם מלא: start, progress, heartbeat, done', () async {
      final (response, lines) = await openBuild();
      expect(response.headers.contentType?.subType, 'x-ndjson');
      final seen = <String>[];
      final subscription = lines.listen(
        (line) => seen.add(line['type'] as String),
      );
      await until(() => backend.buildEvents != null);
      backend.buildEvents!.add(
        const ResponsaBuildProgress(
          stage: ResponsaBuildStage.scanning,
          scannedNodes: 1000,
          sectionsDone: 1,
          sectionsTotal: 20,
        ),
      );
      await until(() => seen.contains('heartbeat'));
      backend.buildEvents!
        ..add(
          const ResponsaBuildProgress(
            stage: ResponsaBuildStage.done,
            scannedNodes: 1251889,
            books: 8402,
          ),
        )
        ..close();
      await subscription.asFuture<void>();
      expect(seen.first, 'start');
      expect(seen, contains('progress'));
      expect(seen.last, 'done');
    });

    test('חיבור שני מצטרף לבנייה ולא מתחיל חדשה', () async {
      final (_, first) = await openBuild();
      final firstDone = first.drain<void>();
      await until(() => backend.buildEvents != null);
      backend.buildEvents!.add(
        const ResponsaBuildProgress(
          stage: ResponsaBuildStage.scanning,
          scannedNodes: 5000,
        ),
      );
      await until(() => service.builds.snapshot()['scanned'] == 5000);

      final (_, second) = await openBuild();
      final firstLine = await second.first;
      expect(firstLine['type'], 'progress');
      expect(firstLine['scanned'], 5000);
      expect(firstLine['expected'], 1251889);
      expect(backend.buildCalls, 1);
      await backend.buildEvents!.close();
      await firstDone;
    });

    test('ניתוק הלקוח אינו מבטל את הבנייה', () async {
      final (response, lines) = await openBuild();
      await until(() => backend.buildEvents != null);
      final subscription = lines.listen((_) {});
      await Future<void>.delayed(const Duration(milliseconds: 60));
      await subscription.cancel();
      (await response.detachSocket()).destroy();
      await Future<void>.delayed(const Duration(milliseconds: 150));
      expect(service.builds.isRunning, isTrue);
      expect(backend.cancelCalls, 0);
      backend.buildEvents!.close();
    });

    test('ביטול מדווח שגיאה cancelled ומחזיר למצב failed', () async {
      final (_, lines) = await openBuild();
      final all = lines.toList();
      await until(() => backend.buildEvents != null);
      final cancel = await call('POST', '/catalog/cancel', body: {});
      expect(cancel.json, {'ok': true, 'wasRunning': true});
      final events = await all;
      expect(events.last, containsPair('type', 'error'));
      expect(events.last, containsPair('code', 'cancelled'));
      final status = (await call('GET', '/status')).json as Map;
      expect((status['build'] as Map)['state'], 'failed');
    });

    test('ביטול בלי בנייה', () async {
      final cancel = await call('POST', '/catalog/cancel', body: {});
      expect(cancel.json, {'ok': true, 'wasRunning': false});
    });

    test('בנייה שהסתיימה טוענת מחדש את החיפוש', () async {
      expect(
        ((await call('POST', '/catalog/search', body: {'q': 'יבמות'})).json
            as Map)['total'],
        1,
      );
      final (_, lines) = await openBuild();
      final all = lines.toList();
      await until(() => backend.buildEvents != null);
      // כמו הבונה האמיתי: קובץ חדש מחליף את הישן.
      final fresh = Directory(p.join(dir.path, 'fresh'))..createSync();
      final rebuilt = writeCatalog(
        fresh,
        books: [fixtureBook('1', 'יבמות חדש', 'יבמות חדש')],
      );
      File(rebuilt).copySync(service.paths.catalog);
      backend.buildEvents!
        ..add(
          const ResponsaBuildProgress(stage: ResponsaBuildStage.done, books: 1),
        )
        ..close();
      await all;
      final after =
          (await call('POST', '/catalog/search', body: {'q': 'יבמות'})).json
              as Map;
      expect(after['total'], 1);
      expect(((after['results'] as List).single as Map)['key'], '1');
    });
  });

  test('סמל ב-base64', () async {
    await start();
    backend.iconBytes = Uint8List.fromList([137, 80, 78, 71]);
    final result = await call('GET', '/icon');
    expect(result.json, {
      'png': base64Encode([137, 80, 78, 71]),
    });
    backend.iconBytes = null;
    expect((await call('GET', '/icon')).status, 404);
  });

  group('פתיחה ובנייה אינן רצות יחד', () {
    setUp(() => start());

    Future<void> startBuild() async {
      final request = await client.post(
        '127.0.0.1',
        server.port,
        '/catalog/build',
      );
      request.headers.contentType = ContentType.json;
      request.write('{"mode":"start"}');
      // הזרם נסגר בסוף הבדיקה עם הלקוח; השגיאה הזו צפויה.
      unawaited(
        request.close().then((r) => r.drain<void>()).catchError((Object _) {}),
      );
      for (var i = 0; i < 100 && backend.buildEvents == null; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 20));
      }
    }

    test('פתיחה בזמן בנייה: busy, בלי לגעת בבר אילן', () async {
      await startBuild();
      final result = await call('POST', '/book/open', body: {'key': '7'});
      expect(errorCode(result.json), 'busy');
      expect(backend.openCalls, isEmpty);
      await backend.buildEvents!.close();
    });

    test('בנייה בזמן פתיחה: busy', () async {
      final gate = Completer<ResponsaOpenReport>();
      backend.onOpen = (_) => gate.future;
      final opening = call('POST', '/book/open', body: {'key': '7'});
      await Future<void>.delayed(const Duration(milliseconds: 100));
      final build = await call(
        'POST',
        '/catalog/build',
        body: {'mode': 'start'},
      );
      expect(errorCode(build.json), 'busy');
      expect(backend.buildCalls, 0);
      gate.complete(const ResponsaOpenReport(ok: true, usedRef: 'x'));
      await opening;
    });
  });

  test('ביטול לפני שהמנוע התחיל עוצר את הבנייה', () async {
    await start(withCatalog: false);
    backend.statusDelay = const Duration(milliseconds: 300);
    final request = await client.post(
      '127.0.0.1',
      server.port,
      '/catalog/build',
    );
    request.headers.contentType = ContentType.json;
    request.write('{}');
    final lines = (await request.close())
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .toList();
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final cancel = await call('POST', '/catalog/cancel', body: {});
    expect(cancel.json, containsPair('wasRunning', true));
    final events = [for (final line in await lines) jsonDecode(line) as Map];
    expect(events.last, containsPair('code', 'cancelled'));
    expect(backend.buildCalls, 0);
  });

  group('קטלוג שקיים ואינו נקרא', () {
    test('catalogUnreadable ולא catalogMissing, והכשל לא נשמר', () async {
      await start(withCatalog: false);
      final file = File(service.paths.catalog)
        ..writeAsStringSync('not a database');
      final stamp = file.lastModifiedSync();
      final broken = await call('POST', '/catalog/search', body: {'q': 'x'});
      expect(errorCode(broken.json), 'catalogUnreadable');

      // קטלוג תקין באותו זמן שינוי: בלי הטעינה מחדש, החיפוש היה נשאר מת.
      final fresh = Directory(p.join(dir.path, 'fresh'))..createSync();
      File(writeCatalog(fresh)).copySync(file.path);
      file.setLastModifiedSync(stamp);
      final fixed = await call('POST', '/catalog/search', body: {'q': 'יבמות'});
      expect(fixed.status, 200);
    });
  });

  test('בין שני שינויי השם של החלפת הרשימה: busy ולא catalogMissing', () async {
    await start(withCatalog: false);
    File('${service.paths.catalog}.previous').writeAsStringSync('old');
    final request = await client.post(
      '127.0.0.1',
      server.port,
      '/catalog/build',
    );
    request.headers.contentType = ContentType.json;
    request.write('{}');
    final stream = (await request.close()).drain<void>();
    for (var i = 0; i < 100 && backend.buildEvents == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 20));
    }
    final result = await call('POST', '/catalog/search', body: {'q': 'x'});
    expect(errorCode(result.json), 'busy');
    await backend.buildEvents!.close();
    await stream;
  });

  group('משתמש Windows אחר', () {
    test('בקשה מ-session אחר נדחית', () async {
      await start(clientSession: (_) => 2);
      final result = await call('GET', '/health');
      expect(result.status, 403);
      expect(errorCode(result.json), 'otherSession');
    });

    test('בקשה מאותו session מתקבלת', () async {
      await start(clientSession: (_) => 1);
      expect((await call('GET', '/health')).status, 200);
    });

    test('session שלא ניתן לזהות אינו חוסם', () async {
      await start(clientSession: (_) => null);
      expect((await call('GET', '/health')).status, 200);
    });
  });

  test('כותרת Origin כפולה: 403 ולא 500', () async {
    await start();
    final request = await client.get('127.0.0.1', server.port, '/health');
    request.headers
      ..add('origin', 'https://a.example')
      ..add('origin', 'https://b.example');
    final response = await request.close();
    await response.drain<void>();
    expect(response.statusCode, 403);
  });
}
