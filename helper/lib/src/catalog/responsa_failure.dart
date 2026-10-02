/// ההחלטות נשענות על הקוד ולא על טקסט ההודעה. מחוץ ל-`native/` בכוונה,
/// כדי ששכבת הספק והממשק לא ייבאו את מודול ה-Win32 בשביל enum.
enum ResponsaFailure {
  responsaNotRunning,

  /// פעולה אחרת של אוצריא רצה כבר מול אותו מופע.
  busy,
  citationDialogNotFound,
  searchDialogNotFound,

  /// חלון "המאגרים המשתתפים" לא נפתח, או שהבחירה בו לא הצליחה.
  databasesDialogNotFound,

  /// קטגוריה או ספר שנבחרו לחיפוש אינם בעץ המאגרים של בר אילן.
  searchScopeNotFound,

  /// בר אילן דחה את השאילתה ("שגיאה בהגדרת השאילתה"). ההודעה שלו בהודעה.
  queryInvalid,
  resultsNotCleared,
  referenceNotParsed,
  openedWrongBook,
  mdiWindowLimitReached,
  timeout,
  cancelled,

  /// חריג שלא צפינו. ההודעה נושאת את הסיבה.
  unexpected,
}

/// כשל של פעולת אוטומציה, עם הקשר לאבחון.
class ResponsaAutomationException implements Exception {
  final ResponsaFailure failure;
  final String message;

  /// הקשר לאבחון — למשל `tried` עם כל ההפניות שנוסו.
  final Map<String, Object?> details;

  const ResponsaAutomationException(
    this.failure,
    this.message, [
    this.details = const {},
  ]);

  @override
  String toString() => '${failure.name}: $message';
}
