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

  test('חיפוש לפי מפתח', () {
    expect(index.byKey('4')?.title, 'משנה ברורה');
    expect(index.byKey('404'), isNull);
    expect(index.length, 5);
  });
}
