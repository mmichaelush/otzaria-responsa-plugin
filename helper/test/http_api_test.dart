import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:responsa_helper/src/server/http_api.dart';
import 'package:responsa_helper/src/server/otzaria_icon_font.dart';
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
    String? Function(int clientPort)? clientExe,
  }) async {
    if (withCatalog) writeCatalog(dir);
    // בלי משתני סביבה: אחרת אוצריא שמותקנת במחשב הייתה נמצאת בבדיקה.
    service = HelperService(
      backend: backend,
      paths: HelperPaths(dir.path),
      environment: const {},
    );
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final api = HttpApi(
      service,
      port: server.port,
      heartbeat: const Duration(milliseconds: 50),
      clientSession: clientSession,
      clientExe: clientExe ?? (_) => null,
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

  String? errorMessage(Object? json) =>
      ((json as Map)['error'] as Map?)?['message'] as String?;

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

    test('diagnostics: מוצהר ביכולות, ומחזיר סיכום ויומן', () async {
      await start();
      final health = (await call('GET', '/health')).json as Map;
      expect(health['capabilities'], contains('diagnostics'));
      final result = await call('GET', '/diagnostics');
      expect(result.status, 200);
      final json = result.json as Map;
      expect(json['summary'], allOf(isA<String>(), contains('service 0.5.')));
      expect(
        json['summary'],
        contains('book list: ${sampleBooks.length} books'),
      );
      expect(json['logTail'], isA<String>());
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

  group('ייצוא', () {
    test('כל הספרים בשורות מקוצרות, עם זמן הקריאה', () async {
      await start();
      final result = await call('GET', '/catalog/export');
      expect(result.status, 200);
      final json = result.json as Map;
      expect(json['builtAt'], isA<String>());
      final rows = json['books'] as List;
      expect(rows, hasLength(sampleBooks.length));
      // `contains` בלי `equals` משווה רשימה לפי זהות.
      expect(
        rows,
        contains(equals(['7', 'משנה ברורה', 'רבי ישראל מאיר הכהן', ''])),
      );
      expect(
        rows,
        contains(
          equals([
            '31',
            'חידושי אגדות',
            null,
            'מפרשים ופוסקים על הבבלי/מהרש"א',
          ]),
        ),
      );
    });

    test('בלי קטלוג: catalogMissing', () async {
      await start(withCatalog: false);
      final result = await call('GET', '/catalog/export');
      expect(result.status, 404);
      expect(errorCode(result.json), 'catalogMissing');
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

    test('מפתח כמספר, ו-notify מחזיר הודעה שלמה', () async {
      final result = await call(
        'POST',
        '/book/open',
        body: {'key': 1524, 'notify': true},
      );
      expect(result.status, 200);
      expect(backend.openCalls.single, ['רא"ש יבמות', 'רא"ש על יבמות']);
      final json = result.json as Map;
      expect(json['message'], contains('נפתח בבר אילן'));
      expect(json['severity'], 'success');
    });

    test('מפתח לא מוכר', () async {
      final result = await call('POST', '/book/open', body: {'key': '404'});
      expect(result.status, 404);
      expect(errorCode(result.json), 'unknownBook');
    });

    test('מפתח שאינו מספר חיובי או מחרוזת: 400 עם הודעה ברורה', () async {
      for (final key in <Object>[0, -3, 1524.0, true]) {
        final result = await call('POST', '/book/open', body: {'key': key});
        expect(result.status, 400, reason: '$key');
        expect(errorMessage(result.json), 'מפתח הספר אינו תקין.');
      }
      expect(backend.openCalls, isEmpty);
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

  group('חיפוש בבר אילן', () {
    setUp(() => start());

    test('health מכריז על היכולת', () async {
      final json = (await call('GET', '/health')).json as Map;
      expect(json['capabilities'], contains('searchText'));
      expect(json['serverVersion'], HelperService.serverVersion);
    });

    test('מחזיר את התשובה של בר אילן ואת השאילתה שנשלחה', () async {
      final result = await call(
        'POST',
        '/text/search',
        body: {'q': 'בְּרֵאשִׁית בָּרָא'},
      );
      expect(result.status, 200);
      expect(result.json, {
        'ok': true,
        'outcome': 'found',
        'count': 7,
        'query': 'בראשית ברא',
        'truncated': false,
        'broughtToFront': true,
      });
    });

    test('טקסט ארוך מהמותר נחתך ואינו נדחה', () async {
      // מעט יותר מהמותר, ועדיין מתחת לגבול גוף הבקשה (64KB).
      final long = 'שבת ' * (HelperService.maxSelectionLength ~/ 4 + 100);
      expect(long.length, greaterThan(HelperService.maxSelectionLength));
      final result = await call('POST', '/text/search', body: {'q': long});
      expect(result.status, 200);
      expect(backend.searchCalls, hasLength(1));
      expect((result.json as Map)['truncated'], isTrue);
    });

    test('שיטה שגויה', () async {
      expect((await call('GET', '/text/search')).status, 405);
    });

    test('גוף שגוי', () async {
      for (final body in [
        {'q': 5},
        {'q': ''},
        {'q': 'English only'},
        <String, Object?>{},
      ]) {
        final result = await call('POST', '/text/search', body: body);
        expect(result.status, 400, reason: '$body');
        expect(errorCode(result.json), 'badRequest');
      }
      expect(backend.searchCalls, isEmpty);
    });

    test('בלי JSON', () async {
      final result = await call(
        'POST',
        '/text/search',
        body: 'q=x',
        json: false,
        headers: {'content-type': 'text/plain'},
      );
      expect(result.status, 415);
    });

    test('כשל מתורגם לקוד ולהודעה', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: false,
        failure: ResponsaFailure.searchDialogNotFound,
        message: 'x',
      );
      final result = await call('POST', '/text/search', body: {'q': 'שבת'});
      expect(result.status, 502);
      expect(errorCode(result.json), 'dialogNotFound');
    });

    group('notify (פעולת localService.post של אוצריא)', () {
      test('הצלחה: משפט שלם עם המספר, בדרגת הצלחה', () async {
        backend.onSearch = (_) async => const ResponsaSearchReport(
          ok: true,
          outcome: ResponsaSearchOutcome(
            ResponsaSearchState.found,
            count: 2543,
            broughtToFront: true,
          ),
        );
        final result = await call(
          'POST',
          '/text/search',
          body: {'q': 'נר שבת', 'notify': true},
        );
        expect(result.status, 200);
        expect(result.json, containsPair('severity', 'success'));
        expect(
          result.json,
          containsPair('message', 'בר אילן מצא 2,543 תוצאות עבור "נר שבת".'),
        );
      });

      test('שאלה של בר אילן: הודעת מידע, עם הערה על טקסט שקוצר', () async {
        backend.onSearch = (_) async => const ResponsaSearchReport(
          ok: true,
          outcome: ResponsaSearchOutcome(
            ResponsaSearchState.asked,
            broughtToFront: true,
          ),
        );
        final long = List.filled(15, 'שבת').join(' ');
        final result = await call(
          'POST',
          '/text/search',
          body: {'q': long, 'notify': true},
        );
        final json = result.json as Map;
        expect(json['severity'], 'info');
        expect(json['message'], contains('שואל אם לחפש בכל המאגרים'));
        expect(json['message'], endsWith('רק את תחילת הטקסט שסומן.'));
      });

      test('בלי notify: message נשאר הסיבה בלבד, בלי severity', () async {
        backend.onSearch = (_) async => const ResponsaSearchReport(
          ok: true,
          outcome: ResponsaSearchOutcome(
            ResponsaSearchState.refused,
            message: 'נמצאו מעל 32000 תוצאות.',
            broughtToFront: true,
          ),
        );
        final result = await call('POST', '/text/search', body: {'q': 'של'});
        final json = result.json as Map;
        expect(json['message'], 'נמצאו מעל 32000 תוצאות.');
        expect(json.containsKey('severity'), isFalse);
      });

      test('שגיאה: message ו-severity גם ברמה העליונה', () async {
        backend.onSearch = (_) async => const ResponsaSearchReport(
          ok: false,
          failure: ResponsaFailure.searchDialogNotFound,
          message: 'x',
        );
        final result = await call(
          'POST',
          '/text/search',
          body: {'q': 'שבת', 'notify': true},
        );
        final json = result.json as Map;
        expect(json['severity'], 'error');
        expect(json['message'], errorMessage(json));
        expect(json['message'], isNotEmpty);
      });
    });

    test('חיפוש בזמן פתיחה: busy', () async {
      final gate = Completer<ResponsaOpenReport>();
      backend.onOpen = (_) => gate.future;
      final opening = call('POST', '/book/open', body: {'key': '7'});
      await Future<void>.delayed(const Duration(milliseconds: 100));
      final search = await call('POST', '/text/search', body: {'q': 'שבת'});
      expect(search.status, 409);
      expect(errorCode(search.json), 'busy');
      gate.complete(const ResponsaOpenReport(ok: true, usedRef: 'x'));
      expect((await opening).status, 200);
    });
  });

  group('חיפוש מתקדם', () {
    setUp(() => start());

    Future<({int status, Object? json})> advanced(Map<String, Object?> body) =>
        call('POST', '/text/search', body: {'advanced': true, ...body});

    test('health מכריז על היכולות', () async {
      final json = (await call('GET', '/health')).json as Map;
      expect(
        json['capabilities'],
        containsAll(['advancedSearch', 'showResponsa']),
      );
    });

    test('התחביר עובר כמות שהוא, עם האפשרויות', () async {
      final result = await advanced({
        'q': '#!אהרון [1:4] הכהן',
        'options': {'allDatabases': true, 'abbreviations': false},
      });
      expect(result.status, 200);
      expect(result.json, containsPair('advanced', true));
      expect((result.json as Map)['query'], '#!אהרון [1:4] הכהן');
      final setup = backend.searchCalls.single.setup;
      expect(backend.searchCalls.single.query, '#!אהרון [1:4] הכהן');
      expect(setup.advanced, isTrue);
      expect(setup.allDatabases, isTrue);
      expect(setup.abbreviations, isFalse);
      expect(setup.showForms, isNull);
      expect(setup.scope, isNull);
    });

    test('חיפוש רגיל: רק "ניהול הצורות", כבוי בלי הגדרה', () async {
      await call(
        'POST',
        '/text/search',
        body: {
          'q': 'שבת',
          'options': {'abbreviations': true},
        },
      );
      final setup = backend.searchCalls.single.setup;
      expect(setup.advanced, isFalse);
      expect(setup.checks, {ResponsaSearchSetup.showFormsId: false});
    });

    test('ניסוח חופשי: משפט שלם, תחום, ובלי תיבות של חיפוש מתקדם', () async {
      final result = await call(
        'POST',
        '/text/search',
        body: {
          'q': 'הַאִם מותר לנסוע #באופניים בשבת?',
          'freeForm': true,
          'options': {'allDatabases': true, 'abbreviations': true},
        },
      );
      expect(result.status, 200);
      expect((result.json as Map)['freeForm'], isTrue);
      final call0 = backend.searchCalls.single;
      expect(call0.query, 'האם מותר לנסוע באופניים בשבת');
      expect(call0.setup.freeForm, isTrue);
      expect(call0.setup.advanced, isFalse);
      expect(call0.setup.checks, {ResponsaSearchSetup.allDatabasesId: true});
    });

    test('ניסוח חופשי בלי מילה עברית: 400', () async {
      final result = await call(
        'POST',
        '/text/search',
        body: {'q': 'hello 123', 'freeForm': true},
      );
      expect(result.status, 400);
      expect(backend.searchCalls, isEmpty);
    });

    test('חיפוש רגיל עם showForms מהתוסף', () async {
      await call('POST', '/text/search', body: {'q': 'שבת', 'showForms': true});
      expect(backend.searchCalls.single.setup.checks, {
        ResponsaSearchSetup.showFormsId: true,
      });
    });

    test(
      'תחום: קטגוריות וספרים הופכים לנתיבים בעץ, וגוברים על "כל המאגרים"',
      () async {
        final result = await advanced({
          'q': 'שבת',
          'options': {'allDatabases': true},
          'scope': {
            'paths': ['/מפרשים ופוסקים על הבבלי/מהרש"א/'],
            'books': ['90'],
          },
        });
        expect(result.status, 200);
        final setup = backend.searchCalls.single.setup;
        expect(setup.allDatabases, isFalse);
        expect(setup.scope, [
          ['מפרשים ופוסקים על הבבלי', 'מהרש"א'],
          ['שו"ת', 'שו"ת אבני נזר'],
        ]);
      },
    );

    test('תחום שגוי', () async {
      for (final (scope, code) in [
        (<String, Object?>{}, 'badRequest'),
        ({'paths': 'x'}, 'badRequest'),
        (
          {
            'paths': [''],
          },
          'badRequest',
        ),
        (
          {
            'paths': ['אין כזו'],
          },
          'notFound',
        ),
        (
          {
            'books': ['999999'],
          },
          'unknownBook',
        ),
        (
          {'paths': List.filled(HelperService.maxScopeItems + 1, 'שו"ת')},
          'badRequest',
        ),
      ]) {
        final result = await advanced({'q': 'שבת', 'scope': scope});
        expect(errorCode(result.json), code, reason: '$scope');
      }
      expect(backend.searchCalls, isEmpty);
    });

    test('תחביר שאסור שיגיע לבר אילן: queryInvalid עם הסבר', () async {
      for (final q in ['(עץ/אילן', 'נר & שבת', 'English']) {
        final result = await advanced({'q': q});
        expect(result.status, 400, reason: q);
        expect(errorCode(result.json), 'queryInvalid', reason: q);
      }
      expect(backend.searchCalls, isEmpty);
    });

    test('בר אילן דחה את השאילתה: ההודעה שלו', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome(
          ResponsaSearchState.invalid,
          message: 'אין משפחה בשם זה.',
        ),
      );
      final result = await advanced({'q': '<שבט>'});
      expect(result.status, 400);
      expect(errorCode(result.json), 'queryInvalid');
      expect(errorMessage(result.json), contains('אין משפחה בשם זה.'));
    });

    test('ניהול הצורות: הודעה מה לעשות בבר אילן', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome(ResponsaSearchState.forms),
      );
      final result = await advanced({
        'q': '#נר',
        'options': {'showForms': true},
      });
      expect(result.status, 200);
      expect((result.json as Map)['outcome'], 'forms');
      expect((result.json as Map)['message'], contains('ניהול הצורות'));
    });

    test('קטגוריה שלא נמצאה בעץ המאגרים', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: false,
        failure: ResponsaFailure.searchScopeNotFound,
        message: 'לא נמצאו בעץ המאגרים של בר אילן: שו"ת',
      );
      final result = await advanced({
        'q': 'שבת',
        'scope': {
          'paths': ['שו"ת'],
        },
      });
      expect(result.status, 404);
      expect(errorCode(result.json), 'scopeNotFound');
      expect(errorMessage(result.json), contains('שו"ת'));
    });

    test('options שגוי', () async {
      for (final body in [
        {'q': 'שבת', 'advanced': true, 'options': 'x'},
        {
          'q': 'שבת',
          'advanced': true,
          'options': {'abbreviations': 'yes'},
        },
        {'q': 'שבת', 'advanced': 'yes'},
      ]) {
        final result = await call('POST', '/text/search', body: body);
        expect(errorCode(result.json), 'badRequest', reason: '$body');
      }
    });
  });

  group('מקום מדויק', () {
    setUp(() => start());

    test('health מכריז על היכולת', () async {
      final json = (await call('GET', '/health')).json as Map;
      expect(json['capabilities'], contains('locate'));
    });

    test('תוצאה אחת: נפתחת, וההפניה מנוקה מניקוד ומקף', () async {
      final result = await call(
        'POST',
        '/reference/open',
        body: {'ref': '  בְּרֵאשִׁית  ב־ג ', 'notify': true},
      );
      expect(result.status, 200);
      expect(backend.locateCalls.single, (
        reference: 'בראשית ב ג',
        index: null,
      ));
      final json = result.json as Map;
      expect(json['opened'], isTrue);
      expect(json['severity'], 'success');
      expect(json['message'], contains('נפתח בבר אילן'));
    });

    test('כמה תוצאות: חוזרות לבחירה, ושום דבר אינו נפתח', () async {
      backend.onLocate = (reference, index) async => const ResponsaOpenReport(
        ok: true,
        choices: ['תורה בראשית ב ג', 'רש"י בראשית ב ג'],
      );
      final result = await call(
        'POST',
        '/reference/open',
        body: {'ref': 'בראשית ב ג'},
      );
      expect(result.json, {
        'ok': true,
        'opened': false,
        'ref': 'בראשית ב ג',
        'choices': ['תורה בראשית ב ג', 'רש"י בראשית ב ג'],
      });
    });

    test('בחירה: האינדקס עובר כמו שהוא', () async {
      await call(
        'POST',
        '/reference/open',
        body: {'ref': 'בראשית ב ג', 'index': 1},
      );
      expect(backend.locateCalls.single.index, 1);
    });

    test('מקום שבר אילן לא זיהה: 404 עם דוגמאות לכתיבה', () async {
      backend.onLocate = (reference, index) async => const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.referenceNotParsed,
        message: 'x',
      );
      final result = await call(
        'POST',
        '/reference/open',
        body: {'ref': 'ספר שאינו קיים ב'},
      );
      expect(result.status, 404);
      expect(errorCode(result.json), 'referenceNotFound');
      expect(errorMessage(result.json), contains('"בראשית ב ג"'));
    });

    test('כשל פתיחה: הודעה למשתמש, לא הטקסט הפנימי', () async {
      backend.onLocate = (reference, index) async => const ResponsaOpenReport(
        ok: false,
        failure: ResponsaFailure.openedWrongBook,
        message: 'נפתח "X" — אינו תואם לselectedResult',
      );
      final result = await call(
        'POST',
        '/reference/open',
        body: {'ref': 'בראשית ב ג'},
      );
      expect(errorMessage(result.json), contains('בר אילן פתח ספר אחר'));
      expect(errorMessage(result.json), isNot(contains('selectedResult')));
    });

    test('סימני כיווניות, גרשיים כפולים וגרש הפוך מנורמלים', () async {
      await call(
        'POST',
        '/reference/open',
        body: {'ref': '\u200Fשו\'\'ע או``ח סי\u00B4 א\u200E'},
      );
      expect(backend.locateCalls.single.reference, 'שו"ע או"ח סי\' א');
    });

    test('ניקוד אינו נספר באורך', () async {
      final pointed = 'בְּ' * HelperService.maxReferenceLength;
      final result = await call(
        'POST',
        '/reference/open',
        body: {'ref': pointed},
      );
      expect(result.status, 200);
    });

    test('בלי עברית, אינדקס שלילי או הפניה ארוכה: 400', () async {
      for (final body in <Map<String, Object?>>[
        {'ref': 'Genesis 2:3'},
        {'ref': 'בראשית', 'index': -1},
        {'ref': 'בראשית', 'index': 'א'},
        {'ref': 'א' * (HelperService.maxReferenceLength + 1)},
      ]) {
        final result = await call('POST', '/reference/open', body: body);
        expect(result.status, 400, reason: '$body');
      }
      expect(backend.locateCalls, isEmpty);
    });
  });

  group('פתיחת בר אילן', () {
    setUp(() => start());

    test('מביא לחזית', () async {
      final result = await call('POST', '/responsa/show', body: {});
      expect(result.status, 200);
      expect(result.json, {'ok': true, 'broughtToFront': true});
      expect(backend.showCalls, 1);
    });

    test('לא מותקן', () async {
      backend
        ..installed = false
        ..showReport = const ResponsaShowReport(
          ok: false,
          failure: ResponsaFailure.responsaNotRunning,
          message: 'x',
        );
      final result = await call('POST', '/responsa/show', body: {});
      expect(errorCode(result.json), 'notInstalled');
    });

    test('לא הופעל', () async {
      backend.showReport = const ResponsaShowReport(
        ok: false,
        failure: ResponsaFailure.responsaNotRunning,
        message: 'בר אילן לא עלה',
      );
      final result = await call('POST', '/responsa/show', body: {});
      expect(result.status, 409);
      expect(errorCode(result.json), 'notRunning');
      expect(errorMessage(result.json), 'בר אילן לא עלה');
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
      expect(firstLine['expected'], 465701);
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

  group('עיון בקטגוריות', () {
    setUp(() => start());

    test('שורש העץ: קטגוריות עם מספר ספרים, וספרים שבשורש', () async {
      final json =
          (await call('POST', '/catalog/browse', body: {})).json as Map;
      expect(json['path'], '');
      expect(
        json['categories'],
        contains(
          equals({
            'name': 'מפרשים ופוסקים על הבבלי',
            'path': 'מפרשים ופוסקים על הבבלי',
            'bookCount': 3,
          }),
        ),
      );
      expect([
        for (final b in json['books'] as List) (b as Map)['key'],
      ], contains('7'));
    });

    test('רמה פנימית ונתיב לא קיים', () async {
      final json =
          (await call(
                'POST',
                '/catalog/browse',
                body: {'path': ' מפרשים ופוסקים על הבבלי/ '},
              )).json
              as Map;
      expect([
        for (final c in json['categories'] as List) (c as Map)['name'],
      ], unorderedEquals(['רא"ש', 'מהרש"א']));
      final missing = await call(
        'POST',
        '/catalog/browse',
        body: {'path': 'אין כזה'},
      );
      expect(missing.status, 404);
      final bad = await call('POST', '/catalog/browse', body: {'path': 3});
      expect(bad.status, 400);
    });

    test('חיפוש מצומצם לקטגוריה', () async {
      Future<int> total(String path) async =>
          ((await call(
                    'POST',
                    '/catalog/search',
                    body: {'q': 'יבמות', 'path': path},
                  )).json
                  as Map)['total']
              as int;
      expect(await total(''), 1);
      expect(await total('מפרשים ופוסקים על הבבלי'), 1);
      expect(await total('מפרשים ופוסקים על הבבלי/מהרש"א'), 0);
    });
  });

  group('אייקוני אוצריא', () {
    test('הגופן מתיקיית האוצריא שפנתה לשירות', () async {
      final otzaria = Directory(p.join(dir.path, 'otzaria'));
      final font = File(
        p.joinAll([otzaria.path, ...OtzariaIconFont.relativePath]),
      )..createSync(recursive: true);
      final bytes = File('test/fixtures/icons_cff.otf').readAsBytesSync();
      font.writeAsBytesSync(bytes);
      await start(clientExe: (_) => p.join(otzaria.path, 'otzaria.exe'));

      final result = await call('GET', '/otzaria/icons');
      expect(result.status, 200);
      final json = result.json as Map;
      expect(json['glyphs'], {
        'book_24_regular': 0xE000,
        'search_in_the_library_24_regular': 0xE001,
      });
      expect(base64Decode(json['font'] as String), bytes);
    });

    test('בלי אוצריא מוכרת: 404', () async {
      await start(clientExe: (_) => p.join(dir.path, 'other.exe'));
      final result = await call('GET', '/otzaria/icons');
      expect(result.status, 404);
      expect(errorCode(result.json), 'notFound');
    });
  });

  group('הפעלת בר אילן (autoStart)', () {
    setUp(() => start());

    const requests = [
      ('/book/open', {'key': '1524'}),
      ('/text/search', {'q': 'נר שבת'}),
      ('/reference/open', {'ref': 'בראשית ב ג'}),
    ];

    test('health מכריז על היכולת', () async {
      final json = (await call('GET', '/health')).json as Map;
      expect(json['capabilities'], contains('autoStart'));
    });

    test('בלי השדה, או null (מפתח שעוד לא נשמר באוצריא): מפעיל', () async {
      for (final (path, body) in requests) {
        expect((await call('POST', path, body: body)).status, 200);
        expect(
          (await call('POST', path, body: {...body, 'autoStart': null})).status,
          200,
        );
      }
      expect(backend.autoStartCalls, List.filled(6, true));
    });

    test('false עובר לבר אילן בכל שלוש הפעולות', () async {
      for (final (path, body) in requests) {
        final result = await call(
          'POST',
          path,
          body: {...body, 'autoStart': false},
        );
        expect(result.status, 200, reason: path);
      }
      expect(backend.autoStartCalls, [false, false, false]);
    });

    test('ערך שאינו בוליאני: badRequest, ובר אילן לא נוגע', () async {
      for (final (path, body) in requests) {
        final result = await call(
          'POST',
          path,
          body: {...body, 'autoStart': 'no'},
        );
        expect(result.status, 400, reason: path);
        expect(errorCode(result.json), 'badRequest');
      }
      expect(backend.autoStartCalls, isEmpty);
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
