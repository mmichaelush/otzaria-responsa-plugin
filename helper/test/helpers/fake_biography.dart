import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_biography_controller.dart';

/// מחליף את חלון הביוגרפיה של בר אילן בבדיקות: רשימה ומאמרים מוכנים מראש,
/// וספירה של כמה פעמים נפנה לתוכנה (המטרה של השמירה היא שלא נפנה שוב).
class FakeBiographySource implements ResponsaBiographySource {
  FakeBiographySource({
    this.entries = const [],
    Map<String, String>? texts,
    this.indexFailure,
    this.textFailure,
  }) : texts = texts ?? {};

  List<BiographyEntry> entries;

  /// כותרת הפריט ← הטקסט שבר אילן מעתיקה.
  final Map<String, String> texts;
  ResponsaFailure? indexFailure;
  ResponsaFailure? textFailure;

  /// כשל רק לפריטים מסוימים (כותרת ← כשל), כמו מאמר שבר אילן אינה פותחת.
  final Map<String, ResponsaFailure> textFailures = {};

  int indexCalls = 0;
  final List<String> textCalls = [];
  final List<bool> autoStart = [];

  @override
  Future<ResponsaBiographyReport> readIndex({
    String? installPath,
    bool allowLaunch = true,
  }) async {
    indexCalls++;
    autoStart.add(allowLaunch);
    if (indexFailure case final failure?) {
      return ResponsaBiographyReport.failed(failure, 'כשל ברשימה');
    }
    return ResponsaBiographyReport(ok: true, entries: entries);
  }

  @override
  Future<ResponsaBiographyReport> readText(
    BiographyEntry entry, {
    String? installPath,
    bool allowLaunch = true,
  }) async {
    textCalls.add(entry.title);
    autoStart.add(allowLaunch);
    if (textFailures[entry.title] ?? textFailure case final failure?) {
      return ResponsaBiographyReport.failed(failure, 'כשל במאמר');
    }
    return ResponsaBiographyReport(ok: true, text: texts[entry.title] ?? '');
  }
}
