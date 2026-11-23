import 'dart:async';

import 'package:responsa_helper/src/biography/biography_index.dart';
import 'package:responsa_helper/src/biography/biography_store.dart';
import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_biography_controller.dart';
import 'package:responsa_helper/src/server/api_error.dart';

/// פעולה אחת בבר אילן בכל רגע: הקריאה מחלון הביוגרפיה תופסת את אותו מופע
/// שהפתיחה והחיפוש תופסים.
typedef BiographyExclusive = Future<T> Function<T>(Future<T> Function() action);

/// מה מצב "קריאת כל הביוגרפיות" (`POST /biography/harvest`).
enum BiographyHarvestState { idle, running, done, stopped, failed }

/// `POST /biography` — המאמר על ספר, מ"כלים ← ביוגרפיה" של בר אילן
/// (docs/PROTOCOL.md). הקריאה לבקשת המשתמש בלבד, מאמר אחד בכל פעם. שום דבר
/// אינו נקרא ביוזמת השירות: גם "קריאת כל הביוגרפיות" (`POST
/// /biography/harvest`) רצה רק אחרי שהמשתמש הפעיל אותה, ברקע, בקצב איטי
/// ובלי להפריע — כל מאמר הוא פעולה נפרדת שפתיחת ספר או חיפוש יכולים לקדום.
class BiographyService {
  BiographyService({
    required this.store,
    required this.reader,
    required this.exclusive,
    required this.book,
    required this.installPath,
    required this.installKey,
    required this.rejectIfNotInstalled,
    this.pace = const Duration(milliseconds: 1500),
    this.busyRetry = const Duration(seconds: 5),
  });

  /// ההפסקה בין מאמר למאמר בקריאה ברקע: בר אילן והמחשב נשארים פנויים.
  final Duration pace;

  /// כמה ממתינים כשבר אילן עסוק (ספר נפתח, חיפוש, בניית הרשימה).
  final Duration busyRetry;

  final BiographyStore store;
  final ResponsaBiographySource reader;
  final BiographyExclusive exclusive;

  /// הספר שבקטלוג, או [ApiError.unknownBook]: שמו, והדרך אליו בעץ (מהשורש,
  /// בלי שמו), שממנה מוצאים את החיבור שהוא חלק ממנו.
  final Future<({String title, List<String> context})> Function(String key)
  book;

  /// ההתקנה שממנה נבנה הקטלוג: אליה פונים בבר אילן.
  final Future<String?> Function() installPath;

  /// מזהה את ההתקנה והמהדורה: רשימה ממהדורה אחרת היא עץ אחר.
  final Future<String> Function() installKey;
  final Future<void> Function(ResponsaFailure failure) rejectIfNotInstalled;

  Future<Map<String, Object?>> read(Map<String, Object?> body) async {
    final key = _key(body);
    final autoStart = _autoStart(body);
    final (:title, :context) = await book(key);

    // הרשימה השמורה והמאמר השמור אינם צריכים את בר אילן.
    var index = store.readIndex();
    final currentKey = await installKey();
    if (index != null && index.installKey == currentKey) {
      final entry = index.findFor(title, context: context);
      if (entry == null) return _missing(title);
      if (store.readText(entry) case final saved?) {
        return _found(title, entry, saved, cached: true);
      }
    }

    return exclusive(() async {
      final where = await installPath();
      if (index == null || index!.installKey != currentKey) {
        index = BiographyIndex(
          installKey: currentKey,
          entries: await _readEntries(where, autoStart),
        );
        store.writeIndex(index!);
      }
      final entry = index!.findFor(title, context: context);
      if (entry == null) return _missing(title);

      final text = await _fetch(entry, where: where, autoStart: autoStart);
      return _found(title, entry, text, cached: false);
    });
  }

