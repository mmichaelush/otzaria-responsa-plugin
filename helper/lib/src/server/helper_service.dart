import 'dart:convert';

import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/build_coordinator.dart';
import 'package:responsa_helper/src/server/catalog_index.dart';
import 'package:responsa_helper/src/server/catalog_store.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/peer_session.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';

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
  static const String serverVersion = '0.1.0';
  static const int apiVersion = 1;
  static const List<String> capabilities = ['catalog', 'open', 'icon'];

  static const int maxPageSize = 200;
  static const int maxKeys = 200;

  final ResponsaBackend _backend;
  final HelperPaths paths;
  final CatalogStore store;
  late final BuildCoordinator builds;

  bool _opening = false;

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

  /// הבנייה ופתיחה לא יכולות לרוץ יחד: שתיהן מפעילות את חלון "עיון" של אותו
  /// מופע, והפתיחה הייתה משבשת את הסריקה.
  Stream<BuildEvent> startBuild() {
    if (_opening && !builds.isRunning) {
      throw const ApiError.busy(
        'ספר נפתח כרגע בבר אילן. אפשר להתחיל את קריאת הרשימה בעוד רגע.',
      );
    }
    return builds.watchOrStart();
  }

  /// קטלוג חסר הוא מצב רגיל (טרם נבנה); קטלוג שקיים ואינו נקרא הוא תקלה,
  /// ואסור להציג אותו כ"חסר": התוסף היה מרענן ומחפש שוב ושוב.
  Future<CatalogIndex> _requireIndex() async {
    final index = await store.index();
    if (index != null) return index;
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
    if (builds.isRunning) {
      throw const ApiError.busy(
        'בר אילן קורא כרגע את רשימת הספרים. אפשר לפתוח ספרים כשהקריאה תסתיים.',
      );
    }
    if (_opening) {
      throw const ApiError.busy(
        'ספר אחר נפתח כרגע בבר אילן. יש להמתין רגע ולנסות שוב.',
      );
    }
    _opening = true;
    try {
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
      if (failure == ResponsaFailure.responsaNotRunning &&
          !(await _backend.status()).installed) {
        throw const ApiError(
          'notInstalled',
          409,
          'בר אילן (פרויקט השו"ת) אינו מותקן במחשב הזה.',
        );
      }
      throw ApiError.fromOpenFailure(
        failure,
        openFailureMessage(
          failure,
          title: book.title,
          tried: report.triedRefs,
          detail: report.message,
        ),
        triedRefs: report.triedRefs,
      );
    } finally {
      _opening = false;
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
      ResponsaFailure.unexpected =>
        detail ?? 'פתיחת $book בבר אילן נכשלה באופן בלתי צפוי.',
    };
  }

  static String _string(Map<String, Object?> body, String name) {
    final value = body[name];
    if (value == null) return '';
    if (value is! String) throw ApiError.badRequest('$name חייב להיות מחרוזת.');
    if (value.length > 500) throw ApiError.badRequest('$name ארוך מדי.');
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
