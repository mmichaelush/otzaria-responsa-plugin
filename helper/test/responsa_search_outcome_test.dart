import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:test/test.dart';

/// הכותרות, הכפתורים וההודעות כאן נמדדו חי על CD25 (29.9.2026), אחרי לחיצה
/// על "בצע חיפוש".
void main() {
  final profile = ResponsaVersionProfile.forVersion(25);

  ResponsaSearchOutcome classify(
    List<ResponsaDialogSnapshot> dialogs, [
    List<String> newMdiTitles = const [],
  ]) => ResponsaSearchAutomation.classify(
    profile: profile,
    dialogs: dialogs,
    newMdiTitles: newMdiTitles,
  );

  const summary = ResponsaDialogSnapshot(
    title: '2543 תוצאות',
    buttons: [
      (id: 341, text: '&הרחבה'),
      (id: 1, text: 'אישור'),
      (id: 1377, text: '<<&צמצום'),
    ],
  );

  const question = ResponsaDialogSnapshot(
    title: 'מידע',
    buttons: [
      (id: 6, text: '&כן'),
      (id: 7, text: '&לא'),
      (id: 2, text: 'ביטול'),
    ],
    message:
        'לא נמצאה כל תוצאה!\nשים לב: החיפוש מוגבל לספרים.\n'
        'האם ברצונך לחפש בכל המאגרים?',
  );

  const refusal = ResponsaDialogSnapshot(
    title: 'מידע',
    buttons: [(id: 2, text: 'אישור')],
    message: 'נמצאו מעל 32000 תוצאות. נא לפשט את החיפוש או לצמצם צורות',
  );

  const progress = ResponsaDialogSnapshot(title: 'מצב התקדמות');

  group('נמצאו תוצאות', () {
    test('מודאל הסיכום, עם חלון התוצאות', () {
      final outcome = classify([summary], ['נמצאו 2543 תוצאות    1-6']);
      expect(outcome.state, ResponsaSearchState.found);
      expect(outcome.count, 2543);
      expect(outcome.window, 'נמצאו 2543 תוצאות    1-6');
      expect(outcome.summaryShown, isTrue);
    });

    test('חלון התוצאות לפני שהסיכום עלה', () {
      final outcome = classify(const [], ['נמצאו 9 תוצאות    1-6']);
      expect(outcome.state, ResponsaSearchState.found);
      expect(outcome.count, 9);
      expect(outcome.summaryShown, isFalse);
    });

    test('מספר עם פסיקים', () {
      const titled = ResponsaDialogSnapshot(
        title: '12,345 תוצאות',
        buttons: [(id: 341, text: '&הרחבה'), (id: 1, text: 'אישור')],
      );
      expect(classify([titled]).count, 12345);
      expect(classify(const [], ['נמצאו 12,345 תוצאות  1-6']).count, 12345);
    });

    test('הסיכום קודם למודאל "מידע"', () {
      expect(classify([refusal, summary]).state, ResponsaSearchState.found);
    });

    test('כותרת "תוצאות" בלי כפתור הרחבה אינה סיכום', () {
      const other = ResponsaDialogSnapshot(
        title: '5 תוצאות',
        buttons: [(id: 1, text: 'אישור')],
      );
      expect(classify([other]).state, ResponsaSearchState.pending);
    });

    test('כותרת "תוצאות" בלי מספר אינה סיכום', () {
      const other = ResponsaDialogSnapshot(
        title: 'רשימת תוצאות',
        buttons: [(id: 341, text: '&הרחבה'), (id: 1, text: 'אישור')],
      );
      expect(classify([other]).state, ResponsaSearchState.pending);
    });
  });

  group('מודאל "מידע"', () {
    test('אין תוצאות: שאלה, עם ההודעה של בר אילן', () {
      final outcome = classify([question]);
      expect(outcome.state, ResponsaSearchState.asked);
      expect(
        outcome.message,
        'לא נמצאה כל תוצאה! שים לב: החיפוש מוגבל לספרים. '
        'האם ברצונך לחפש בכל המאגרים?',
      );
    });

    test('יותר מדי תוצאות: סירוב', () {
      final outcome = classify([refusal]);
      expect(outcome.state, ResponsaSearchState.refused);
      expect(
        outcome.message,
        'נמצאו מעל 32000 תוצאות. נא לפשט את החיפוש או לצמצם צורות',
      );
      expect(outcome.count, isNull);
    });

    test('הודעת הסירוב אינה נקראת כחלון תוצאות', () {
      // "נמצאו מעל 32000" היא הודעה, לא כותרת MDI.
      expect(classify([refusal]).window, isNull);
    });

    test('שאלה מזוהה גם לפי טקסט, כשהמזהים שונים', () {
      const english = ResponsaDialogSnapshot(
        title: 'Information',
        buttons: [(id: 106, text: '&Yes'), (id: 107, text: '&No')],
      );
      expect(classify([english]).state, ResponsaSearchState.asked);
    });

    test('בלי טקסט הודעה', () {
      const bare = ResponsaDialogSnapshot(
        title: 'מידע',
        buttons: [(id: 2, text: 'אישור')],
      );
      final outcome = classify([bare]);
      expect(outcome.state, ResponsaSearchState.refused);
      expect(outcome.message, isNull);
    });
  });

  group('עוד אין תשובה', () {
    test('חלון התקדמות', () {
      expect(classify([progress]).state, ResponsaSearchState.pending);
    });

    test('כלום', () {
      expect(classify(const []).state, ResponsaSearchState.pending);
    });

    test('חלון MDI חדש שאינו תוצאות (שחזור סשן)', () {
      expect(
        classify(const [], ['שו"ת תורת יקותיאל דיינים סימן א']).state,
        ResponsaSearchState.pending,
      );
    });
  });

  group('זיהוי דיאלוגים לפי כותרת', () {
    const search = ResponsaVersionProfile.searchHints;
    const summaryHints = ResponsaVersionProfile.searchSummaryHintsDefault;
    const progressHints = ResponsaVersionProfile.searchProgressHintsDefault;

    test('ארבעת דיאלוגי החיפוש', () {
      // הטבלאי נפסל במבנה (אין בו שדה 1233 יחיד), לא בכותרת.
      for (final title in [
        'חיפוש קל',
        'חיפוש טבלאי',
        'חיפוש מתקדם',
        'חיפוש בניסוח חופשי',
      ]) {
        expect(ResponsaDiscovery.titleMatches(title, search), isTrue);
      }
    });

    test('מודאלי החיפוש אינם דיאלוג חיפוש', () {
      for (final title in ['2543 תוצאות', 'מידע', 'מצב התקדמות', 'עיון']) {
        expect(ResponsaDiscovery.titleMatches(title, search), isFalse);
      }
    });

    test('סיכום והתקדמות', () {
      expect(
        ResponsaDiscovery.titleMatches('2543 תוצאות', summaryHints),
        isTrue,
      );
      expect(ResponsaDiscovery.titleMatches('חיפוש קל', summaryHints), isFalse);
      expect(
        ResponsaDiscovery.titleMatches('מצב התקדמות', progressHints),
        isTrue,
      );
    });
  });

  group('חיפוש מתקדם', () {
    test('שגיאה בשאילתה: ההודעה של בר אילן', () {
      final outcome = classify(const [
        ResponsaDialogSnapshot(
          title: 'שגיאה בהגדרת השאילתה',
          buttons: [(id: 1, text: 'אישור')],
          message: 'המרחק המקסימלי קטן\nמהמרחק המינימלי.',
        ),
      ]);
      expect(outcome.state, ResponsaSearchState.invalid);
      expect(outcome.message, 'המרחק המקסימלי קטן מהמרחק המינימלי.');
    });

    test('ניהול הצורות נפתח: בר אילן ממתין למשתמש', () {
      final outcome = classify(const [
        ResponsaDialogSnapshot(title: '  ניהול הצורות'),
      ]);
      expect(outcome.state, ResponsaSearchState.forms);
    });

    test('תיבה נלחצת רק כשהכיתוב שלה מתאים למזהה (נמדד ב-CD25)', () {
      expect(
        ResponsaSearchSetup.labelMatches(
          ResponsaSearchSetup.showFormsId,
          ' &הצג חלון ניהול הצורות',
        ),
        isTrue,
      );
      expect(
        ResponsaSearchSetup.labelMatches(
          ResponsaSearchSetup.allDatabasesId,
          ' חיפוש בכל ה&מאגרים  ',
        ),
        isTrue,
      );
      expect(
        ResponsaSearchSetup.labelMatches(
          ResponsaSearchSetup.abbreviationsId,
          'כולל &ראשי תיבות',
        ),
        isTrue,
      );
      // ב"חיפוש טבלאי" 1173 הוא אותה תיבה, אבל מזהה במהדורה אחרת עשוי להיות
      // פקד אחר.
      expect(
        ResponsaSearchSetup.labelMatches(
          ResponsaSearchSetup.showFormsId,
          'בתוך פסקה',
        ),
        isFalse,
      );
    });

    test('ההגדרות שלא נקבעו אינן נוגעות בתיבות', () {
      expect(ResponsaSearchSetup.none.checks, isEmpty);
      expect(
        const ResponsaSearchSetup(
          advanced: true,
          allDatabases: false,
          abbreviations: true,
        ).checks,
        {
          ResponsaSearchSetup.allDatabasesId: false,
          ResponsaSearchSetup.abbreviationsId: true,
        },
      );
    });
  });
}