  /// קורא את המאמר של [entry] מחלון הביוגרפיה ושומר אותו. תמיד בתוך
  /// `exclusive`: זה מפעיל את חלון בר אילן והלוח.
  Future<BiographyText> _fetch(
    BiographyEntry entry, {
    required String? where,
    required bool autoStart,
  }) async {
    final report = await reader.readText(
      entry,
      installPath: where,
      allowLaunch: autoStart,
    );
    final text = report.ok
        ? BiographyText.parse(report.text ?? '', expectedTitle: entry.title)
        : null;
    if (text == null) {
      // טקסט שאינו המאמר שביקשו אינו נשמר: הוא נשמר לתמיד תחת הספר הזה.
      if (report.ok) {
        logLine('biography: unexpected text for "${entry.title}" discarded');
        throw const ApiError(
          'internal',
          500,
          'בר אילן העתיקה טקסט שאינו הביוגרפיה המבוקשת, והוא לא נשמר. אפשר '
              'לנסות שוב.',
        );
      }
      await _fail(report, 'ביוגרפיה של "${entry.title}"');
    }
    store.writeText(entry, text);
    _stored.add(store.keyOf(entry));
    logLine('biography: read "${entry.title}" (${text.body.length} chars)');
    return text;
  }

  // ------------------------------------------------ קריאת כל הביוגרפיות

  BiographyHarvestState _state = BiographyHarvestState.idle;
  bool _stopRequested = false;
  String? _current;
  int _failed = 0;
  String? _message;

  /// כמה מאמרים נכשלו ברצף. בר אילן שאינה פותחת חלון לשום מאמר אינה "מאמר
  /// בעייתי", ושום טעם לעבור על אלף פריטים בכל פעם בעשרים שניות.
  int _failedInRow = 0;
  static const int _maxFailedInRow = 5;

  /// מזהי המאמרים השמורים, מהתיקייה פעם אחת ואחר כך מהזיכרון.
  Set<String>? _storedKeys;
  Set<String> get _stored => _storedKeys ??= store.storedKeys();
  bool _hasText(BiographyEntry entry) => _stored.contains(store.keyOf(entry));

  /// `POST /biography/harvest`: `{"action": "start" | "stop" | "status"}`.
  /// `start` מתחיל קריאה ברקע של כל המאמרים שעוד לא נשמרו (ואם כבר רצה, אינו
  /// עושה דבר); `stop` עוצר אחרי המאמר הנוכחי; `status` רק מדווח. כולן
  /// מחזירות את אותו מצב, ו-`start` חוזר מיד.
  Future<Map<String, Object?>> harvest(Map<String, Object?> body) async {
    switch (body['action']) {
      case 'start':
        final autoStart = _autoStart(body);
        if (_state != BiographyHarvestState.running) {
          _state = BiographyHarvestState.running;
          _stopRequested = false;
          _current = null;
          _failed = 0;
          _failedInRow = 0;
          _message = null;
          unawaited(_harvestAll(autoStart));
        }
      case 'stop':
        if (_state == BiographyHarvestState.running) _stopRequested = true;
      case 'status':
        break;
      default:
        throw const ApiError.badRequest(
          'action חייב להיות start, stop או status.',
        );
    }
    return _harvestStatus();
  }

  Map<String, Object?> _harvestStatus() {
    final entries = [
      for (final entry
          in store.readIndex()?.entries ?? const <BiographyEntry>[])
        if (!entry.isSeparator) entry,
    ];
    final known = store.readIndex() != null;
    return {
      'state': _state.name,
      // null: הרשימה עוד לא נקראה מבר אילן. שורות הפרדה אינן מאמרים.
      'total': known ? entries.length : null,
      'stored': entries.where(_hasText).length,
      'failed': _failed,
      'current': _state == BiographyHarvestState.running ? _current : null,
      'message': _message,
    };
  }

  Future<void> _harvestAll(bool autoStart) async {
    try {
      final index = await _ensureIndex(autoStart);
      for (final entry in index.entries) {
        if (_stopRequested) {
          _state = BiographyHarvestState.stopped;
          return;
        }
        if (entry.isSeparator || _hasText(entry)) continue;
        _current = entry.title;
        if (!await _harvestOne(entry, autoStart)) return;
        await Future<void>.delayed(pace);
      }
      _state = BiographyHarvestState.done;
      logLine('biography: harvest done (failed $_failed)');
    } on ApiError catch (error) {
      _failHarvest(error.message);
    } on Object catch (error) {
      logLine('biography: harvest crashed: $error');
      _failHarvest('הקריאה נעצרה בשגיאה לא צפויה.');
    } finally {
      _current = null;
      if (_state == BiographyHarvestState.running) {
        _state = BiographyHarvestState.failed;
      }
    }
  }

