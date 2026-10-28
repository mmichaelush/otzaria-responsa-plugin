import 'package:test/test.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';

/// כל הרפיה באימות היא ספר שגוי שמדווח כהצלחה, וכל החמרה היא ספר תקין
/// שהמשתמש אינו מקבל; המקרים כאן לקוחים מפתיחות אמיתיות.
void main() {
  List<String> verify({
    required String window,
    required String selectedResult,
    required String usedRef,
    String? expectedTitle,
    bool selectedIsUniqueExact = false,
  }) => ResponsaAutomation.verifyOpened(
    window: window,
    selectedResult: selectedResult,
    usedRef: usedRef,
    expectedTitle: expectedTitle,
    selectedIsUniqueExact: selectedIsUniqueExact,
  );

  group('קיצור של שם המחבר בסולם', () {
    const expected = "חדושי ר' שמעון יהודא הכהן שקופ יבמות";

    test('החלון של הספר הנכון (נמדד חי ב-CD25) עובר', () {
      expect(
        verify(
          window: "חידושי ר' שמעון שקופ יבמות תוכן העניינים",
          selectedResult: "חידושי ר' שמעון שקופ יבמות תוכן העניינים",
          usedRef: "חדושי ר' שמעון שקופ יבמות",
          expectedTitle: expected,
        ),
        isEmpty,
      );
      expect(
        verify(
          window: "חידושי ר' שמעון שקופ יבמות תוכן העניינים",
          selectedResult: "חידושי ר' שמעון שקופ יבמות תוכן העניינים",
          usedRef: 'חדושי שקופ יבמות',
          expectedTitle: expected,
        ),
        isEmpty,
      );
    });

    test('ספר אחר שמכיל את מילות הקיצור נפסל', () {
      // ראש וסוף הכותרת בלבד: `coversTitle` לבדו היה מקבל אותו.
      expect(
        verify(
          window: 'חידושי רבי עקיבא איגר יבמות',
          selectedResult: 'חידושי רבי עקיבא איגר יבמות',
          usedRef: 'חדושי יבמות',
          expectedTitle: expected,
        ),
        contains('expectedTitle'),
      );
      expect(
        verify(
          window: 'חידושי רבי עקיבא איגר שקופ יבמות',
          selectedResult: 'חידושי רבי עקיבא איגר שקופ יבמות',
          usedRef: 'חדושי שקופ יבמות',
          expectedTitle: expected,
        ),
        contains('expectedTitle'),
      );
      expect(
        ResponsaAutomation.hasPlausibleResult(
          ['חידושי רבי עקיבא איגר שקופ יבמות'],
          'חדושי שקופ יבמות',
          expected,
        ),
        isFalse,
      );
    });
  });

  group('פתיחה תקינה עוברת', () {
    test('יחידה בתוך ספר, דרך מקום בתוכה (`גינת ורדים כללים`)', () {
      expect(
        verify(
          window: 'גינת ורדים כללים כלל א',
          selectedResult: 'גינת ורדים כללים כלל א',
          usedRef: 'גינת ורדים כלל א',
          expectedTitle: 'גינת ורדים כללים',
        ),
        isEmpty,
      );
    });

    test('בר אילן פתח בדיוק את המקום שביקשנו, ומשמיט את שם היחידה', () {
      // נמדד חי (3.10.2026): "גינת ורדים כלל א" נפתח בחלון בשם הזה בדיוק.
      expect(
        verify(
          window: 'גינת ורדים כלל א',
          selectedResult: 'גינת ורדים כלל א',
          usedRef: 'גינת ורדים כלל א',
          expectedTitle: 'גינת ורדים כללים',
          selectedIsUniqueExact: true,
        ),
        isEmpty,
      );
    });

    test('בלי תוצאה יחידה מדויקת אין ויתור על הכותרת המצופה', () {
      // שתי תוצאות בשם הזה בדיוק (גם שו"ת גינת ורדים): אולי הספר האחר.
      expect(
        verify(
          window: 'גינת ורדים כלל א',
          selectedResult: 'גינת ורדים כלל א',
          usedRef: 'גינת ורדים כלל א',
          expectedTitle: 'גינת ורדים כללים',
        ),
        contains('expectedTitle'),
      );
    });

    test('כותרת החלון מוסיפה מיקום', () {
      expect(
        verify(
          window: 'שו"ת תורת יקותיאל דיינים סימן א',
          selectedResult: 'שו"ת תורת יקותיאל דיינים',
          usedRef: 'תורת יקותיאל דיינים',
          expectedTitle: 'תורת יקותיאל דיינים',
        ),
        isEmpty,
      );
    });

    test('מדף שנדבק לשם אינו מופיע בכותרת החלון', () {
      // `מדרש רבה (תורה) > שמות רבה (וילנא)` — התוכנה מכנה את החלון
      // בשם החיבור בלבד.
      expect(
        verify(
          window: 'שמות רבה (וילנא) פרשת שמות פרשה א',
          selectedResult: 'שמות רבה (וילנא)',
          usedRef: 'שמות רבה',
          expectedTitle: 'מדרש רבה (תורה) שמות רבה (וילנא)',
        ),
        isEmpty,
      );
    });

    test('הסתייגות בצד אחד בלבד אינה פוסלת', () {
      expect(
        verify(
          window: 'אוצר מדרשים (אייזנשטיין) היכלות',
          selectedResult: 'אוצר מדרשים (אייזנשטיין) היכלות',
          usedRef: 'היכלות',
          expectedTitle: "היכלות (עמ' 108-126)",
        ),
        isEmpty,
      );
    });

    test('אות שימוש שהתוכנה מוסיפה', () {
      expect(
        verify(
          window: 'פירוש המשנה לרמב"ם מסכת הוריות',
          selectedResult: 'פירוש המשנה לרמב"ם מסכת הוריות',
          usedRef: 'רמב"ם הוריות',
          expectedTitle: 'רמב"ם הוריות',
        ),
        isEmpty,
      );
    });
  });

  group('פתיחה שגויה נפסלת', () {
    test('שם החיבור לבדו פותח את הספר שמעליו (`גינת ורדים הקדמה`)', () {
      expect(
        verify(
          window: 'גינת ורדים הקדמה',
          selectedResult: 'גינת ורדים',
          usedRef: 'גינת ורדים',
          expectedTitle: 'גינת ורדים כללים',
        ),
        ['expectedTitle'],
      );
    });

    test('מהדורה אחרת', () {
      // `שמות רבה (שנאן)` ו-`שמות רבה (וילנא)` הם שני ספרים.
      expect(
        verify(
          window: 'שמות רבה (וילנא) פרשת שמות פרשה א',
          selectedResult: 'שמות רבה (שנאן)',
          usedRef: 'שמות רבה',
          expectedTitle: 'מדרש רבה (תורה) שמות רבה (שנאן)',
        ),
        contains('selectedEdition'),
      );
    });

    test('חיבור אחר על אותה מסכת', () {
      // `שרידי אש` חולק עם `בית הבחירה` את `על הש"ס ברכות`.
      expect(
        verify(
          window: 'שרידי אש על הש"ס ברכות',
          selectedResult: 'שרידי אש על הש"ס ברכות',
          usedRef: 'על הש"ס ברכות',
          expectedTitle: 'בית הבחירה למאירי על הש"ס ברכות',
        ),
        contains('expectedTitle'),
      );
    });

    test('כרך אחר של אותו חיבור', () {
      expect(
        verify(
          window: 'נחלת דוד מסכת בבא קמא דף ב עמוד א',
          selectedResult: 'נחלת דוד בבא קמא',
          usedRef: 'נחלת דוד פסחים',
          expectedTitle: 'נחלת דוד פסחים',
        ),
        isNotEmpty,
      );
    });

    test('השורה שנבחרה אינה החלון שנפתח', () {
      expect(
        verify(
          window: 'דברים רבה (וילנא) פרשת דברים פרשה א',
          selectedResult: 'בראשית רבה (וילנא)',
          usedRef: 'בראשית רבה',
          expectedTitle: 'מדרש רבה (תורה) בראשית רבה (וילנא)',
        ),
        contains('selectedResult'),
      );
    });

    test('אסימון גנרי יחיד אינו מבדיל, והבדיקות האחרות תופסות', () {
      // גבול ידוע: `דברים` מוכל גם ב-`דברים רבה`, ולכן שם גנרי בן מילה אחת
      // מוגן על ידי בחירת השורה ולא על ידי האימות.
      expect(
        verify(
          window: 'דברים רבה (וילנא) פרשת דברים פרשה א',
          selectedResult: 'דברים',
          usedRef: 'דברים',
          expectedTitle: 'דברים',
        ),
        isEmpty,
      );
    });
  });

  test('בלי כותרת מצופה — שתי הבדיקות האחרות עדיין פועלות', () {
    expect(
      verify(
        window: 'שרידי אש על הש"ס ברכות',
        selectedResult: 'שרידי אש על הש"ס ברכות',
        usedRef: 'שרידי אש ברכות',
      ),
      isEmpty,
    );
    expect(
      verify(
        window: 'שרידי אש על הש"ס ברכות',
        selectedResult: 'מהרש"א פסחים',
        usedRef: 'מהרש"א פסחים',
      ),
      isNotEmpty,
    );
  });

  group('uniqueExactResult', () {
    test('האינדקס של התוצאה המדויקת היחידה', () {
      expect(
        ResponsaAutomation.uniqueExactResult([
          'שו"ת גינת ורדים חלק אורח חיים כלל א',
          'גינת ורדים כלל א',
        ], 'גינת ורדים כלל א'),
        1,
      );
    });

    test('אין, או יש כמה: null', () {
      expect(
        ResponsaAutomation.uniqueExactResult([
          'שושנת העמקים כלל א',
        ], 'גינת ורדים כלל א'),
        isNull,
      );
      expect(
        ResponsaAutomation.uniqueExactResult([
          'גינת ורדים כלל א',
          'גינת ורדים כלל א',
        ], 'גינת ורדים כלל א'),
        isNull,
      );
    });
  });

  group('שם הספר עצמו, אחרי שם שמעליו (`משנה ברורה וביאור הלכה`)', () {
    // נמדד חי ב-CD25 (15.10.2026): "ביאור הלכה" מחזיר עשר תוצאות, ורק אחת
    // מתחילה בשם; החלון שנפתח הוא "ביאור הלכה סימן א".
    const results = [
      'דרך אמונה - ביאור ההלכה הלכות כלאים פרק א',
      'שקל הקודש - ביאור ההלכה הלכות שקלים פרק א',
      'ביאור הלכה סימן א',
    ];
    const title = 'משנה ברורה וביאור הלכה ביאור הלכה';

    test('החלון בשם הספר בלבד עובר', () {
      expect(ResponsaAutomation.uniqueNamedResult(results, 'ביאור הלכה'), 2);
      expect(
        ResponsaAutomation.verifyOpened(
          window: 'ביאור הלכה סימן א',
          selectedResult: 'ביאור הלכה סימן א',
          usedRef: 'ביאור הלכה',
          expectedTitle: title,
          selectedIsUniqueNamed: true,
        ),
        isEmpty,
      );
      expect(
        ResponsaAutomation.hasPlausibleResult(results, 'ביאור הלכה', title),
        isTrue,
      );
    });

    test('בלי תוצאה יחידה בשם הזה — נפסל', () {
      expect(
        ResponsaAutomation.uniqueNamedResult([
          ...results,
          'ביאור הלכה (שונה) סימן א',
        ], 'ביאור הלכה'),
        isNull,
      );
      expect(
        verify(
          window: 'ביאור הלכה סימן א',
          selectedResult: 'ביאור הלכה סימן א',
          usedRef: 'ביאור הלכה',
          expectedTitle: title,
        ),
        contains('expectedTitle'),
      );
    });

    test('שם הספר שמעל אינו שם הספר עצמו', () {
      // `שבט הלוי` פותח את שבט הלוי, לא את חלק יא.
      expect(
        ResponsaAutomation.isOwnName('שבט הלוי חלק יא', 'שבט הלוי'),
        isFalse,
      );
      expect(
        ResponsaAutomation.isOwnName(
          'משנה ברורה וביאור הלכה משנה ברורה',
          'משנה ברורה',
        ),
        isFalse,
      );
    });

    test('שם של מילה אחת אינו מספיק', () {
      expect(
        ResponsaAutomation.isOwnName('גינת ורדים הקדמה', 'הקדמה'),
        isFalse,
      );
    });

    test('חלון שאינו מתחיל בשם — נפסל', () {
      expect(
        ResponsaAutomation.verifyOpened(
          window: 'דרך אמונה - ביאור ההלכה הלכות כלאים פרק א',
          selectedResult: 'דרך אמונה - ביאור ההלכה הלכות כלאים פרק א',
          usedRef: 'ביאור הלכה',
          expectedTitle: title,
          selectedIsUniqueNamed: true,
        ),
        contains('expectedTitle'),
      );
    });

    test('"ביאור הלכות" אינו מתחיל בשם "ביאור הלכה"', () {
      expect(
        ResponsaAutomation.startsWithName('ביאור הלכה', 'ביאור הלכות שבת'),
        isFalse,
      );
    });
  });

  group('חלק אחר (`שבט הלוי חלק יא`)', () {
    // נמדד חי ב-CD25 (15.10.2026): "שבט הלוי חלק יא" מחזיר 20 תוצאות, ובכל
    // אחת כל המילים; לפני התיקון נבחר ונפתח "חלק א סימן יא", והאימות עבר.
    const results = [
      'שו"ת שבט הלוי תוכן העניינים חלק יא - אורח חיים',
      'שו"ת שבט הלוי תוכן העניינים חלק יא - קונטרס הקדשים',
      'שו"ת שבט הלוי חלק א סימן יא',
      'שו"ת שבט הלוי חלק ו - קונטרס הקדשים סימן יא',
      'שו"ת שבט הלוי חלק י סימן יא',
      'שו"ת שבט הלוי חלק יא הקדמה',
      'שו"ת שבט הלוי חלק יא סימן יא',
      'שו"ת שבט הלוי חלק יא - קונטרס הקדשים סימן א',
    ];

    test('נבחרת תחילת החלק', () {
      expect(
        results[ResponsaAutomation.bestResult(
          results,
          'שבט הלוי חלק יא',
          'שבט הלוי חלק יא',
        )],
        'שו"ת שבט הלוי חלק יא הקדמה',
      );
    });

    test('חלון של חלק אחר נפסל', () {
      expect(
        verify(
          window: 'שו"ת שבט הלוי חלק א סימן יא',
          selectedResult: 'שו"ת שבט הלוי חלק א סימן יא',
          usedRef: 'שבט הלוי חלק יא',
          expectedTitle: 'שבט הלוי חלק יא',
        ),
        contains('part'),
      );
    });

    test('הספר שבתוך החלק אינו סתירה', () {
      expect(
        verify(
          window: 'שו"ת שבט הלוי חלק יא - קונטרס הקדשים סימן א',
          selectedResult: 'שו"ת שבט הלוי חלק יא - קונטרס הקדשים סימן א',
          usedRef: 'שבט הלוי חלק יא - קונטרס הקדשים',
          expectedTitle: 'שבט הלוי חלק יא - קונטרס הקדשים',
        ),
        isEmpty,
      );
    });

    test('רק מספר באותיות נבדק', () {
      expect(
        ResponsaHebrew.partsConflict('אבני נזר חלק אורח חיים', 'חלק יורה דעה'),
        isFalse,
      );
      expect(ResponsaHebrew.partsConflict('X חלק ראשון', 'X חלק ב'), isFalse);
      expect(ResponsaHebrew.partsConflict('X חלק ט"ו', 'X חלק טו'), isFalse);
      expect(ResponsaHebrew.partsConflict('X כרך ב', 'X כרך ג'), isTrue);
      expect(ResponsaHebrew.partsConflict('X חלק ב', 'X סימן ב'), isFalse);
    });
  });

  group('hasPlausibleResult', () {
    test('תוצאה שהיא בדיוק ההפניה (מקום בתוך יחידה) עוצרת את הסולם', () {
      expect(
        ResponsaAutomation.hasPlausibleResult(
          ['גינת ורדים כלל א', 'שו"ת גינת ורדים חלק אורח חיים כלל א סימן א'],
          'גינת ורדים כלל א',
          'גינת ורדים כללים',
        ),
        isTrue,
      );
    });

    test('כמה תוצאות שהן בדיוק ההפניה: עמום, ולא עוצר את הסולם', () {
      expect(
        ResponsaAutomation.hasPlausibleResult(
          ['גינת ורדים כלל א', 'גינת ורדים כלל א'],
          'גינת ורדים כלל א',
          'גינת ורדים כללים',
        ),
        isFalse,
      );
    });

    test('תוצאה שאינה קשורה נפסלת', () {
      expect(
        ResponsaAutomation.hasPlausibleResult(
          ['שושנת העמקים כלל א'],
          'גינת ורדים כלל א',
          'גינת ורדים כללים',
        ),
        isFalse,
      );
    });
  });
}
