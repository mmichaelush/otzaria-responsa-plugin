import 'dart:convert';
import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

/// יומן לכל האיזולטים. השירות רץ מוסתר בלי קונסול, ולכן בקובץ ההרצה המהודר
/// היומן נכתב גם לקובץ; ב-`dart test` וב-`dart run` רק ל-stderr.
///
/// הנתיב נגזר בכל איזולט מחדש (סטטיים אינם משותפים בין איזולטים), מתוך
/// `OTZARIA_RESPONSA_LOG` או מתיקיית הנתונים של המשתמש.
void logLine(String message) {
  final line = '${DateTime.now().toIso8601String()} $message';
  // בתוכנת GUI (כך השירות רץ) אין stderr, והכתיבה אליו נכשלת באיחור,
  // כשגיאה שלא נתפסה. לכן בודקים לפני, ולא תופסים אחרי.
  if (_hasStderr) stderr.writeln(line);
  final file = _logFile;
  if (file == null) return;
  try {
    _append(file.path, '$line\n');
  } catch (_) {
    // יומן שנכשל אסור שיפיל את מה שהוא מתעד.
  }
}

/// הוספה אטומית לסוף הקובץ. `writeAsStringSync(append)` מבצע seek ואז write,
/// ושני איזולטים שכותבים יחד דורסים זה את שורות זה (נמדד: 3,016 מתוך 6,000
/// שורות שרדו). עם `FILE_APPEND_DATA` מערכת ההפעלה מוסיפה לסוף באטומיות.
void _append(String path, String text) {
  if (!Platform.isWindows) {
    File(path).writeAsStringSync(text, mode: FileMode.append, flush: true);
    return;
  }
  using((arena) {
    final handle = CreateFile(
      arena.pcwstr(path),
      FILE_APPEND_DATA,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      null,
      OPEN_ALWAYS,
      FILE_ATTRIBUTE_NORMAL,
      null,
    ).value;
    if (handle.address == INVALID_HANDLE_VALUE.address) return;
    try {
      final bytes = utf8.encode(text);
      final buffer = arena<Uint8>(bytes.length);
      buffer.asTypedList(bytes.length).setAll(0, bytes);
      WriteFile(handle, buffer, bytes.length, null, null);
    } finally {
      CloseHandle(handle);
    }
  });
}

/// מסובב את היומן כשהוא גדול מדי: בעליית השירות, וכל חצי שעה.
void rotateLog({int maxBytes = 2 * 1024 * 1024}) {
  final file = _logFile;
  if (file == null) return;
  try {
    if (file.existsSync() && file.lengthSync() > maxBytes) {
      final previous = File('${file.path}.1');
      if (previous.existsSync()) previous.deleteSync();
      file.renameSync(previous.path);
    }
  } catch (_) {
    // אותו טעם: היומן אינו תנאי לעבודה.
  }
}

/// נתיב קובץ היומן, או `null` כשכותבים ל-stderr בלבד.
String? get logFilePath => _logFile?.path;

final File? _logFile = _resolveLogFile();

final bool _hasStderr = _hasStdHandle(STD_ERROR_HANDLE);

/// האם יש stdout. בתוכנת GUI אין, והכתיבה אליו נכשלת באיחור.
final bool hasStdout = _hasStdHandle(STD_OUTPUT_HANDLE);

bool _hasStdHandle(STD_HANDLE which) {
  if (!Platform.isWindows) return true;
  final handle = GetStdHandle(which).value;
  return handle.address != 0 && handle.address != INVALID_HANDLE_VALUE.address;
}

File? _resolveLogFile() {
  final explicit = Platform.environment['OTZARIA_RESPONSA_LOG'];
  if (explicit != null && explicit.isNotEmpty) return File(explicit);
  final executable = Platform.resolvedExecutable.toLowerCase();
  if (!executable.endsWith('responsa_helper.exe')) return null;
  final base = Platform.environment['LOCALAPPDATA'];
  if (base == null || base.isEmpty) return null;
  final directory = Directory('$base\\OtzariaResponsa');
  try {
    directory.createSync(recursive: true);
  } catch (_) {
    return null;
  }
  return File('${directory.path}\\helper.log');
}
