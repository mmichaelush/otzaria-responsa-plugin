import 'dart:convert';
import 'dart:io';

import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/build_coordinator.dart';
import 'package:responsa_helper/src/server/catalog_index.dart';
import 'package:responsa_helper/src/server/catalog_store.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/peer_session.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';
import 'package:responsa_helper/src/text/responsa_query.dart';

/// הלוגיקה של השירות, בלי HTTP: כל נקודת קצה ב-docs/PROTOCOL.md היא מתודה
/// כאן, ומחזירה JSON או זורקת [ApiError].
class HelperService {
  HelperService({required this._backend, required this.paths})
    : store = CatalogStore(paths.catalog) {
    builds = BuildCoordinator(
      backend: _backend,
      store: store,
      targetPath: paths.catalog,
    );
  }

  static const String serviceId = 'otzaria-responsa';
  static const String serverVersion = '0.2.2';
  static const int apiVersion = 1;
  static const List<String> capabilities = [
    'catalog',
    'open',
    'icon',
    'searchText',
    'export',
  ];

  static const int maxPageSize = 200;
  static const int maxKeys = 200;

  /// בחירה ארוכה נחתכת ב-[ResponsaQuery], ולא נדחית.
  static const int maxSelectionLength = 10000;

  final ResponsaBackend _backend;
  final HelperPaths paths;
  final CatalogStore store;
  late final BuildCoordinator builds;

  /// פתיחה או חיפוש שרצים עכשיו. אחד בכל רגע, ולעולם לא בזמן בנייה: כולם
  /// מפעילים את אותו מופע, ופעולה שנייה משבשת את הראשונה.
  _Automation? _automation;

  Map<String, Object?> health() => {
    'ok': true,
    'service': serviceId,
    'apiVersion': apiVersion,
    'serverVersion': serverVersion,
    'capabilities': capabilities,
    if (PeerSession.own != null) 'sessionId': PeerSession.own,
  };

  Future<Map<String, Object?>> status() async {
    final responsa = await _backend.status();
    final info = await store.repository.info();
    return {
      'installed': responsa.installed,
      'running': responsa.running,
      if (responsa.version != null) 'version': responsa.version,
      'confidence': responsa.confidence.name,
      if (responsa.installPath != null) 'installPath': responsa.installPath,
      'catalog': {
        'exists': info.exists,
        'bookCount': info.bookCount,
        if (info.schemaVersion != null) 'schemaVersion': info.schemaVersion,
        'outdated': info.isOutdated,
        if (info.builtAt != null) 'builtAt': info.builtAt,
        if (info.sourceVersion != null) 'sourceVersion': info.sourceVersion,
        'matchesInstallation': info.describesAnyOf(
          responsa.installations.map((i) => i.installPath),
        ),
      },
      'build': builds.snapshot(),
    };
  }

  Future<Map<String, Object?>> search(Map<String, Object?> body) async {
    final query = _string(body, 'q');
    final offset = _int(body, 'offset', fallback: 0, min: 0);
    final limit = _int(body, 'limit', fallback: 50, min: 1, max: maxPageSize);
    final index = await _requireIndex();
    final hits = index.search(query);
    return {
      'total': hits.length,
      'results': [
        for (final book in hits.skip(offset).take(limit)) book.toJson(),
      ],
    };
  }

  Future<Map<String, Object?>> books(Map<String, Object?> body) async {
    final keys = body['keys'];
    if (keys is! List || keys.any((k) => k is! String)) {
      throw const ApiError.badRequest('keys חייב להיות רשימת מחרוזות.');
    }
    if (keys.length > maxKeys) {
      throw const ApiError.badRequest('יותר מדי מפתחות בבקשה אחת.');
    }
    final index = await _requireIndex();
    return {
      'results': [
        for (final key in keys.cast<String>())
          if (index.byKey(key) case final book?) book.toJson(),
      ],
    };
  }

  /// כל הרשימה בבקשה אחת, בשורות `[key, title, author, contextPath]`: כך
  /// התוסף מעביר אותה לחיפוש הספרייה של אוצריא בלי אלפי בקשות.
  Future<Map<String, Object?>> export() async {
    final index = await _requireIndex();
    final info = await store.repository.info();
    return {
      if (info.builtAt != null) 'builtAt': info.builtAt,
      'books': [
        for (final book in index.books)
          [book.key, book.title, book.author, book.contextPath],
      ],
    };
  }

