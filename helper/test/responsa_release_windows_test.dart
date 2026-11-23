import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:test/test.dart';

/// אילו חלונות בר אילן אוטומציה סוגרת לפני פתיחה. דיווח משתמש (23.11.2026):
/// "כל פעם שפותחים ספר בבר אילן דרך אוצריא זה דורס חלונות שכבר היו פתוחים בלי
/// סיבה". חלון שנסגר הוא קריאה שהמשתמש איבד, ולכן סוגרים רק כמה שחייבים,
/// ורק כשהתקרה של בר אילן (כ-22 חלונות) באמת מאיימת.
void main() {
  final profile = ResponsaVersionProfile.forVersion(25);
  final soft = profile.mdiSoftLimit;
  final hard = profile.mdiHardLimit;

  List<String> windows(int count) => [
    for (var i = 0; i < count; i++) 'חלון $i',
  ];

  Set<String> release(
    List<String> titles, {
    List<String> opened = const [],
    String? active,
  }) => ResponsaAutomation.windowsToRelease(
    titles: titles,
    opened: opened,
    active: active,
    profile: profile,
  );

  test('מתחת לסף לא נסגר דבר, גם אם כולם נפתחו מאוצריא', () {
    final titles = windows(soft - 1);
    expect(release(titles, opened: titles), isEmpty);
  });

  test(
    'בסף עצמו נסגר חלון אחד בלבד (הישן ביותר שאוצריא פתחה), לא ירידה גדולה',
    () {
      final titles = windows(soft);
      final closed = release(titles, opened: titles);
      expect(closed, {titles.first});
    },
  );

  test('נסגרים רק כמה שצריך כדי להשאיר מקום לחלון הבא', () {
    final titles = windows(hard);
    final closed = release(titles, opened: titles);
    expect(closed, hasLength(hard - soft + 1));
    expect(closed, containsAll(titles.take(hard - soft + 1)));
  });

  test('חלונות של המשתמש עצמו אינם נסגרים לפני התקרה', () {
    for (var count = soft; count < hard; count++) {
      expect(release(windows(count)), isEmpty, reason: '$count חלונות');
    }
  });

  test('בתקרה עצמה, בלי אף חלון של אוצריא: נסגרים כמה שצריך, בלי הפעיל', () {
    final titles = windows(hard);
    final closed = release(titles, active: 'חלון 0');
    expect(closed, hasLength(hard - soft + 1));
    expect(closed, isNot(contains('חלון 0')));
  });

  test('מעל התקרה אין תקרה במהדורה הזו: לא נסגר אפילו חלון', () {
    // 119 חלונות פתוחים בבר אילן 34 אצל משתמש, והכול עובד: שום דבר לא נסגר.
    final titles = windows(119);
    expect(release(titles, opened: titles.take(30).toList()), isEmpty);
    expect(release(titles), isEmpty);
  });

  test('החלון הפעיל אינו נסגר גם כשפתחה אותו אוצריא', () {
    final titles = windows(soft);
    final closed = release(titles, opened: titles, active: titles.first);
    expect(closed, isNot(contains(titles.first)));
    expect(closed, hasLength(1));
  });

  test('חלון שאוצריא פתחה והמשתמש כבר סגר אינו נספר', () {
    final titles = windows(soft);
    final closed = release(titles, opened: ['חלון שנסגר', ...titles.skip(3)]);
    expect(closed, {titles[3]});
  });

  test('כותרת ריקה לעולם אינה נסגרת', () {
    final titles = ['', ...windows(hard - 1)];
    final closed = release(titles, opened: ['', ...titles]);
    expect(closed, isNot(contains('')));
  });

  test('"לא נפתח חלון" נחשב סירוב של התקרה רק כשהחלונות בטווח שלה', () {
    expect(profile.nearsWindowCap(soft - 1), isFalse);
    expect(profile.nearsWindowCap(soft), isTrue);
    expect(profile.nearsWindowCap(hard), isTrue);
    expect(profile.nearsWindowCap(119), isFalse);
  });
}
