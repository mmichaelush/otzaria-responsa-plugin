import 'dart:io';

/// יומן לכל האיזולטים. השירות רץ מוסתר בלי קונסול, ולכן בקובץ ההרצה המהודר
/// היומן נכתב גם לקובץ; ב-`dart test` וב-`dart run` רק ל-stderr.
///
/// הנתיב נגזר בכל איזולט מחדש (סטטיים אינם משותפים בין איזולטים), מתוך
/// `OTZARIA_RESPONSA_LOG` או מתיקיית הנתונים של המשתמש.
void logLine(String message) {
  final line = '${DateTime.now().toIso8601String()} $message';
  try {
    stderr.writeln(line);
  } catch (_) {
    // בלי קונסול אין stderr, והקובץ הוא היומן היחיד.
  }
  final file = _logFile;
  if (file == null) return;
  try {
    file.writeAsStringSync('$line\n', mode: FileMode.append, flush: true);
  } catch (_) {
    // יומן שנכשל אסור שיפיל את מה שהוא מתעד.
  }
}

/// מסובב את היומן כשהוא גדול מדי. נקרא פעם אחת, בעליית השירות.
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