  /// הבנייה ופתיחה לא יכולות לרוץ יחד: שתיהן מפעילות את חלון "עיון" של אותו
  /// מופע, והפתיחה הייתה משבשת את הסריקה. חיפוש מפעיל את אותו מופע.
  Stream<BuildEvent> startBuild() {
    if (_automation case final running? when !builds.isRunning) {
      throw ApiError.busy(switch (running) {
        _Automation.open =>
          'ספר נפתח כרגע בבר אילן. אפשר להתחיל את קריאת הרשימה בעוד רגע.',
        _Automation.search =>
          'בר אילן מחפש כרגע. אפשר להתחיל את קריאת הרשימה בעוד רגע.',
      });
    }
    return builds.watchOrStart();
  }

  /// מריץ [action] כפעולת האוטומציה היחידה, או דוחה ב-`busy` עם הסבר מה
  /// תופס את בר אילן.
  Future<T> _exclusive<T>(_Automation kind, Future<T> Function() action) async {
    if (builds.isRunning) {
      throw ApiError.busy(switch (kind) {
        _Automation.open =>
          'בר אילן קורא כרגע את רשימת הספרים. אפשר לפתוח ספרים כשהקריאה '
              'תסתיים.',
        _Automation.search =>
          'בר אילן קורא כרגע את רשימת הספרים. אפשר לחפש בו כשהקריאה '
              'תסתיים.',
      });
    }
    if (_automation case final running?) {
      throw ApiError.busy(switch ((running, kind)) {
        (_Automation.open, _Automation.open) =>
          'ספר אחר נפתח כרגע בבר אילן. יש להמתין רגע ולנסות שוב.',
        (_Automation.open, _Automation.search) =>
          'ספר נפתח כרגע בבר אילן. יש להמתין רגע ולנסות שוב.',
        (_Automation.search, _Automation.open) =>
          'בר אילן מחפש כרגע. אפשר לפתוח את הספר כשהחיפוש יסתיים.',
        (_Automation.search, _Automation.search) =>
          'חיפוש אחר רץ כרגע בבר אילן. יש להמתין לסיומו ולנסות שוב.',
      });
    }
    _automation = kind;
    try {
      return await action();
    } finally {
      _automation = null;
    }
  }

  /// קטלוג חסר הוא מצב רגיל (טרם נבנה); קטלוג שקיים ואינו נקרא הוא תקלה,
  /// ואסור להציג אותו כ"חסר": התוסף היה מרענן ומחפש שוב ושוב.
  Future<CatalogIndex> _requireIndex() async {
    final index = await store.index();
    if (index != null) return index;
    // בין שני שינויי השם של החלפת הרשימה אין קובץ לרגע; זה לא "חסר".
    if (builds.isRunning &&
        await File('${store.repository.databasePath}.previous').exists()) {
      throw const ApiError.busy(
        'רשימת הספרים מתעדכנת ברגע זה. אפשר לנסות שוב בעוד כמה שניות.',
      );
    }
    if (await store.repository.exists()) {
      throw const ApiError(
        'catalogUnreadable',
        500,
        'לא ניתן לקרוא את רשימת הספרים. אפשר לבנות אותה מחדש: גלגל השיניים '
            '← "בנייה מחדש".',
      );
    }
    throw const ApiError.catalogMissing();
  }

  /// פתיחה אחת בכל רגע: שתי פתיחות חופפות מתחרות על אותו מופע ומשאירות
  /// חלונות שאיש אינו סוגר.
  Future<Map<String, Object?>> open(Map<String, Object?> body) async {
    final key = _string(body, 'key');
    if (key.isEmpty) throw const ApiError.badRequest('חסר מפתח ספר.');
    return _exclusive(_Automation.open, () async {
      final index = await _requireIndex();
      final book = index.byKey(key);
      if (book == null) throw const ApiError.unknownBook();
      final references = await store.repository.openRefsFor(key);
      if (references.isEmpty) throw const ApiError.unknownBook();

      final report = await _backend.openBook(
        references,
        expectedTitle: book.title,
        installPath: await store.repository.sourceInstallPath(),
      );
      if (report.ok) {
        logLine(
          'opened ${book.key} "${book.title}" via "${report.usedRef}"'
          '${report.broughtToFront ? '' : ' (not brought to front)'}',
        );
        return {
          'ok': true,
          if (report.window != null) 'window': report.window,
          if (report.usedRef != null) 'usedRef': report.usedRef,
          'broughtToFront': report.broughtToFront,
        };
      }
      final failure = report.failure ?? ResponsaFailure.timeout;
      logLine(
        'open ${book.key} failed: ${failure.name} ${report.message} '
        'tried=${jsonEncode(report.triedRefs)}',
      );
      await _rejectIfNotInstalled(failure);
      throw ApiError.fromAutomationFailure(
        failure,
        openFailureMessage(
          failure,
          title: book.title,
          tried: report.triedRefs,
          detail: report.message,
        ),
        triedRefs: report.triedRefs,
      );
    });
  }

