import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/log.dart';

/// מה שנשמר במחשב מהביוגרפיות: רשימת הפריטים (פעם אחת לכל התקנה), ומאמר
/// שנקרא, כדי שפתיחה שנייה לא תפעיל שוב את בר אילן. הכול בתיקיית הנתונים של
/// השירות, שההסרה הרגילה מוחקת כולה. מאמר נשמר רק אחרי שהמשתמש ביקש אותו (ספר אחד) או הפעיל את "קריאת כל הביוגרפיות".
class BiographyStore {
  BiographyStore(this.directory);

  final String directory;

  File get _indexFile => File(p.join(directory, 'biography-index.json'));

  Directory get _texts => Directory(p.join(directory, 'biographies'));

  /// `null` כשאין, או שהקובץ פגום (ייקרא מחדש).
  BiographyIndex? readIndex() {
    final decoded = _readJson(_indexFile);
    return BiographyIndex.fromJson(decoded);
  }

  void writeIndex(BiographyIndex index) =>
      _writeJson(_indexFile, index.toJson());

  /// המאמר השמור של [entry], או `null`.
  BiographyText? readText(BiographyEntry entry) {
    final decoded = _readJson(_textFile(entry));
    if (decoded is! Map ||
        decoded['title'] is! String ||
        decoded['body'] is! String) {
      return null;
    }
    return BiographyText(
      title: decoded['title']! as String,
      body: decoded['body']! as String,
    );
  }

  /// האם המאמר של [entry] כבר שמור (בלי לקרוא אותו).
  bool hasText(BiographyEntry entry) => _textFile(entry).existsSync();

  void writeText(BiographyEntry entry, BiographyText text) =>
      _writeJson(_textFile(entry), {'title': text.title, 'body': text.body});

  /// שם הקובץ לפי הנתיב המלא, לא לפי השם: שני חיבורים באותו שם בקטגוריות
  /// שונות אינם אותו מאמר.
  File _textFile(BiographyEntry entry) {
    final key = sha1.convert(utf8.encode(entry.path.join('\u0001'))).toString();
    return File(p.join(_texts.path, '$key.json'));
  }

  static Object? _readJson(File file) {
    try {
      if (!file.existsSync()) return null;
      return jsonDecode(file.readAsStringSync());
    } on FormatException {
      return null;
    } on FileSystemException catch (error) {
      logLine('BiographyStore: cannot read ${file.path}: ${error.message}');
      return null;
    }
  }

  /// כתיבה אטומית: קובץ זמני ואז שינוי שם, כדי שהפסקה באמצע לא תשאיר קובץ
  /// חצי-כתוב שיקרא אחר כך כ"פגום".
  static void _writeJson(File file, Object? value) {
    try {
      file.parent.createSync(recursive: true);
      final temporary = File('${file.path}.tmp');
      temporary.writeAsStringSync(jsonEncode(value), flush: true);
      temporary.renameSync(file.path);
    } on FileSystemException catch (error) {
      logLine('BiographyStore: cannot write ${file.path}: ${error.message}');
    }
  }
}
