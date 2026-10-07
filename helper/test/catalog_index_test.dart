import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/server/catalog_index.dart';
import 'package:test/test.dart';

ResponsaCatalogBook book(
  String key,
  String title, {
  String path = '',
  String? author,
}) => ResponsaCatalogBook(
  key: key,
  title: title,
  contextPath: path,
  author: author,
);

void main() {
  final index = CatalogIndex([
    book('1', 'חידושי אגדות', path: 'מפרשים ופוסקים על הבבלי/מהרש"א'),
    book('2', 'שו"ת אבני נזר', author: 'רבי אברהם בורנשטיין'),
    book('3', 'אבני נזר על הש"ס', path: 'מפרשים'),
    book('4', 'משנה ברורה'),
    book('5', 'ביאור הלכה על משנה ברורה'),
  ]);

  List<String> keys(String query) => [
    for (final hit in index.search(query)) hit.key,
  ];

  test('חיפוש בתוך קטגוריה כולל את תתי-הקטגוריות בלבד', () {
    List<String> inPath(String query, String path) => [
      for (final hit in index.search(query, path: path)) hit.key,
    ];
    expect(inPath('אגדות', 'מפרשים ופוסקים על הבבלי'), ['1']);
    expect(inPath('אבני נזר', 'מפרשים'), ['3']);
    // "מפרשים" אינו קידומת של "מפרשים ופוסקים על הבבלי" ברמת הקטגוריה.
    expect(inPath('אגדות', 'מפרשים'), isEmpty);
  });

  test('רמה בעץ: תתי-קטגוריות עם ספירה, וספרים שבה', () {
    final root = index.browse('');
    expect(root.categories, [
      (
        name: 'מפרשים ופוסקים על הבבלי',
        path: 'מפרשים ופוסקים על הבבלי',
        bookCount: 1,
      ),
      (name: 'מפרשים', path: 'מפרשים', bookCount: 1),
    ]);
    expect([for (final b in root.books) b.key], ['2', '4', '5']);
    final inner = index.browse('מפרשים ופוסקים על הבבלי');
    expect(inner.categories.single.name, 'מהרש"א');
    expect(inner.books, isEmpty);
    expect(index.browse('אין כזה').exists, isFalse);
  });

  test('בעיון: קטגוריות וספרים בסדר העץ של בר אילן, לא בסדר הכותרות', () {
    final tree = CatalogIndex([
      // הקטלוג נטען ממוין לפי כותרת; treeOrder הוא המקום בעץ.
      const ResponsaCatalogBook(
        key: 'a',
        title: 'א',
        contextPath: 'ספרות חז"ל',
        treeOrder: 5,
      ),
      const ResponsaCatalogBook(
        key: 'b',
        title: 'ב',
        contextPath: 'תנ"ך',
        treeOrder: 1,
      ),
      const ResponsaCatalogBook(
        key: 'c',
        title: 'ג',
        contextPath: 'ספרות חז"ל',
        treeOrder: 4,
      ),
      const ResponsaCatalogBook(
        key: 'd',
        title: 'ד',
        contextPath: 'ספרות חז"ל/משנה',
        treeOrder: 3,
      ),
    ]);
    expect(
      [for (final c in tree.browse('').categories) c.name],
      ['תנ"ך', 'ספרות חז"ל'],
    );
    expect(
      [for (final b in tree.browse('ספרות חז"ל').books) b.key],
      ['c', 'a'],
    );
  });

  test('שאילתה ריקה אינה מחזירה דבר', () {
    expect(index.search(''), isEmpty);
    expect(index.search('   '), isEmpty);
    expect(index.search('""'), isEmpty);
  });

  test('כותרת זהה קודמת לכותרת שמכילה אותה', () {
    expect(keys('משנה ברורה'), ['4', '5']);
  });

  test('כתיב חסר מוצא כתיב מלא', () {
    expect(keys('חדושי אגדות'), ['1']);
  });

  test('גרשיים אינם משנים', () {
    expect(keys('מהרשא'), ['1']);
    expect(keys('מהרש"א'), ['1']);
  });

  test('מחבר שמופיע רק בנתיב נמצא', () {
    expect(keys('מהרש"א אגדות'), ['1']);
  });

  test('מחבר בשדה המחבר נמצא, אחרי התאמות בכותרת', () {
    expect(keys('בורנשטיין'), ['2']);
    expect(keys('אבני נזר'), ['3', '2']);
  });

  test('מילה שאינה בשום מקום פוסלת את הספר', () {
    expect(keys('משנה גמרא'), isEmpty);
  });

  test('מילה שמתחילה בשאילתה, לא תת-מחרוזת באמצע מילה', () {
    final shut = CatalogIndex([
      book('a', 'רשב"א החדשות', path: 'ספרי שאלות ותשובות (שו"ת)/ראשונים'),
      book('b', 'רשב"א', path: 'ספרי שאלות ותשובות (שו"ת)/ראשונים'),
    ]);
    // `שת` (מ"שו"ת") נמצא בנתיב בשניהם; ב"החדשות" הוא באמצע מילה ואינו
    // הופך את הכותרת להתאמה טובה יותר.
    expect([for (final hit in shut.search('שו"ת רשב"א')) hit.key], ['b', 'a']);
  });

  test('אות שימוש בתחילת מילה אינה מסתירה התאמה', () {
    final index = CatalogIndex([book('1', 'שו"ת והרשב"א')]);
    expect(index.search('רשבא'), hasLength(1));
    expect(index.search('שבא'), isEmpty);
  });

  group('חיפוש מחבר כפי שמקלידים אותו', () {
    final authors = CatalogIndex([
      book('10', 'יביע אומר', author: "ר' עובדיה יוסף"),
      book('11', 'אגרות משה', author: "ר' משה פיינשטיין"),
      book('12', 'ברכי יוסף', author: "ר' חיים יוסף דוד אזולאי (חיד\"א)"),
      book('13', 'רב פעלים', author: "ר' יוסף חיים"),
      book('14', 'משנה תורה', author: 'רמב"ם'),
    ]);
    List<String> found(String query) => [
      for (final hit in authors.search(query)) hit.key,
    ];

    test('תואר לפני השם אינו פוסל', () {
      expect(found('הרב עובדיה יוסף'), ['10']);
      expect(found('הגאון רבי משה פיינשטיין זצ"ל'), ['11']);
      expect(found('מרן הרב עובדיה'), ['10']);
    });

    test('ה\' הידיעה לפני שם שרשום בלעדיה', () {
      expect(found('החיד"א'), ['12']);
      expect(found('הרמב"ם'), ['14']);
    });

    test('תואר שהוא חלק מהכותרת עדיין נספר; תואר לבדו אינו מוצא הכול', () {
      expect(found('רב פעלים'), ['13']);
      expect(found('הרב'), isEmpty);
      // מילה אחרת שלא נמצאה עדיין פוסלת.
      expect(found('הרב עובדיה כהן'), isEmpty);
    });
  });

  test('חיפוש לפי מפתח', () {
    expect(index.byKey('4')?.title, 'משנה ברורה');
    expect(index.byKey('404'), isNull);
    expect(index.length, 5);
  });
}
