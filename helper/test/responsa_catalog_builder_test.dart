import 'package:responsa_helper/src/native/responsa_catalog_builder.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:responsa_helper/src/text/responsa_names.dart';
import 'package:test/test.dart';

/// צמתים מהעץ של בר אילן 25, עם ה-param האמיתי (מדאמפ העץ).
List<ResponsaTreeNode> _tree(List<(int, int, String)> rows) => [
  for (var i = 0; i < rows.length; i++)
    ResponsaTreeNode(
      level: rows[i].$1,
      param: rows[i].$2,
      childCount: i + 1 < rows.length && rows[i + 1].$1 > rows[i].$1 ? 1 : 0,
      name: rows[i].$3,
      path: '',
    ),
];

/// גינת ורדים (ר' יוסף תאומים): חיבור שיש לו מקטעים משלו (הקדמה, תוכן),
/// ובתוכו היחידה `כללים`, שגם תחתיה מקטעים.
final _ginatVradim = _tree([
  (0, 131103, 'ספרי מערכות ועניינים'),
  (1, 302092, 'גינת ורדים'),
  (2, 50724865, 'הקדמה'),
  (2, 50724866, 'תוכן העניינים'),
  (2, 393219, 'פתיחה'),
  (3, 319356929, 'מערכה א'),
  (2, 393220, 'כללים'),
  (3, 319356929, 'כלל א'),
  (3, 319356930, 'כלל ב'),
]);