  /// קורא מאמר אחד. `false` — צריך לעצור את הריצה כולה (כשל כללי או עצירה).
  Future<bool> _harvestOne(BiographyEntry entry, bool autoStart) async {
    while (true) {
      if (_stopRequested) {
        _state = BiographyHarvestState.stopped;
        return false;
      }
      try {
        await exclusive(() async {
          final where = await installPath();
          await _fetch(entry, where: where, autoStart: autoStart);
        });
        _failedInRow = 0;
        return true;
      } on ApiError catch (error) {
        switch (error.code) {
          case 'busy':
            // המשתמש פתח ספר או חיפש: הוא קודם. ממתינים ומנסים שוב.
            await Future<void>.delayed(busyRetry);
          case 'internal' || 'dialogNotFound' || 'notResponding':
            // מאמר אחד שנכשל (גם כשבר אילן לא פתחה לו חלון) אינו עוצר את
            // השאר; יומן בלבד. הפעלה חוזרת מנסה אותו שוב, ממשיכה הלאה.
            _failed++;
            _failedInRow++;
            logLine(
              'biography: harvest skipped "${entry.title}": ${error.code}',
            );
            if (_failedInRow >= _maxFailedInRow) {
              _failHarvest(
                'בר אילן לא פתחה את חלון הביוגרפיה בחמישה מאמרים ברצף, ולכן '
                'הקריאה נעצרה. כדאי לבדוק שבר אילן אינה עסוקה או תקועה, '
                'ולהתחיל שוב.',
              );
              return false;
            }
            return true;
          default:
            // בר אילן לא פועלת, מוגבהת וכו': אין טעם להמשיך.
            _failHarvest(error.message);
            return false;
        }
      }
    }
  }

  void _failHarvest(String message) {
    _state = BiographyHarvestState.failed;
    _message = message;
    logLine('biography: harvest stopped: $message');
  }

  /// רשימת הפריטים של ההתקנה הנוכחית: השמורה אם היא מתאימה, ואחרת נקראת
  /// מבר אילן (רק אז היא תופסת אותה).
  Future<BiographyIndex> _ensureIndex(bool autoStart) async {
    final currentKey = await installKey();
    final saved = store.readIndex();
    if (saved != null && saved.installKey == currentKey) return saved;
    return exclusive(() async {
      final fresh = BiographyIndex(
        installKey: currentKey,
        entries: await _readEntries(await installPath(), autoStart),
      );
      store.writeIndex(fresh);
      return fresh;
    });
  }

  Future<List<BiographyEntry>> _readEntries(
    String? where,
    bool autoStart,
  ) async {
    final report = await reader.readIndex(
      installPath: where,
      allowLaunch: autoStart,
    );
    if (!report.ok) await _fail(report, 'רשימת הביוגרפיות');
    if (report.entries.isEmpty) {
      throw const ApiError(
        'notFound',
        404,
        'בבר אילן שבמחשב אין ביוגרפיות (כלים ← ביוגרפיה ריק).',
      );
    }
    return report.entries;
  }

  Future<Never> _fail(ResponsaBiographyReport report, String what) async {
    final failure = report.failure ?? ResponsaFailure.unexpected;
    logLine('biography: $what failed: ${failure.name} ${report.message}');
    await rejectIfNotInstalled(failure);
    throw ApiError.fromAutomationFailure(
      failure,
      report.message ?? 'קריאת $what מבר אילן נכשלה.',
    );
  }

  static Map<String, Object?> _missing(String title) => {
    'found': false,
    'title': title,
  };

  static Map<String, Object?> _found(
    String bookTitle,
    BiographyEntry entry,
    BiographyText text, {
    required bool cached,
  }) => {
    'found': true,
    'title': bookTitle,
    'entry': entry.title,
    'heading': text.title,
    'text': text.body,
    'cached': cached,
  };

  /// מספר (מזהה ספר מחיפוש הספרייה של אוצריא) או מחרוזת, כמו ב-`/book/open`.
  static String _key(Map<String, Object?> body) => switch (body['key']) {
    final int number when number > 0 => '$number',
    final String text when text.trim().isNotEmpty && text.length <= 500 =>
      text.trim(),
    _ => throw const ApiError.badRequest('חסר מפתח ספר תקין.'),
  };

  static bool _autoStart(Map<String, Object?> body) =>
      switch (body['autoStart']) {
        null => true,
        final bool value => value,
        _ => throw const ApiError.badRequest(
          'autoStart חייב להיות true או false.',
        ),
      };
}