  /// מריץ חיפוש בבר אילן ומשאיר את התשובה שלו על המסך. אינו תלוי בקטלוג.
  Future<Map<String, Object?>> searchText(Map<String, Object?> body) async {
    final query = ResponsaQuery.parse(
      _string(body, 'q', maxLength: maxSelectionLength, truncate: true),
    );
    if (query == null) {
      throw const ApiError.badRequest(
        'בטקסט שנבחר אין מילים בעברית לחיפוש בבר אילן. יש לסמן מילה או משפט '
        'בעברית ולנסות שוב.',
      );
    }
    return _exclusive(_Automation.search, () async {
      final report = await _backend.searchText(
        query.text,
        installPath: await store.repository.sourceInstallPath(),
      );
      final outcome = report.outcome;
      if (report.ok &&
          outcome != null &&
          outcome.state != ResponsaSearchState.pending) {
        logLine(
          'search "${query.text}": ${outcome.state.name}'
          '${outcome.count == null ? '' : ' ${outcome.count}'}'
          '${outcome.broughtToFront ? '' : ' (not brought to front)'}',
        );
        return {
          'ok': true,
          'outcome': outcome.state.name,
          'count': ?outcome.count,
          'message': ?_searchMessage(outcome),
          'query': query.text,
          'truncated': query.truncated,
          'broughtToFront': outcome.broughtToFront,
        };
      }
      final failure = report.failure ?? ResponsaFailure.timeout;
      logLine(
        'search "${query.text}" failed: ${failure.name} ${report.message}',
      );
      await _rejectIfNotInstalled(failure);
      throw ApiError.fromAutomationFailure(
        failure,
        searchFailureMessage(failure, detail: report.message),
      );
    });
  }

  /// הטקסט של בר אילן כשיש; בלעדיו הסבר משלנו, כי "שאל" או "סירב" בלי
  /// הודעה אינם אומרים למשתמש מה לעשות.
  static String? _searchMessage(ResponsaSearchOutcome outcome) =>
      switch (outcome.state) {
        ResponsaSearchState.asked =>
          outcome.message ??
              'בר אילן לא מצא תוצאות, ושואל שאלה בחלון שפתח. יש לעבור לבר '
                  'אילן ולענות בו.',
        ResponsaSearchState.refused =>
          outcome.message ??
              'בר אילן לא ביצע את החיפוש, והסיבה מוצגת בחלון שפתח. יש לעבור '
                  'לבר אילן, לקרוא אותה ולשנות את החיפוש.',
        ResponsaSearchState.found || ResponsaSearchState.pending => null,
      };

  /// הבקר מבחין בין "אינו מותקן" ל"לא עלה בזמן" רק בהודעה; הקוד נקבע כאן.
  Future<void> _rejectIfNotInstalled(ResponsaFailure failure) async {
    if (failure == ResponsaFailure.responsaNotRunning &&
        !(await _backend.status()).installed) {
      throw const ApiError(
        'notInstalled',
        409,
        'בר אילן (פרויקט השו"ת) אינו מותקן במחשב הזה.',
      );
    }
  }

  Future<Map<String, Object?>> icon() async {
    final responsa = await _backend.status();
    final bytes = await _backend.icon(
      installPath: responsa.installPath,
      cachePath: paths.iconCache,
    );
    if (bytes == null) {
      throw const ApiError('notFound', 404, 'לא נמצא סמל של בר אילן.');
    }
    return {'png': base64Encode(bytes)};
  }

