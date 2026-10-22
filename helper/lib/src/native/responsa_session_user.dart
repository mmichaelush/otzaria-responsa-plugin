import 'dart:ffi';
import 'dart:typed_data';

import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

/// האם התהליך רץ כמשתמש שמחובר בשולחן העבודה (בעל `explorer.exe`).
///
/// מתקין שהורץ בלחיצה ימנית "הפעל כמנהל" מחשבון רגיל מבקש סיסמה של מנהל,
/// ורץ כחשבון המנהל: ההתקנה והפעלה בכניסה נרשמות אצלו (`HKCU\Run`), והשירות
/// שהמתקין מפעיל בסוף עובד רק עד ההתנתקות — "עבד בהתחלה ולא אחר כך"
/// (דיווח 22.10.2026, שני משתמשים). מזהים לפי ה-SID ולא לפי השם, כי שם
/// בעברית נשבר בין קידודים.
abstract final class ResponsaSessionUser {
  /// `true` — אותו משתמש. `false` — משתמש אחר. `null` — לא ניתן לדעת
  /// (אין מעטפת בחלון הזה): לא נחסמים בניחוש.
  static bool? sameAsShellUser() {
    final shell = GetShellWindow();
    if (shell.address == 0) return null;
    final pidBuffer = calloc<Uint32>();
    try {
      GetWindowThreadProcessId(shell, pidBuffer);
      final shellPid = pidBuffer.value;
      if (shellPid == 0) return null;
      final mine = _sidOf(GetCurrentProcess());
      final theirs = _sidOfPid(shellPid);
      if (mine == null || theirs == null) return null;
      return sameSid(mine, theirs);
    } finally {
      calloc.free(pidBuffer);
    }
  }

  static bool sameSid(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }

  static List<int>? _sidOfPid(int pid) {
    final process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    final handle = process.value;
    if (handle.address == 0) return null;
    try {
      return _sidOf(handle);
    } finally {
      CloseHandle(handle);
    }
  }

  /// `TOKEN_USER`: מצביע ל-SID ואחריו תכונות. אורך ה-SID: 8 בתים וארבעה לכל
  /// תת-רשות.
  static List<int>? _sidOf(HANDLE process) {
    final token = calloc<Pointer>();
    try {
      if (!OpenProcessToken(process, TOKEN_QUERY, token).value) return null;
      final tokenHandle = HANDLE(token.value);
      try {
        final size = calloc<Uint32>();
        try {
          GetTokenInformation(tokenHandle, TokenUser, null, 0, size);
          final length = size.value;
          if (length == 0 || length > 1024) return null;
          final buffer = calloc<Uint8>(length);
          try {
            if (!GetTokenInformation(
              tokenHandle,
              TokenUser,
              buffer,
              length,
              size,
            ).value) {
              return null;
            }
            final sid = Pointer<Uint8>.fromAddress(buffer.cast<IntPtr>().value);
            if (sid.address == 0) return null;
            final bytes = 8 + 4 * sid[1];
            return Uint8List.fromList(sid.asTypedList(bytes));
          } finally {
            calloc.free(buffer);
          }
        } finally {
          calloc.free(size);
        }
      } finally {
        CloseHandle(tokenHandle);
      }
    } finally {
      calloc.free(token);
    }
  }
}
