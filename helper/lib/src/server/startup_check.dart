import 'dart:typed_data';

import 'package:meta/meta.dart';
import 'package:win32_registry/win32_registry.dart';

/// ההפעלה האוטומטית של השירות בכניסה ל-Windows: מה רשום ב-Run, ומה
/// "אפליקציות הפעלה" של Windows מאשרת. בדיווח של משתמש ש"צריך להריץ את המתקין
/// בכל הדלקה" זה מה שמבדיל בין ערך שנמחק, ערך שהושבת, לבין שירות שעלה ומת.
class StartupCheck {
  StartupCheck._();

  static const String valueName = 'OtzariaResponsa';
  static const String _runPath =
      r'Software\Microsoft\Windows\CurrentVersion\Run';
  static const String _approvedPath =
      r'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run';

  /// התהליך הזה הופעל מערך ה-Run (`--logon`), ולא ידנית או מהמתקין.
  static bool startedAtLogon = false;

  /// Windows שומרת את ההשבתה ב-`StartupApproved\Run`: בבית הראשון, ערך אי-זוגי
  /// (3, 7) הוא "מושבת", וזוגי (2, 6) הוא "מאושר". בלי ערך — מאושר.
  @visibleForTesting
  static bool approvedEnabled(Uint8List? data) =>
      data == null || data.isEmpty || data.first & 1 == 0;

  /// שורה לאבחון; לעולם אינה זורקת.
  static String describe() {
    final started = startedAtLogon
        ? 'this process was started by the Run entry at logon'
        : 'this process was NOT started by the Run entry (manual or installer)';
    try {
      final run = CURRENT_USER.open(_runPath);
      final String? command;
      try {
        command = run.getString(valueName);
      } finally {
        run.close();
      }
      if (command == null) return 'startup: Run entry MISSING; $started';
      var enabled = true;
      try {
        final approved = CURRENT_USER.open(_approvedPath);
        try {
          enabled = approvedEnabled(approved.getBinary(valueName));
        } finally {
          approved.close();
        }
      } catch (_) {
        // בלי המפתח Windows לא השביתה כלום.
      }
      return 'startup: Run entry $command, '
          '${enabled ? 'enabled' : 'DISABLED in Windows Startup apps'}; $started';
    } catch (error) {
      return 'startup: cannot read the Run entry ($error); $started';
    }
  }
}
