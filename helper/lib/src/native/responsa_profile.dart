/// איך למצוא פקדים ולא איפה הם: מזהים משתנים בין מהדורות, ולכן פקד נמצא לפי
/// מחלקה + טקסט + מבנה. הגרסה אינה שער - היא קובעת רק את דרגת הביטחון.
library;

/// רמזים לזיהוי פקד בודד.
class ControlHints {
  final String role;
  final Set<String> classNames;

  /// מזהי פקד ידועים — ראיה תומכת, לא תנאי.
  final Set<int> controlIds;

  final Set<String> textContains;
  final bool required;

  const ControlHints({
    required this.role,
    required this.classNames,
    this.controlIds = const {},
    this.textContains = const {},
    this.required = true,
  });
}

/// רמזים לזיהוי דיאלוג שלם לפי מחלקה, כותרת ומבנה הילדים.
class DialogHints {
  final String role;
  final String windowClass;
  final Set<String> titleContains;
  final Set<String> titleEquals;
  final bool topLevel;
  final List<ControlHints> controls;

  const DialogHints({
    required this.role,
    required this.windowClass,
    this.titleContains = const {},
    this.titleEquals = const {},
    this.topLevel = true,
    this.controls = const [],
  });
}

/// דרגת הביטחון בגרסה שזוהתה.
enum ResponsaVersionConfidence {
  /// אומתה מקצה לקצה מול התקנה חיה.
  verified,

  /// זוהתה, והמבנה שלה תואם — אך לא נבדקה מקצה לקצה.
  structural,

  /// לא נמצא מבנה תואם.
  unknown,
}

class ResponsaVersionProfile {
  final int? version;
  final String mainWindowClass;

  final int browseCommand;

  /// יוצר את ארבעת דיאלוגי החיפוש; רק מצב החיפוש של המשתמש מוצג, והשאר
  /// קיימים מוסתרים. שליחה חוזרת אינה מציגה את המוסתרים.
  final int searchCommand;

  final DialogHints citationDialogHints;
  final DialogHints infoModalHints;
  final DialogHints searchDialogHints;
  final DialogHints searchSummaryHints;
  final DialogHints searchProgressHints;

  /// תווית העמוד "כתיבת מקורות" בתוך ה-TabControl של דיאלוג העיון.
  final int citationTabIndex;

  /// ב-22 חלונות MDI התוכנה מפסיקה בשקט ליצור חדשים; הסף שמרני.
  final int mdiSoftLimit;

  /// לכמה חלונות לרדת כשמשחררים.
  final int mdiKeep;

  /// מעליו מותר לסגור גם חלונות שאוצריא לא פתחה: שחזור הסשן יכול להעלות
  /// מופע טרי כבר רווי, בלי אף חלון "שלנו".
  final int mdiHardLimit;

  const ResponsaVersionProfile({
    required this.version,
    this.mainWindowClass = 'ResponsaProject',
    this.browseCommand = 32781,
    this.searchCommand = 32857,
    this.citationDialogHints = citationHints,
    this.infoModalHints = infoModalHintsDefault,
    this.searchDialogHints = searchHints,
    this.searchSummaryHints = searchSummaryHintsDefault,
    this.searchProgressHints = searchProgressHintsDefault,
    this.citationTabIndex = 1,
    this.mdiSoftLimit = 12,
    this.mdiKeep = 4,
    this.mdiHardLimit = 20,
  });

  /// הגרסאות שאומתו מקצה לקצה מול התקנה חיה.
  static const Set<int> verifiedVersions = {25};

  ResponsaVersionConfidence get confidence =>
      version != null && verifiedVersions.contains(version)
      ? ResponsaVersionConfidence.verified
      : ResponsaVersionConfidence.structural;

  /// כל גרסה מקבלת אותם רמזים מבניים; ההבדל היחיד הוא [confidence].
  static ResponsaVersionProfile forVersion(int? version) =>
      ResponsaVersionProfile(version: version);

