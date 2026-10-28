import 'package:responsa_helper/src/text/responsa_names.dart';

/// צומת אחד בשרשרת מהשורש ועד הספר, כפי שהיא נדרשת לפירוק.
typedef ResponsaChainNode = ({int level, int param, String name});

/// מקור האמת הוא סוג הצומת ב-`lParam` ולא שמו: 1-2 קטגוריה, 3 מחבר/סדרה,
/// 4 החיבור, 5+ יחידות. רשימת שמות לעולם אינה שלמה.
class ResponsaStructure {
  ResponsaStructure._();

  /// סוג הצומת: הבייט הנמוך של המילה הגבוהה ב-`lParam`.
  static int kindOf(int param) => (param >> 16) & 0xFF;

  /// סוג הצומת של חיבור.
  static const int workKind = 4;

  /// סוג הצומת של מחבר או סדרה שמעל החיבור. תמיד חלק מהשם.
  static const int collectionKind = 3;

  /// הסיום `(?=[\s"'׳״]|$)` ולא `\b` - ב-Dart גבול המילה הוא ASCII ואות
  /// עברית אינה תו-מילה עבורו.
  static final RegExp _labelLead = RegExp(
    r'''^(ספרי|ספרות|מפרשי|מפרשים|ביאורים|פירושים|ראשונים|אחרונים'''
    r'''|מדרשי|דרשות|כתבי עת|אנציקלופד)(?=[\s"'׳״]|$)''',
  );

  /// צירופים שמופיעים רק בתוויות מיון.
  static final RegExp _labelPart = RegExp(
    r'(ונושאי כליו|ומפרשיו|ומפרשיהם|וחיבורים|מפתח| - ראשונים| - אחרונים)',
  );

  static const Set<String> _genericLabels = {
    'ערכים',
    'מפתחות',
    'שונות',
    'כללי',
    'נספחים',
  };

  /// סוג 2 משמש גם לתווית מיון וגם לשם חיבור (`שולחן ערוך`); בלי ההבחנה
  /// `שולחן ערוך > חושן משפט` מוצג כ-`חושן משפט` בלבד.
  static bool isCategoryLabel(String name, int level) {
    // שורש הוא תמיד קטגוריה. הוא תווית המיון העליונה ואינו שם של חיבור.
    if (level == 0) return true;
    final core = ResponsaNames.coreOf(name);
    if (core.isEmpty) return true;
    if (_genericLabels.contains(core)) return true;
    return _labelLead.hasMatch(core) || _labelPart.hasMatch(core);
  }

  /// כרך או חלק בלבד (`כרך א (א - אכסנאי)`): השם לבדו אינו מזהה ספר, ובר אילן
  /// עצמו קורא לו `אנציקלופדיה תלמודית כרך א`.
  static final RegExp _volumeName = RegExp(
    r'''^(כרך|כרכים|חלק|חלקים|קובץ|גליון|מהדורה)(?=[\s"'׳״(]|$)''',
  );

  /// השם שבו בר אילן מכיר חיבור שהעץ קורא לו אחרת. `משנה תורה לרמב"ם הלכות
  /// קרבן פסח` אינו מזוהה (0 תוצאות, ו-`הלכות קרבן פסח` לבדו פותח קודם את כל
  /// המפרשים); `רמב"ם הלכות קרבן פסח` מזוהה והוא גם שמו בקטלוג הספרים.
  static const Map<String, String> _spokenNames = {'משנה תורה לרמב"ם': 'רמב"ם'};

  static String _spokenName(String name) =>
      _spokenNames[ResponsaNames.coreOf(name)] ?? name;

  static bool isVolumeName(String name) =>
      _volumeName.hasMatch(ResponsaNames.coreOf(name));

  /// תווית מעל החיבור נשארת בקטגוריה, אחרת היא נכללת בשם המצופה ופוסלת פתיחה
  /// תקינה. `null` כשאין חיבור - צומת קטגוריה שסווג כספר.
  ///
  /// [workIndex] — מקום החיבור בשרשרת. הוא אינו נגזר מאורך השם: בכרך
  /// (`isVolumeName`) מצטרף לשם החיבור שמעליו, ותוויות כמו `ערכים` שביניהם
  /// נשארות מחוץ לשם.
  static ({
    List<String> nameNodes,
    List<String> categoryNodes,
    List<String> classificationNodes,
    int workOffset,
    int workIndex,
  })?
  decompose(List<ResponsaChainNode> chain) {
    var work = -1;
    for (var i = 0; i < chain.length; i++) {
      if (kindOf(chain[i].param) == workKind) work = i;
    }
    if (work < 0) return null;

    var start = work;
    while (start > 0) {
      final parent = chain[start - 1];
      final kind = kindOf(parent.param);
      final isName =
          (kind == collectionKind || kind == 2) &&
          !isCategoryLabel(parent.name, parent.level);
      if (!isName) break;
      start--;
    }

    final categories = [for (final node in chain.sublist(0, start)) node.name];
    final names = [
      for (final node in chain.sublist(start)) _spokenName(node.name),
    ];

    // כרך: שמות הקטגוריות שמעליו עד השורש, בלי התוויות הגנריות (`ערכים`) —
    // `אנציקלופדיה תלמודית הערות כרך א`, כמו בקטלוג של בר אילן. תווית מיון
    // (`ספרי מחשבה ומוסר - אחרונים`, גם כשהיא השורש) עוצרת את העלייה.
    // הקטגוריה נשארת כולה לשיוך באוצריא.
    if (isVolumeName(chain[work].name)) {
      final above = <String>[];
      for (var i = start - 1; i >= 0; i--) {
        final name = chain[i].name;
        final core = ResponsaNames.coreOf(name);
        if (core.isEmpty || _genericLabels.contains(core)) continue;
        // אנציקלופדיה שורשית היא שם חיבור, ולא תווית מיון.
        final isWork = core.startsWith('אנציקלופד');
        if (!isWork && isCategoryLabel(name, chain[i].level)) break;
        above.insert(0, name);
        if (chain[i].level == 0) break;
      }
      if (above.isNotEmpty) {
        return (
          nameNodes: [...above, ...names],
          categoryNodes: categories,
          classificationNodes: categories,
          workOffset: above.length + work - start,
          workIndex: work,
        );
      }
    }

    final offset = work - start;
    return (
      nameNodes: names,
      categoryNodes: categories,
      classificationNodes: [...categories, ...names.sublist(0, offset)],
      workOffset: offset,
      workIndex: work,
    );
  }
}
