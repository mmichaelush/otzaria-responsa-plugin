import 'package:responsa_helper/src/native/responsa_catalog_builder.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
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
        containsAllInOrder(['גינת ורדים כללים כלל א', 'גינת ורדים כלל א']),
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
    test('`*` בראש השם אינו מבטל את זיהוי המקטע', () {
      expect(ResponsaCatalogBuilder.isSection('*סימן רצז', 0), isTrue);
      expect(ResponsaCatalogBuilder.isSection('סימן רצז', 0), isTrue);
      expect(ResponsaCatalogBuilder.isSection('*גינת ורדים', 0), isFalse);
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
