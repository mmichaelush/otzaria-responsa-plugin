import 'dart:async';
import 'dart:io';

import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:test/test.dart';

import 'helpers/catalog_fixture.dart';
import 'helpers/fake_backend.dart';

/// `searchText` מול [FakeBackend]: ניקוי השאילתה, התשובה של בר אילן, ומניעת
/// חפיפה עם פתיחה ובנייה, שמפעילות את אותו מופע.
void main() {
  late Directory dir;
  late FakeBackend backend;
  late HelperService service;

  setUp(() {
    dir = Directory.systemTemp.createTempSync('responsa_helper_search');
    backend = FakeBackend();
  });

  tearDown(() {
    try {
      dir.deleteSync(recursive: true);
    } on FileSystemException {
      // Windows מחזיק את קובץ ה-SQLite רגע אחרי הסגירה.
    }
  });

  void start({bool withCatalog = true}) {
    if (withCatalog) writeCatalog(dir);
    service = HelperService(backend: backend, paths: HelperPaths(dir.path));
  }

  Matcher apiError(String code, {int? status}) => isA<ApiError>()
      .having((e) => e.code, 'code', code)
      .having((e) => e.status, 'status', status ?? anything);

  ResponsaSearchReport found(int count, {bool front = true}) =>
      ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome(
          ResponsaSearchState.found,
          count: count,
          summaryShown: true,
          broughtToFront: front,
        ),
      );

  group('השאילתה', () {
    setUp(start);

    test('נשלחת מנוקה, ומוחזרת כפי שנשלחה', () async {
      final result = await service.searchText({
        'q': 'דִּבְרֵי הָרַמְבַּ"ם, (1)',
      });
      expect(backend.searchCalls.single.query, 'דברי הרמב"ם');
      expect(result['query'], 'דברי הרמב"ם');
      expect(result['truncated'], isFalse);
    });

    test('בחירה ארוכה נחתכת ומסומנת', () async {
      final long = List.filled(30, 'מילה').join(' ');
      final result = await service.searchText({'q': long});
      expect(result['truncated'], isTrue);
      expect(backend.searchCalls.single.query.split(' '), hasLength(10));
    });

    test('בלי מילה עברית: badRequest, ובר אילן לא נוגע', () async {
      for (final q in ['', '   ', 'Hello 123', '?!*#', 'ָ']) {
        await expectLater(
          service.searchText({'q': q}),
          throwsA(apiError('badRequest', status: 400)),
          reason: q,
        );
      }
      await expectLater(
        service.searchText({}),
        throwsA(apiError('badRequest')),
      );
      expect(backend.searchCalls, isEmpty);
    });

    test('ההודעה אומרת מה לעשות', () async {
      await expectLater(
        service.searchText({'q': 'hello'}),
        throwsA(
          isA<ApiError>().having(
            (e) => e.message,
            'message',
            contains('בעברית'),
          ),
        ),
      );
    });

    test('q שאינו מחרוזת', () async {
      await expectLater(
        service.searchText({'q': 5}),
        throwsA(apiError('badRequest')),
      );
    });

    test('בחירה של כמה אלפי תווים מתקבלת', () async {
      final result = await service.searchText({'q': 'שלום ' * 1500});
      expect(result['truncated'], isTrue);
    });
  });

  group('התשובה של בר אילן', () {
    setUp(start);

    test('נמצאו', () async {
      backend.onSearch = (_) async => found(2543, front: false);
      final result = await service.searchText({'q': 'שבת'});
      expect(result, {
        'ok': true,
        'outcome': 'found',
        'count': 2543,
        'query': 'שבת',
        'truncated': false,
        'broughtToFront': false,
      });
    });

    test('שאלה, עם ההודעה של בר אילן', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome(
          ResponsaSearchState.asked,
          message: 'לא נמצאה כל תוצאה! האם ברצונך לחפש בכל המאגרים?',
          broughtToFront: true,
        ),
      );
      final result = await service.searchText({'q': 'שבת'});
      expect(result['outcome'], 'asked');
      expect(result['message'], contains('בכל המאגרים'));
      expect(result.containsKey('count'), isFalse);
    });

    test('סירוב בלי הודעה: הסבר משלנו', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome(ResponsaSearchState.refused),
      );
      final result = await service.searchText({'q': 'שבת'});
      expect(result['outcome'], 'refused');
      expect(result['message'], contains('יש לעבור לבר אילן'));
    });

    test('ההתקנה שממנה נבנה הקטלוג', () async {
      await service.searchText({'q': 'שבת'});
      expect(backend.searchCalls.single.installPath, r'C:\ResponsaCD25');
    });

    test('בלי קטלוג: החיפוש עובד, על ההתקנה שנמצאה', () async {
      final bare = Directory(dir.path).createTempSync('bare');
      service = HelperService(backend: backend, paths: HelperPaths(bare.path));
      final result = await service.searchText({'q': 'שבת'});
      expect(result['outcome'], 'found');
      expect(backend.searchCalls.single.installPath, isNull);
    });
  });

  group('כשלים', () {
    setUp(start);

    Future<ApiError> failWith(ResponsaFailure failure, {String? message}) {
      backend.onSearch = (_) async =>
          ResponsaSearchReport(ok: false, failure: failure, message: message);
      return service
          .searchText({'q': 'שבת'})
          .then<ApiError>(
            (_) => fail('צפוי כשל'),
            onError: (Object error) => error as ApiError,
          );
    }

    test('חלון החיפוש לא נפתח: dialogNotFound', () async {
      final error = await failWith(ResponsaFailure.searchDialogNotFound);
      expect(error.code, 'dialogNotFound');
      expect(error.status, 502);
      expect(error.message, contains('חלון החיפוש'));
    });

    test('פג הזמן: notResponding', () async {
      final error = await failWith(ResponsaFailure.timeout);
      expect(error.code, 'notResponding');
      expect(error.status, 504);
    });

    test('לא עלה: notRunning, עם ההודעה של הבקר', () async {
      final error = await failWith(
        ResponsaFailure.responsaNotRunning,
        message: 'הפעלת בר אילן מתוך אוצריא כבויה בהגדרות.',
      );
      expect(error.code, 'notRunning');
      expect(error.message, 'הפעלת בר אילן מתוך אוצריא כבויה בהגדרות.');
    });

    test('לא מותקן: notInstalled', () async {
      backend.installed = false;
      final error = await failWith(ResponsaFailure.responsaNotRunning);
      expect(error.code, 'notInstalled');
    });

    test('תקרת החלונות: windowLimit', () async {
      final error = await failWith(ResponsaFailure.mdiWindowLimitReached);
      expect(error.code, 'windowLimit');
      expect(error.message, contains('לסגור'));
    });

    test('כשל לא צפוי: internal, עם הסיבה', () async {
      final error = await failWith(
        ResponsaFailure.unexpected,
        message: 'החיפוש בבר אילן נכשל באופן בלתי צפוי: boom',
      );
      expect(error.code, 'internal');
      expect(error.message, contains('boom'));
    });

    test('ok בלי תשובה סופית אינו הצלחה', () async {
      backend.onSearch = (_) async => const ResponsaSearchReport(
        ok: true,
        outcome: ResponsaSearchOutcome.pending,
      );
      await expectLater(
        service.searchText({'q': 'שבת'}),
        throwsA(apiError('notResponding')),
      );
    });

    test('אחרי כשל אפשר לחפש שוב', () async {
      await failWith(ResponsaFailure.timeout);
      backend.onSearch = null;
      expect((await service.searchText({'q': 'שבת'}))['ok'], isTrue);
    });
  });

  group('אוטומציה אחת בכל רגע', () {
    setUp(start);

    test('חיפוש בזמן בנייה: busy, בלי לגעת בבר אילן', () async {
      final events = service.startBuild().listen((_) {});
      await expectLater(
        service.searchText({'q': 'שבת'}),
        throwsA(apiError('busy', status: 409)),
      );
      expect(backend.searchCalls, isEmpty);
      await pumpUntil(() => backend.buildEvents != null);
      await backend.buildEvents!.close();
      await events.cancel();
    });

    test('חיפוש בזמן פתיחה: busy', () async {
      final gate = Completer<ResponsaOpenReport>();
      backend.onOpen = (_) => gate.future;
      final opening = service.open({'key': '7'});
      await pumpUntil(() => backend.openCalls.isNotEmpty);
      await expectLater(
        service.searchText({'q': 'שבת'}),
        throwsA(apiError('busy')),
      );
      expect(backend.searchCalls, isEmpty);
      gate.complete(const ResponsaOpenReport(ok: true, usedRef: 'x'));
      await opening;
    });

    test('פתיחה בזמן חיפוש: busy', () async {
      final gate = Completer<ResponsaSearchReport>();
      backend.onSearch = (_) => gate.future;
      final searching = service.searchText({'q': 'שבת'});
      await pumpUntil(() => backend.searchCalls.isNotEmpty);
      await expectLater(
        service.open({'key': '7'}),
        throwsA(
          isA<ApiError>()
              .having((e) => e.code, 'code', 'busy')
              .having((e) => e.message, 'message', contains('מחפש')),
        ),
      );
      expect(backend.openCalls, isEmpty);
      gate.complete(found(1));
      await searching;
    });

    test('חיפוש שני בזמן הראשון: busy', () async {
      final gate = Completer<ResponsaSearchReport>();
      backend.onSearch = (_) => gate.future;
      final first = service.searchText({'q': 'שבת'});
      await pumpUntil(() => backend.searchCalls.isNotEmpty);
      await expectLater(
        service.searchText({'q': 'חג'}),
        throwsA(apiError('busy')),
      );
      gate.complete(found(1));
      expect((await first)['ok'], isTrue);
      expect(backend.searchCalls, hasLength(1));
    });

    test('בנייה בזמן חיפוש: busy', () async {
      final gate = Completer<ResponsaSearchReport>();
      backend.onSearch = (_) => gate.future;
      final searching = service.searchText({'q': 'שבת'});
      await pumpUntil(() => backend.searchCalls.isNotEmpty);
      expect(service.startBuild, throwsA(apiError('busy')));
      expect(backend.buildCalls, 0);
      gate.complete(found(1));
      await searching;
    });

    test('השאילתה נבדקת לפני התפוס: busy אינו מסתיר בקשה שגויה', () async {
      final events = service.startBuild().listen((_) {});
      await expectLater(
        service.searchText({'q': 'hello'}),
        throwsA(apiError('badRequest')),
      );
      await pumpUntil(() => backend.buildEvents != null);
      await backend.buildEvents!.close();
      await events.cancel();
    });
  });
}

Future<void> pumpUntil(bool Function() condition) async {
  for (var i = 0; i < 100 && !condition(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  expect(condition(), isTrue);
}