  // הכותרות והתוויות בשלוש שפות הממשק, כפי שהן במשאבי Hebrew.dll,
  // English.dll ו-French.dll. מזהי הפקדים זהים בשלושתן.
  static const DialogHints citationHints = DialogHints(
    role: 'citation',
    windowClass: '#32770',
    titleContains: {'עיון', 'Text'},
    controls: [
      ControlHints(
        role: 'reference_edit',
        classNames: {'Edit'},
        controlIds: {1021},
      ),
      ControlHints(
        role: 'search_button',
        classNames: {'Button'},
        controlIds: {1187},
        textContains: {'חיפוש', 'בצע', 'Search', 'Rechercher'},
      ),
      ControlHints(
        role: 'results_list',
        classNames: {'ListBox'},
        controlIds: {1617},
      ),
      ControlHints(
        role: 'clear_button',
        classNames: {'Button'},
        controlIds: {1062},
        textContains: {'ניקוי', 'Clear', 'Effacer'},
        required: false,
      ),
      ControlHints(
        role: 'show_text_button',
        classNames: {'Button'},
        controlIds: {1},
        textContains: {'הצג', 'Display', 'Afficher'},
        required: false,
      ),
    ],
  );

  /// גם שאלה (כן/לא/ביטול) ולא רק הודעה: שאלה פתוחה חוסמת את התוכנה כמו
  /// הודעה, ובלי כפתור אישור היא לא הייתה נמצאת ולא נסגרת לעולם.
  static const DialogHints infoModalHintsDefault = DialogHints(
    role: 'info_modal',
    windowClass: '#32770',
    titleEquals: {'מידע', 'Information'},
    controls: [
      ControlHints(
        role: 'ok_button',
        classNames: {'Button'},
        textContains: {'אישור', 'OK'},
        required: false,
      ),
      ControlHints(
        role: 'cancel_button',
        classNames: {'Button'},
        controlIds: {2},
        textContains: {'ביטול', 'Cancel', 'Annuler'},
        required: false,
      ),
      ControlHints(
        role: 'message',
        classNames: {'Static'},
        controlIds: {65535},
        required: false,
      ),
    ],
  );

  /// כן/לא במודאל "מידע": הוא שואל ולא רק מודיע. נבדק על תמונת הכפתורים
  /// ולא בגילוי המבני, שבכפתור יחיד היה מתאים גם את "אישור".
  static const ControlHints questionButtonHints = ControlHints(
    role: 'question_button',
    classNames: {'Button'},
    controlIds: {6, 7},
    textContains: {'כן', 'לא', 'Yes', 'No', 'Oui', 'Non'},
  );

  // "חיפוש קל", "חיפוש מתקדם" ו"חיפוש בניסוח חופשי". "חיפוש טבלאי" (כ-17
  // שדות, בלי 1233) אינו מתאים, וזה מכוון: אין בו שדה שאילתה אחד.
  // הכותרות באנגלית ובצרפתית לא נמדדו.
  static const DialogHints searchHints = DialogHints(
    role: 'search',
    windowClass: '#32770',
    titleContains: {'חיפוש', 'Search', 'Recherche'},
    controls: [
      ControlHints(
        role: 'query_edit',
        classNames: {'Edit'},
        controlIds: {1233},
      ),
      ControlHints(
        role: 'run_button',
        classNames: {'Button'},
        controlIds: {1},
        textContains: {'בצע', 'Search', 'Rechercher'},
      ),
    ],
  );

  /// המודאל שאחרי חיפוש מוצלח (`2543 תוצאות`). מזהה 1 משותף בו לכפתור,
  /// ל-`AfxWnd110u` ול-`ScrollBar`, ולכן האישור נמצא לפי טקסט בלבד.
  static const DialogHints searchSummaryHintsDefault = DialogHints(
    role: 'search_summary',
    windowClass: '#32770',
    titleContains: {'תוצאות', 'Results', 'results', 'Résultats', 'résultats'},
    controls: [
      ControlHints(
        role: 'expand_button',
        classNames: {'Button'},
        controlIds: {341},
        textContains: {'הרחבה', 'Expand', 'Élargir'},
      ),
      ControlHints(
        role: 'ok_button',
        classNames: {'Button'},
        textContains: {'אישור', 'OK'},
      ),
    ],
  );

  static const DialogHints searchProgressHintsDefault = DialogHints(
    role: 'search_progress',
    windowClass: '#32770',
    titleContains: {'התקדמות', 'Progress', 'Progression'},
  );
}
