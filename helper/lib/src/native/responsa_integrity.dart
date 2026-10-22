import 'dart:ffi';

import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

/// רמת השלמות (Mandatory Integrity Level) של תהליך. Windows חוסם הודעות
/// (`PostMessage`, `SendMessage`) מתהליך ברמה נמוכה אל חלון של תהליך ברמה
/// גבוהה מהמשתמש הרגיל (UIPI), בלי שגיאה: הפקודה פשוט אינה מגיעה.
/// בר אילן שרץ כ"מנהל" אינו נשלט משירות רגיל, והסימן הוא דיאלוג שלא נפתח
/// (`dialogNotFound`) במקום הסבר.
abstract final class ResponsaIntegrity {
  static const int low = 0x1000;
  static const int medium = 0x2000;
  static const int high = 0x3000;

  /// ההודעה למשתמש כשבר אילן גבוה מהשירות. אומרת מה לעשות, לא רק מה קרה.
  static const String elevatedMessage =
      'אין גישה לבר אילן, כנראה כי הוא פועל כמנהל מערכת. '
      'יש לסגור אותו ולפתוח אותו שוב כרגיל, לא דרך "הפעל כמנהל".';

  /// רמת השירות עצמו; `null` כשלא ניתן לדעת.
  static final int? own = _levelOf(GetCurrentProcess());

  /// רמת התהליך [pid]; `null` כשלא ניתן לדעת (אין גישה, או שהתהליך נסגר).
  static int? ofProcess(int pid) {
    final process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
    final handle = process.value;
    if (handle.address == 0) return null;
    try {
      return _levelOf(handle);
    } finally {
      CloseHandle(handle);
    }
  }

  /// התהליך [pid] גבוה מהשירות, ולכן ההודעות אליו נבלעות. `false` גם כשלא
  /// ניתן לדעת: ההחלטה לא נשענת על ניחוש.
  static bool blocks(int pid) => levelBlocks(own, ofProcess(pid));

  /// לדיווח: `medium`, `high (admin)`, או `integrity unknown`.
  static String describe(int? level) => switch (level) {
    null => 'integrity unknown',
    >= high => 'high integrity (admin)',
    >= medium => 'medium integrity',
    _ => 'low integrity',
  };

  static bool levelBlocks(int? ours, int? theirs) =>
      ours != null && theirs != null && theirs > ours;

  /// `TOKEN_MANDATORY_LABEL`: מצביע ל-SID ואחריו תכונות. ה-RID האחרון ב-SID
  /// הוא הרמה.
  static int? _levelOf(HANDLE process) {
    final token = calloc<Pointer>();
    try {
      if (!OpenProcessToken(process, TOKEN_QUERY, token).value) return null;
      final tokenHandle = HANDLE(token.value);
      try {
        final size = calloc<Uint32>();
        try {
          GetTokenInformation(tokenHandle, TokenIntegrityLevel, null, 0, size);
          final length = size.value;
          if (length == 0 || length > 1024) return null;
          final buffer = calloc<Uint8>(length);
          try {
            final ok = GetTokenInformation(
              tokenHandle,
              TokenIntegrityLevel,
              buffer,
              length,
              size,
            );
            if (!ok.value) return null;
            final sid = Pointer<Uint8>.fromAddress(buffer.cast<IntPtr>().value);
            if (sid.address == 0) return null;
            final subAuthorities = sid[1];
            if (subAuthorities == 0) return null;
            return (sid + 8 + 4 * (subAuthorities - 1)).cast<Uint32>().value;
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