  /// תמיד מה נכשל, באיזה ספר ומה אפשר לעשות: "הפתיחה נכשלה" לבדו אינו
  /// נותן למשתמש צעד הבא.
  static String openFailureMessage(
    ResponsaFailure failure, {
    required String title,
    List<String> tried = const [],
    String? detail,
  }) {
    final book = title.isEmpty ? 'הספר' : '"$title"';
    final attempts = tried.isEmpty
        ? ''
        : ' ההפניות שנוסו: ${tried.take(4).join(' · ')}.';
    return switch (failure) {
      // כאן הבקר יודע יותר: הוא מבחין בין "אינו מותקן" ל"לא עלה בזמן".
      ResponsaFailure.responsaNotRunning =>
        detail ??
            'בר אילן אינו פעיל ולא ניתן היה להפעיל אותו. '
                'יש לפתוח את פרויקט השו"ת ולנסות שוב.',
      ResponsaFailure.citationDialogNotFound =>
        'בר אילן לא פתח את חלון "עיון", ולכן לא ניתן היה לפתוח את $book. '
            'ייתכן שחלון אחר פתוח בבר אילן וממתין לתשובה. יש לסגור אותו '
            'ולנסות שוב.',
      ResponsaFailure.referenceNotParsed =>
        'בר אילן לא זיהה את $book.$attempts '
            'ייתכן שהספר אינו קיים במהדורה המותקנת. אפשר לבנות את הקטלוג '
            'מחדש ולנסות שוב.',
      ResponsaFailure.openedWrongBook =>
        'בר אילן פתח ספר אחר במקום $book, והפתיחה בוטלה כדי שלא ייפתח '
            'ספר שגוי.',
      ResponsaFailure.mdiWindowLimitReached =>
        'בבר אילן פתוחים כבר חלונות רבים והוא מפסיק לפתוח חדשים, ולכן '
            '$book לא נפתח. יש לסגור בו כמה חלונות ולנסות שוב.',
      ResponsaFailure.resultsNotCleared =>
        'רשימת התוצאות בבר אילן לא התנקתה, ולכן לא ניתן לדעת אם התוצאה '
            'שייכת ${title.isEmpty ? 'לספר' : 'ל$book'}. הפתיחה בוטלה; אפשר '
            'לנסות שוב.',
      ResponsaFailure.timeout =>
        'בר אילן לא הגיב בזמן בעת פתיחת $book. ייתכן שהוא עסוק או ממתין '
            'לתשובה בחלון אחר.',
      ResponsaFailure.cancelled => 'הפתיחה בוטלה.',
      ResponsaFailure.busy =>
        detail ?? 'פעולה אחרת בבר אילן כבר מתבצעת. יש להמתין לסיומה.',
      // חיפוש בלבד; כאן רק לשלמות.
      ResponsaFailure.searchDialogNotFound =>
        detail ?? 'פתיחת $book בבר אילן נכשלה. אפשר לנסות שוב.',
      ResponsaFailure.unexpected =>
        detail ?? 'פתיחת $book בבר אילן נכשלה באופן בלתי צפוי.',
    };
  }

  /// כמו [openFailureMessage]: מה נכשל ומה עושים.
  static String searchFailureMessage(
    ResponsaFailure failure, {
    String? detail,
  }) => switch (failure) {
    ResponsaFailure.responsaNotRunning =>
      detail ??
          'בר אילן אינו פעיל ולא ניתן היה להפעיל אותו. '
              'יש לפתוח את פרויקט השו"ת ולנסות שוב.',
    ResponsaFailure.searchDialogNotFound =>
      'בר אילן לא פתח את חלון החיפוש. ייתכן שחלון אחר פתוח בבר אילן '
          'וממתין לתשובה. יש לסגור אותו ולנסות שוב.',
    ResponsaFailure.mdiWindowLimitReached =>
      'בבר אילן פתוחים כבר חלונות רבים והוא מפסיק לפתוח חדשים, ולכן '
          'התוצאות לא הוצגו. יש לסגור בו כמה חלונות ולנסות שוב.',
    ResponsaFailure.timeout =>
      'בר אילן לא השיב על החיפוש בזמן. ייתכן שהוא עסוק או ממתין לתשובה '
          'בחלון אחר. יש לעבור לבר אילן, לסגור את החלון ולנסות שוב.',
    ResponsaFailure.busy =>
      detail ?? 'פעולה אחרת בבר אילן כבר מתבצעת. יש להמתין לסיומה.',
    ResponsaFailure.cancelled => 'החיפוש בוטל.',
    // כשלים של פתיחת ספר; החיפוש אינו מגיע אליהם.
    ResponsaFailure.citationDialogNotFound ||
    ResponsaFailure.resultsNotCleared ||
    ResponsaFailure.referenceNotParsed ||
    ResponsaFailure.openedWrongBook ||
    ResponsaFailure.unexpected =>
      detail ?? 'החיפוש בבר אילן נכשל באופן בלתי צפוי. אפשר לנסות שוב.',
  };

  /// [truncate] — ערך ארוך נחתך במקום להידחות: בחיפוש טקסט רק תחילתו
  /// נשלחת לבר אילן, ולקוח ישן אינו מקצר את הטקסט המסומן בעצמו.
  static String _string(
    Map<String, Object?> body,
    String name, {
    int maxLength = 500,
    bool truncate = false,
  }) {
    final value = body[name];
    if (value == null) return '';
    if (value is! String) throw ApiError.badRequest('$name חייב להיות מחרוזת.');
    if (value.length > maxLength) {
      if (!truncate) throw ApiError.badRequest('$name ארוך מדי.');
      return value.substring(0, maxLength).trim();
    }
    return value.trim();
  }

  static int _int(
    Map<String, Object?> body,
    String name, {
    required int fallback,
    required int min,
    int? max,
  }) {
    final value = body[name];
    if (value == null) return fallback;
    if (value is! int || value < min || (max != null && value > max)) {
      throw ApiError.badRequest(
        '$name חייב להיות מספר שלם בין $min ל-${max ?? '∞'}.',
      );
    }
    return value;
  }
}

enum _Automation { open, search }