void main() {
  test('ספר שלא נפתח (הפיל את בר אילן) נשאר ספר, בלי מקום', () {
    // `כללים` דולג: הצומת נרשם בלי המקטעים שתחתיו.
    final skipped = [
      for (final node in _ginatVradim.take(7))
        node.name == 'כללים'
            ? ResponsaTreeNode(
                name: node.name,
                param: node.param,
                level: node.level,
                path: node.path,
                childCount: 2,
                skipped: true,
              )
            : node,
    ];
    final rows = ResponsaCatalogBuilder.classify(skipped);
    expect(rows.map((row) => row.title), ['גינת ורדים', 'גינת ורדים כללים']);
    expect(rows.last.anchor, isNull);

    // אותו עץ בלי הסימון: הספר נעלם (זה מה שהסימון מונע).
    final unmarked = _tree([
      for (final node in _ginatVradim.take(7))
        (node.level, node.param, node.name),
    ]);
    expect(ResponsaCatalogBuilder.classify(unmarked).map((row) => row.title), [
      'גינת ורדים',
    ]);
  });

  group('ספר בתוך ספר', () {
    test('גינת ורדים: שתי שורות, והיחידה מסומנת כספר בתוך ספר', () {
      final rows = ResponsaCatalogBuilder.classify(_ginatVradim);

      expect(rows.map((row) => row.title), ['גינת ורדים', 'גינת ורדים כללים']);
      expect(rows.first.nestedInBook, isFalse);
      expect(rows.last.nestedInBook, isTrue);
      expect(rows.last.anchor, 'כלל א');
    });

    test('הסולם נכנס לתוך היחידה, ולא פותח את הספר שמעליה', () {
      final unit = ResponsaCatalogBuilder.classify(_ginatVradim).last;
      final openRef = ResponsaCatalogBuilder.buildOpenRefs([unit]).single;

      final ladder = ResponsaCatalogBuilder.alternativeRefs(unit, openRef);

      expect(openRef, 'גינת ורדים כללים');
      expect(
        ladder,
        containsAllInOrder(['גינת ורדים כלל א', 'גינת ורדים כללים כלל א']),
      );
      // פותח את "גינת ורדים הקדמה", והאימות פוסל אותו אחרי כחמש שניות.
      expect(ladder, isNot(contains('גינת ורדים')));
    });

    test('מקום קודם לתוכן: `כלל א` ולא `מפתח עניינים`', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 65542, 'מפרשים ופוסקים על הבבלי והירושלמי'),
          (1, 131089, 'אחרונים על הבבלי'),
          (2, 298757, 'פורת יוסף'),
          (3, 393217, 'הקדמה ופתיחה'),
          (4, 319356929, 'הקדמה'),
          (3, 393218, 'כללים'),
          (4, 319356928, 'מפתח עניינים'),
          (4, 319356929, 'כלל א'),
        ]),
      );

      final unit = rows.singleWhere((row) => row.leafTitle == 'כללים');
      expect(unit.anchor, 'כלל א');
    });

    test('מקום עם תיאור: רק מילת המקום והמספר', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 131103, 'ספרי מערכות ועניינים'),
          (1, 302092, 'גינת ורדים'),
          (2, 50724865, 'הקדמה'),
          (2, 393220, 'כללים'),
          (3, 319356929, 'כלל א - דיני עדות'),
        ]),
      );

      expect(rows.last.anchor, 'כלל א');
    });
  });

  group('כמה ספרים תחת אותו ספר', () {
    // `חזקוני` עצמו ספר (הקדמה), ותחתיו חמשת החומשים: חלוקה רגילה שהמנתח
    // מכיר, ו-`חזקוני פרק א` עמום בין האחים.
    final rows = ResponsaCatalogBuilder.classify(
      _tree([
        (0, 65540, '(מפרשי תנ"ך (החומש מחולק לפרקים'),
        (1, 131084, 'מפרשי תנ"ך'),
        (2, 277764, 'חזקוני'),
        (3, 50724865, 'הקדמה'),
        (3, 393219, 'בראשית'),
        (4, 302579713, 'פרק א'),
        (3, 393220, 'שמות'),
        (4, 302579713, 'פרק א'),
      ]),
    );

    test('אינם ספר בתוך ספר', () {
      expect(rows.map((row) => row.title), [
        'חזקוני',
        'חזקוני בראשית',
        'חזקוני שמות',
      ]);
      expect(rows.where((row) => row.nestedInBook), isEmpty);
    });

    test('הסולם אינו כולל מקום בלי שם היחידה', () {
      final unit = rows[1];
      final openRef = ResponsaCatalogBuilder.buildOpenRefs([unit]).single;
      expect(
        ResponsaCatalogBuilder.alternativeRefs(unit, openRef),
        isNot(contains('חזקוני פרק א')),
      );
    });
  });

  group('יחידה רגילה', () {
    test('ספר שאינו בתוך ספר: בלי מקום בסולם, ועם שם החיבור', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 65540, '(מפרשי תנ"ך (החומש מחולק לפרקים'),
          (1, 131084, 'מפרשי תנ"ך'),
          (2, 277764, 'חזקוני'),
          (3, 393219, 'בראשית'),
          (4, 302579713, 'פרק א'),
        ]),
      );
      final unit = rows.single;
      final openRef = ResponsaCatalogBuilder.buildOpenRefs([unit]).single;

      final ladder = ResponsaCatalogBuilder.alternativeRefs(unit, openRef);

      expect(unit.nestedInBook, isFalse);
      expect(openRef, 'חזקוני בראשית');
      // `חזקוני פרק א` עמום בין כל חמשת החומשים.
      expect(ladder, isNot(contains('חזקוני פרק א')));
      expect(ladder, contains('חזקוני'));
    });
  });

  group('מקטעים', () {
    test('`*` בראש השם אינו חלק מהמקום', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 131103, 'ספרי מערכות ועניינים'),
          (1, 302092, 'גינת ורדים'),
          (2, 50724865, 'הקדמה'),
          (2, 393220, 'כללים'),
          (3, 319356929, '*כלל א'),
        ]),
      );

      expect(rows.last.anchor, 'כלל א');
    });

    // ערכים מהעץ של CD25. הבדיקה המלאה מול העץ כולו: live_prune_check_test.
    test('הסריקה אינה נכנסת לפרק, לפסוק ולכלל, אבל כן לקבוצה ולקטגוריה', () {
      expect(
        ResponsaCatalogBuilder.mayContainBooks(302579713),
        isFalse,
      ); // פרק א
      expect(
        ResponsaCatalogBuilder.mayContainBooks(319488001),
        isFalse,
      ); // פסוק א
      expect(
        ResponsaCatalogBuilder.mayContainBooks(319356929),
        isFalse,
      ); // *כלל א
      // `הלכות גיטין` מכיל את הספר `סדר הגט`.
      expect(ResponsaCatalogBuilder.mayContainBooks(537329668), isTrue);
      // `משנה` נראה כמקטע בשמו, אבל הוא קטגוריה של מסכתות.
      expect(ResponsaCatalogBuilder.mayContainBooks(131073), isTrue);
      expect(ResponsaCatalogBuilder.mayContainBooks(262912), isTrue); // בראשית
    });

    test('`*` בראש השם אינו מבטל את זיהוי המקטע', () {
      expect(ResponsaCatalogBuilder.isSection('*סימן רצז', 0), isTrue);
      expect(ResponsaCatalogBuilder.isSection('סימן רצז', 0), isTrue);
      expect(ResponsaCatalogBuilder.isSection('*גינת ורדים', 0), isFalse);
    });
  });

  group('חיבורים שהסיווג לפי מקטעים אינו מזהה', () {
    String openRef(ResponsaBookRow row) =>
        ResponsaCatalogBuilder.buildOpenRefs([row]).single;

    test('כרכים של אנציקלופדיה: שם החיבור בכותרת ובהפניה', () {
      // היחידות בכרך (`א (אות)`) אינן מקטעים מוכרים; הכרך הוא הספר, ושמו
      // בלי השורש היה `כרך א` בלבד, שאינו מזהה כלום.
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 65554, 'אנציקלופדיה תלמודית'),
          (1, 131110, 'ערכים'),
          (2, 266510, '(כרך א (א - אכסנאי'),
          (3, 50987009, '(א (אות'),
          (3, 50987010, '(אב א (מוליד'),
          (2, 266511, '(כרך ב (אל תקרי - בוגרת'),
          (3, 50987009, '(אל תקרי (אל'),
        ]),
      );

      expect(rows.map((row) => row.title), [
        'אנציקלופדיה תלמודית כרך א (א - אכסנאי)',
        'אנציקלופדיה תלמודית כרך ב (אל תקרי - בוגרת)',
      ]);
      expect(openRef(rows.first), 'אנציקלופדיה תלמודית כרך א');
      // השיוך לאוצריא נשאר לפי הקטגוריה, כולל `ערכים`.
      expect(rows.first.classificationNodes, ['אנציקלופדיה תלמודית', 'ערכים']);
      // מזהה הכותב הוא של צומת הכרך, לא של הקטגוריה.
      expect(rows.first.workParam, 266510);
    });

    test('כרך תחת תת-קטגוריה: שמה נכנס לשם, כמו `הערות כרך א` ב-32', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 65554, 'אנציקלופדיה תלמודית'),
          (1, 131111, 'הערות'),
          (2, 266510, '(כרך א (א - אכסנאי'),
          (3, 50987009, '(א (אות'),
        ]),
      );

      expect(rows.single.title, 'אנציקלופדיה תלמודית הערות כרך א (א - אכסנאי)');
      expect(openRef(rows.single), 'אנציקלופדיה תלמודית הערות כרך א');
    });

    test('כרך תחת תווית מיון: השם נשאר כמו שהיה', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 131103, 'ספרי מחשבה ומוסר'),
          (1, 131104, 'ספרי מחשבה ומוסר - אחרונים'),
          (2, 266510, 'חלק א'),
          (3, 50987009, 'הקדמה'),
        ]),
      );

      expect(rows.single.title, 'חלק א');
    });

    test('הלכות הרמב"ם: חיבור במישור 0x2000, בשם שבו בר אילן מכיר אותו', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 65546, 'רמב"ם ומפרשיו'),
          (1, 131096, '(משנה תורה לרמב"ם (עם ראב"ד'),
          (2, 537195528, 'הלכות אבל'),
          (3, 50987009, 'הקדמה'),
          (3, 302579713, 'פרק א'),
          (2, 50633224, 'הקדמה ליד החזקה'),
        ]),
      );

      expect(rows.map((row) => row.title), [
        'רמב"ם הלכות אבל',
        'רמב"ם הקדמה ליד החזקה',
      ]);
      expect(openRef(rows.first), 'רמב"ם הלכות אבל');
    });

    test('חיבור שיחידותיו אינן מוכרות הוא ספר אחד', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 131103, 'ספרי חסידות'),
          (1, 313357, 'אגרא דכלה'),
          (2, 393217, 'בראשית'),
          (2, 393218, 'שמות'),
        ]),
      );

      expect(rows.map((row) => row.title), ['אגרא דכלה']);
    });

    test('חיבור שכולו מסמך אחד הוא ספר, והפניה (`- ראה`) אינה', () {
      final rows = ResponsaCatalogBuilder.classify(
        _tree([
          (0, 131103, 'ספרי מחשבה ומוסר'),
          (1, 50609672, 'אגרת השמד'),
          (1, 17103107, 'אגרת רב שרירא גאון - ראה ספרי כללים וסדר הדורות'),
        ]),
      );

      expect(rows.map((row) => row.title), ['אגרת השמד']);
    });

    test('חיבור שיש בו כבר ספר אינו נספר פעם שנייה', () {
      // כמו `גינת ורדים`: הספר הוא היחידה שמקטעיה מוכרים, לא החיבור כולו.
      final rows = ResponsaCatalogBuilder.classify(_ginatVradim);

      expect(rows, hasLength(2));
    });
  });

  group('שם חיבור שהעץ כותב ארוך מזה שבר אילן מכיר', () {
    // דיווח משתמש 28.10.2026 (CD31), ונמדד גם ב-CD25: `חדושי ר' שמעון שקופ
    // יבמות` מזוהה, ואילו `חדושי ר' שמעון יהודא הכהן שקופ יבמות` לא, כי
    // `יהודא הכהן` אינן בכותרת.
    final rows = ResponsaCatalogBuilder.classify(
      _tree([
        (0, 65542, 'מפרשים ופוסקים על הבבלי והירושלמי'),
        (1, 131089, 'אחרונים על הבבלי'),
        (2, 298757, "חדושי ר' שמעון יהודא הכהן שקופ"),
        (3, 393217, 'יבמות'),
        (4, 302579713, 'פרק א'),
      ]),
    );

    test('הסולם מקצר את שם המחבר מהמדויק לגס, אחרי כל החוליות הרגילות', () {
      final row = rows.single;
      final openRef = ResponsaCatalogBuilder.buildOpenRefs([row]).single;
      final ladder = ResponsaCatalogBuilder.alternativeRefs(row, openRef);

      expect(openRef, "חדושי ר' שמעון יהודא הכהן שקופ יבמות");
      expect(
        ladder,
        containsAllInOrder([
          "חדושי ר' שמעון שקופ יבמות",
          "חדושי ר' שמעון יהודא שקופ יבמות",
          'חדושי שקופ יבמות',
        ]),
      );
      // החוליה הרגילה האחרונה קודמת לקיצורים.
      expect(
        ladder.indexOf("חדושי ר' שמעון יהודא הכהן שקופ"),
        lessThan(ladder.indexOf("חדושי ר' שמעון שקופ יבמות")),
      );
    });

    test('שם קצר מארבע מילים אינו מקוצר', () {
      expect(ResponsaNames.withoutInnerWords('חידושי הגר"ח'), isEmpty);
      expect(ResponsaNames.withoutInnerWords("חדושי ר' שקופ"), isEmpty);
      // ארבע מילים: בלי אחת מהאמצע, או ראש וסוף בלבד.
      expect(ResponsaNames.withoutInnerWords("חדושי ר' שמעון שקופ"), [
        "חדושי ר' שקופ",
        'חדושי שקופ',
      ]);
    });
  });

  test('הפרדת הנתיב בשורות היא זו של קורא העץ', () {
    final rows = ResponsaCatalogBuilder.classify(_ginatVradim);
    expect(
      rows.last.refPath,
      [
        'ספרי מערכות ועניינים',
        'גינת ורדים',
        'כללים',
      ].join(ResponsaTreeReader.pathSeparator),
    );
  });
}
