import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/biography/biography_store.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_menu.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/helper_service.dart';
import 'package:test/test.dart';

import 'helpers/catalog_fixture.dart';
import 'helpers/fake_backend.dart';

BiographyEntry entry(List<String> path) => BiographyEntry(path);

void main() {
  group('BiographyIndex.find', () {
    BiographyIndex index(List<List<String>> paths) => BiographyIndex(
      installKey: 'k',
      entries: [for (final path in paths) entry(path)],
    );

    test('התאמה לפי כותרת, בלי ניקוד ובלי הבדל בכתיב מלא וחסר', () {
      final found = index([
        ['תלמוד', 'מגילת תענית'],
        ['הלכה', 'משנה ברורה'],
      ]).find('משנה ברורה');
      expect(found?.path, ['הלכה', 'משנה ברורה']);
      expect(
        index([
          ['הלכה', 'שולחן ערוך'],
        ]).find('שלחן ערוך'),
        isNotNull,
      );
    });

    test('הסוגריים בשם הספר אינם מונעים התאמה', () {
      final found = index([
        ['שו"ת', 'אבני נזר'],
      ]).find('אבני נזר (מהדורה שנייה)');
      expect(found?.title, 'אבני נזר');
    });

    test('שם שמתאים לשני פריטים נדחה: ביוגרפיה שגויה גרועה מהיעדרה', () {
      expect(
        index([
          ['א', 'תשובות'],
          ['ב', 'תשובות'],
        ]).find('תשובות'),
        isNull,
      );
    });

    test('אין התאמה, ושם ריק', () {
      final value = index([
        ['א', 'ברכות'],
      ]);
      expect(value.find('שבת'), isNull);
      expect(value.find(''), isNull);
    });

    test('findFor: ספר שהוא חלק מחיבור מקבל את הביוגרפיה של החיבור', () {
      final value = index([
        ['ספרי חסידות', 'בעל שם טוב'],
        ['מדרשי אגדה', 'מדרש רבה (תורה)'],
      ]);
      // "בעל שם טוב בראשית פרשת נח" אינו שם של פריט, אבל החיבור שמעליו הוא.
      expect(
        value
            .findFor(
              'בעל שם טוב בראשית פרשת נח',
              context: ['ספרי חסידות', 'בעל שם טוב', 'בראשית'],
            )
            ?.title,
        'בעל שם טוב',
      );
      expect(
        value
            .findFor(
              'מדרש רבה (תורה) שמות רבה (וילנא)',
              context: ['ספרות חז"ל', 'מדרשי אגדה', 'מדרש רבה (תורה)'],
            )
            ?.title,
        'מדרש רבה (תורה)',
      );
      // שם הספר עצמו קודם לחיבור שמעליו.
      expect(
        index([
          ['ספרי חסידות', 'בעל שם טוב'],
          ['ספרי חסידות', 'בראשית'],
        ]).findFor('בראשית', context: ['ספרי חסידות', 'בעל שם טוב']),
        isNotNull,
      );
      expect(value.findFor('ספר אחר', context: ['הלכה']), isNull);
      expect(value.findFor('ספר אחר'), isNull, reason: 'בלי הקשר — רק לפי השם');
    });

    test('findFor: כמה חיבורים בשם אחד — מכריע מה שמעליהם, ובלי הכרעה אין', () {
      final value = index([
        ['תנ"ך', 'תרגום'],
        ['ספרות חז"ל', 'תרגום'],
      ]);
      expect(value.findFor('פרק א', context: ['ספרות חז"ל', 'תרגום'])?.path, [
        'ספרות חז"ל',
        'תרגום',
      ]);
      expect(value.findFor('פרק א', context: ['אחר', 'תרגום']), isNull);
    });

    test('JSON הלוך ושוב, ופגום נדחה', () {
      final value = index([
        ['א', 'ב'],
      ]);
      expect(BiographyIndex.fromJson(value.toJson())?.entries.single.path, [
        'א',
        'ב',
      ]);
      expect(
        BiographyIndex.fromJson({
          'installKey': 'k',
          'entries': [5],
        }),
        isNull,
      );
      expect(BiographyIndex.fromJson('x'), isNull);
      expect(BiographyIndex.fromJson({'entries': []}), isNull);
    });
  });

  group('BiographyEntry.isSeparator', () {
    test('שורות הפרדה בעץ, ורק הן', () {
      for (final title in [
        '---- שאר הראשונים ----',
        '--- אחרונים ---',
        '==========',
        '— — —',
        '',
        '   ',
      ]) {
        expect(entry(['א', title]).isSeparator, isTrue, reason: title);
      }
      for (final title in [
        'רש"י',
        'ר"ן',
        'שאר הראשונים',
        'שו"ת - אחרונים',
        '(מהדורה שנייה)',
        'א-ב',
        '1',
      ]) {
        expect(entry(['א', title]).isSeparator, isFalse, reason: title);
      }
    });
  });

  group('BiographyText.parse', () {
    test('השורה הראשונה היא הכותרת, והשאר המאמר', () {
      final text = BiographyText.parse(
        'ביוגרפיה - מגילת תענית\r\nמגילת תענית היא חיבור.\r\nשורה שנייה.',
        expectedTitle: 'מגילת תענית',
      );
      expect(text?.title, 'מגילת תענית');
      expect(text?.body, 'מגילת תענית היא חיבור.\nשורה שנייה.');
    });

    test('בלי כותרת "ביוגרפיה - …": טקסט מחלון אחר, ולכן נדחה', () {
      expect(
        BiographyText.parse('פסקה בלבד', expectedTitle: 'שם'),
        isNull,
        reason: 'טקסט של ספר שהמשתמש פתח אינו נשמר כביוגרפיה',
      );
    });

    test('כותרת של חיבור אחר נדחית; כותרת שכוללת את השם מתקבלת', () {
      expect(
        BiographyText.parse(
          'ביוגרפיה - רמב"ם\nגוף',
          expectedTitle: 'משנה ברורה',
        ),
        isNull,
      );
      expect(
        BiographyText.parse(
          'ביוגרפיה - שו"ת אבני נזר\nגוף',
          expectedTitle: 'אבני נזר',
        )?.title,
        'שו"ת אבני נזר',
      );
    });

    test('כותרת בלבד או ריק: אין מה להציג', () {
      expect(BiographyText.parse('ביוגרפיה - שם', expectedTitle: 'שם'), isNull);
      expect(BiographyText.parse('  \n ', expectedTitle: 'x'), isNull);
    });
  });

  group('BiographyStore', () {
    late Directory dir;
    setUp(() => dir = Directory.systemTemp.createTempSync('bio-store-'));
    tearDown(() => dir.deleteSync(recursive: true));

    test('רשימה ומאמר נשמרים וחוזרים', () {
      final store = BiographyStore(dir.path);
      expect(store.readIndex(), isNull);
      store.writeIndex(
        BiographyIndex(
          installKey: 'k',
          entries: [
            entry(['א', 'ב']),
          ],
        ),
      );
      expect(store.readIndex()?.installKey, 'k');

      final item = entry(['א', 'ב']);
      expect(store.readText(item), isNull);
      store.writeText(item, const BiographyText(title: 'ב', body: 'גוף'));
      expect(store.readText(item)?.body, 'גוף');
    });

    test('storedKeys: כל המאמרים השמורים בקריאה אחת, ורק הם', () {
      final store = BiographyStore(dir.path);
      expect(store.storedKeys(), isEmpty, reason: 'אין עדיין תיקייה');
      final first = entry(['א', 'ב']);
      final second = entry(['ג', 'ד']);
      store.writeText(first, const BiographyText(title: 'ב', body: 'גוף'));
      expect(store.storedKeys(), {store.keyOf(first)});
      store.writeText(second, const BiographyText(title: 'ד', body: 'גוף'));
      expect(store.storedKeys(), {store.keyOf(first), store.keyOf(second)});
      expect(store.hasText(first), isTrue);
    });

    test('אותו שם בקטגוריות שונות: מאמרים נפרדים', () {
      final store = BiographyStore(dir.path)
        ..writeText(
          entry(['א', 'שם']),
          const BiographyText(title: 'שם', body: 'ראשון'),
        )
        ..writeText(
          entry(['ב', 'שם']),
          const BiographyText(title: 'שם', body: 'שני'),
        );
      expect(store.readText(entry(['א', 'שם']))?.body, 'ראשון');
      expect(store.readText(entry(['ב', 'שם']))?.body, 'שני');
    });

    test('קובץ פגום נקרא כחסר, ולא זורק', () {
      File(
        p.join(dir.path, 'biography-index.json'),
      ).writeAsStringSync('{לא json');
      expect(BiographyStore(dir.path).readIndex(), isNull);
    });

    test('אין קובץ זמני שנשאר אחרי כתיבה', () {
      BiographyStore(
        dir.path,
      ).writeIndex(const BiographyIndex(installKey: 'k', entries: []));
      expect(
        dir.listSync(recursive: true).where((f) => f.path.endsWith('.tmp')),
        isEmpty,
      );
    });
  });

  group('כיתוב תפריט', () {
    test('בלי & ובלי טקסט המקשים', () {
      expect(ResponsaMenu.normalize('ה&עתק\tCtrl+C'), 'העתק');
      expect(ResponsaMenu.normalize('&ביוגרפיה'), 'ביוגרפיה');
      expect(ResponsaMenu.normalize('העתק &עם הערות'), 'העתק עם הערות');
    });
  });

  group('BiographyService', () {
    late Directory dir;
    late FakeBackend backend;
    late HelperService service;

    setUp(() {
      dir = Directory.systemTemp.createTempSync('bio-service-');
      writeCatalog(dir);
      backend = FakeBackend();
      service = HelperService(
        backend: backend,
        paths: HelperPaths(dir.path),
        environment: const {},
        biographyPace: const Duration(milliseconds: 40),
        biographyBusyRetry: const Duration(milliseconds: 40),
      );
    });
    tearDown(() {
      try {
        dir.deleteSync(recursive: true);
      } on FileSystemException {
        // Windows מחזיק את קובץ ה-SQLite רגע אחרי הסגירה.
      }
    });

    /// "7" הוא "משנה ברורה" בקטלוג הבדיקה.
    void withBiography() {
      backend.biography
        ..entries = [
          entry(['הלכה', 'משנה ברורה']),
          entry(['הלכה', 'שו"ת אבני נזר']),
        ]
        ..texts['משנה ברורה'] =
            'ביוגרפיה - משנה ברורה\r\nחיבור הלכתי של החפץ חיים.';
    }

    Future<Map<String, Object?>> read(
      String key, [
      Map<String, Object?>? extra,
    ]) => service.biography.read({'key': key, ...?extra});

    test('קריאה ראשונה: רשימה, מאמר, והמאמר נשמר', () async {
      withBiography();
      final result = await read('7');
      expect(result['found'], true);
      expect(result['heading'], 'משנה ברורה');
      expect(result['text'], 'חיבור הלכתי של החפץ חיים.');
      expect(result['cached'], false);
      expect(backend.biography.indexCalls, 1);
      expect(backend.biography.textCalls, ['משנה ברורה']);
    });

    test('קריאה שנייה: מהשמירה, בלי לפנות לבר אילן', () async {
      withBiography();
      await read('7');
      final again = await read('7');
      expect(again['cached'], true);
      expect(again['text'], 'חיבור הלכתי של החפץ חיים.');
      expect(backend.biography.indexCalls, 1);
      expect(backend.biography.textCalls, hasLength(1));
    });

    test('ספר אחר: הרשימה השמורה משמשת, ורק המאמר נקרא', () async {
      withBiography();
      backend.biography.texts['שו"ת אבני נזר'] =
          'ביוגרפיה - שו"ת אבני נזר\nהאדמו"ר מסוכטשוב.';
      await read('7');
      final other = await read('90');
      expect(other['found'], true);
      expect(backend.biography.indexCalls, 1);
      expect(backend.biography.textCalls, hasLength(2));
    });

    test('אין ביוגרפיה לספר: found=false, ולא נפתח כלום', () async {
      withBiography();
      final result = await read('1524');
      expect(result, {'found': false, 'title': 'יבמות'});
      expect(backend.biography.textCalls, isEmpty);
    });

    test('גם "אין" נענה מהרשימה השמורה בלי בר אילן', () async {
      withBiography();
      await read('1524');
      await read('1524');
      expect(backend.biography.indexCalls, 1);
    });

    test('רשימה ממהדורה אחרת נקראת מחדש', () async {
      withBiography();
      // רשימה שנשמרה בהתקנה אחרת (מהדורה אחרת היא עץ אחר).
      BiographyStore(dir.path).writeIndex(
        BiographyIndex(
          installKey: r'C:\ResponsaCD29|29',
          entries: [
            entry(['א', 'משנה ברורה']),
          ],
        ),
      );
      await read('7');
      expect(backend.biography.indexCalls, 1);
      // ועכשיו נשמרה הרשימה של ההתקנה הנוכחית.
      await read('7');
      expect(backend.biography.indexCalls, 1);
    });

    test('הגדרת "לא להפעיל את בר אילן" עוברת הלאה', () async {
      withBiography();
      await read('7', {'autoStart': false});
      expect(backend.biography.autoStart, everyElement(false));
    });

    test('בר אילן סגורה: notRunning, ושום דבר לא נשמר', () async {
      withBiography();
      backend.biography.indexFailure = ResponsaFailure.responsaNotRunning;
      await expectLater(
        read('7'),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'notRunning')),
      );
      backend.biography.indexFailure = null;
      expect((await read('7'))['found'], true);
    });

    test('כשל בקריאת המאמר: שגיאה עם קוד, ובלי שמירה', () async {
      withBiography();
      backend.biography.textFailure = ResponsaFailure.timeout;
      await expectLater(read('7'), throwsA(isA<ApiError>()));
      backend.biography.textFailure = null;
      final result = await read('7');
      expect(result['cached'], false);
    });

    test('מאמר ריק מבר אילן הוא כשל, לא ביוגרפיה ריקה', () async {
      withBiography();
      backend.biography.texts['משנה ברורה'] = 'ביוגרפיה - משנה ברורה';
      await expectLater(read('7'), throwsA(isA<ApiError>()));
    });

    test('טקסט שאינו הביוגרפיה (חלון אחר שהועתק) נדחה ואינו נשמר', () async {
      withBiography();
      backend.biography.texts['משנה ברורה'] = 'פרק א\nטקסט של ספר פתוח אחר.';
      await expectLater(
        read('7'),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'internal')),
      );
      // כותרת של חיבור אחר נדחית גם היא.
      backend.biography.texts['משנה ברורה'] = 'ביוגרפיה - רמב"ם\nגוף.';
      await expectLater(read('7'), throwsA(isA<ApiError>()));
      // ושום דבר לא נשמר: קריאה תקינה אחריהן פונה שוב לבר אילן.
      withBiography();
      final result = await read('7');
      expect(result['cached'], false);
      expect(backend.biography.textCalls, hasLength(3));
    });

    test('עץ ריק: notFound עם הסבר', () async {
      backend.biography.entries = const [];
      await expectLater(
        read('7'),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'notFound')),
      );
    });

    test('מפתח לא ידוע ומפתח שגוי', () async {
      withBiography();
      await expectLater(
        read('999999'),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'unknownBook')),
      );
      await expectLater(
        service.biography.read(const {}),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'badRequest')),
      );
      await expectLater(
        read('7', {'autoStart': 'כן'}),
        throwsA(isA<ApiError>().having((e) => e.code, 'code', 'badRequest')),
      );
    });

    test('מפתח מספרי כמו שאוצריא שולחת', () async {
      withBiography();
      final result = await service.biography.read({'key': 7});
      expect(result['found'], true);
    });

    test('היכולת מוצהרת', () {
      expect(HelperService.capabilities, contains('biography'));
      expect(HelperService.capabilities, contains('biographyHarvest'));
    });

    group('קריאת כל הביוגרפיות (/biography/harvest)', () {
      Future<Map<String, Object?>> harvest(String action) =>
          service.biography.harvest({'action': action});

      /// ממתין שהריצה תסתיים (לא 'running'), עד חמש שניות.
      Future<Map<String, Object?>> settled() async {
        for (var i = 0; i < 125; i++) {
          final status = await harvest('status');
          if (status['state'] != 'running') return status;
          await Future<void>.delayed(const Duration(milliseconds: 40));
        }
        fail('הקריאה לא הסתיימה');
      }

      void twoArticles() {
        withBiography();
        backend.biography.texts['שו"ת אבני נזר'] =
            'ביוגרפיה - שו"ת אבני נזר\nהאדמו"ר מסוכטשוב.';
      }

      test('לפני שהתחילה: idle, והרשימה עוד לא נקראה', () async {
        expect(await harvest('status'), {
          'state': 'idle',
          'total': null,
          'stored': 0,
          'failed': 0,
          'current': null,
          'message': null,
        });
        expect(
          backend.biography.indexCalls,
          0,
          reason: 'status אינו פונה לבר אילן',
        );
      });

      test(
        'start קורא את כל המאמרים וחוזר מיד, ופעם שנייה לא קורא שוב',
        () async {
          twoArticles();
          final started = await harvest('start');
          expect(started['state'], 'running', reason: 'start אינו ממתין לסיום');
          final done = await settled();
          expect(done['state'], 'done');
          expect(done['total'], 2);
          expect(done['stored'], 2);
          expect(done['failed'], 0);
          expect(backend.biography.textCalls, ['משנה ברורה', 'שו"ת אבני נזר']);

          await harvest('start');
          expect((await settled())['state'], 'done');
          expect(
            backend.biography.textCalls,
            hasLength(2),
            reason: 'מה ששמור לא נקרא שוב',
          );
          // והמאמרים השמורים משרתים את /biography בלי לפנות לבר אילן.
          expect((await read('7'))['cached'], true);
        },
      );

      test('מאמר שנכשל נספר ואינו עוצר את השאר', () async {
        twoArticles();
        backend.biography.texts.remove('משנה ברורה'); // יוחזר טקסט ריק
        await harvest('start');
        final done = await settled();
        expect(done['state'], 'done');
        expect(done['failed'], 1);
        expect(done['stored'], 1);
      });

      /// רשימת פריטים עם מאמר מוכן לכל אחד שאינו מפריד.
      void entriesWith(List<String> titles) {
        backend.biography
          ..entries = [
            for (final title in titles) entry(['ראשונים', title]),
          ]
          ..texts.addAll({
            for (final title in titles)
              title: 'ביוגרפיה - $title\nמאמר על $title.',
          });
      }

      test(
        'פריט הפרדה ("---- שאר הראשונים ----") מדולג, ואינו נספר ברשימה',
        () async {
          entriesWith(['רש"י', '---- שאר הראשונים ----', 'תוספות']);
          // בר אילן אינה פותחת חלון לפריט כזה: זה מה שנמדד אצל משתמש.
          backend.biography.textFailures['---- שאר הראשונים ----'] =
              ResponsaFailure.timeout;
          await harvest('start');
          final done = await settled();
          expect(done['state'], 'done', reason: done['message']?.toString());
          expect(backend.biography.textCalls, ['רש"י', 'תוספות']);
          expect(done['total'], 2, reason: 'הפרדה אינה מאמר');
          expect(done['stored'], 2);
          expect(done['failed'], 0);
        },
      );

      test('חלון שלא נפתח למאמר אחד (timeout) אינו עוצר את השאר', () async {
        entriesWith(['רש"י', 'רמב"ן', 'תוספות']);
        backend.biography.textFailures['רמב"ן'] = ResponsaFailure.timeout;
        await harvest('start');
        final done = await settled();
        expect(done['state'], 'done', reason: done['message']?.toString());
        expect(done['failed'], 1);
        expect(done['stored'], 2);
        expect(backend.biography.textCalls, ['רש"י', 'רמב"ן', 'תוספות']);

        // והפעלה חוזרת אינה נתקעת באותו מאמר: מנסה אותו פעם אחת ומסיימת.
        backend.biography.textCalls.clear();
        await harvest('start');
        final again = await settled();
        expect(again['state'], 'done');
        expect(backend.biography.textCalls, ['רמב"ן']);
      });

      test(
        'כמה כשלי timeout ברצף: עוצרת עם הסבר, לא סורקת הכול לריק',
        () async {
          final titles = [for (var i = 0; i < 12; i++) 'חיבור $i'];
          entriesWith(titles);
          for (final title in titles) {
            backend.biography.textFailures[title] = ResponsaFailure.timeout;
          }
          await harvest('start');
          final failed = await settled();
          expect(failed['state'], 'failed');
          expect(failed['message'], isNotEmpty);
          expect(backend.biography.textCalls, hasLength(5));
        },
      );

      test('הצלחה מאפסת את ספירת הכשלים ברצף', () async {
        final titles = [for (var i = 0; i < 12; i++) 'חיבור $i'];
        entriesWith(titles);
        // ארבעה כשלים, הצלחה, ארבעה כשלים: אף פעם לא חמישה ברצף.
        for (final i in [0, 1, 2, 3, 5, 6, 7, 8]) {
          backend.biography.textFailures[titles[i]] = ResponsaFailure.timeout;
        }
        await harvest('start');
        final done = await settled();
        expect(done['state'], 'done', reason: done['message']?.toString());
        expect(done['failed'], 8);
      });

      test('כשל כללי (בר אילן לא פועלת) עוצר את הריצה עם הסבר', () async {
        twoArticles();
        backend.biography.textFailure = ResponsaFailure.responsaNotRunning;
        await harvest('start');
        final failed = await settled();
        expect(failed['state'], 'failed');
        expect(failed['message'], isNotEmpty);
        expect(
          backend.biography.textCalls,
          hasLength(1),
          reason: 'לא ממשיכים אחרי כשל כללי',
        );
      });

      test(
        'stop עוצר אחרי המאמר הנוכחי, ו-start ממשיך מהמקום שבו עצר',
        () async {
          twoArticles();
          await harvest('start');
          await harvest('stop');
          final stopped = await settled();
          expect(stopped['state'], 'stopped');
          expect(stopped['stored'], lessThan(2));
          await harvest('start');
          final done = await settled();
          expect(done['state'], 'done');
          expect(done['stored'], 2);
        },
      );

      test('action חסר או לא מוכר: badRequest', () async {
        await expectLater(
          service.biography.harvest(const {}),
          throwsA(isA<ApiError>().having((e) => e.code, 'code', 'badRequest')),
        );
        await expectLater(
          service.biography.harvest(const {'action': 'all'}),
          throwsA(isA<ApiError>().having((e) => e.code, 'code', 'badRequest')),
        );
      });
    });
  });
}
