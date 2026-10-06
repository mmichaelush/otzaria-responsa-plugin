import 'dart:convert';
import 'dart:io';

import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/build_coordinator.dart';
import 'package:responsa_helper/src/server/catalog_index.dart';
import 'package:responsa_helper/src/server/catalog_store.dart';
import 'package:responsa_helper/src/server/diagnostics.dart';
import 'package:responsa_helper/src/server/helper_paths.dart';
import 'package:responsa_helper/src/server/otzaria_icon_font.dart';
import 'package:responsa_helper/src/server/peer_session.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';
import 'package:responsa_helper/src/text/responsa_advanced_query.dart';
import 'package:responsa_helper/src/text/responsa_query.dart';

/// הלוגיקה של השירות, בלי HTTP: כל נקודת קצה ב-docs/PROTOCOL.md היא מתודה
/// כאן, ומחזירה JSON או זורקת [ApiError].
class HelperService {
  HelperService({
    required this._backend,
    required this.paths,
    Map<String, String>? environment,
  }) : store = CatalogStore(paths.catalog),
       _environment = environment ?? Platform.environment {
    builds = BuildCoordinator(
      backend: _backend,
      store: store,
      targetPath: paths.catalog,
    );
  }

  static const String serviceId = 'otzaria-responsa';
  static const String serverVersion = '0.5.2';
  static const int apiVersion = 1;
  static const List<String> capabilities = [
    'catalog',
    'open',
    'icon',
    'searchText',
    'export',
    'browse',
    'otzariaIcons',
    'advancedSearch',
    'showResponsa',
    'notify',
    'locate',
    'autoStart',
    'diagnostics',
  ];

  static const int maxPageSize = 200;
  static const int maxKeys = 200;

  /// בחירה ארוכה נחתכת ב-[ResponsaQuery], ולא נדחית.
  static const int maxSelectionLength = 10000;

  /// קטגוריות וספרים בתחום של חיפוש מתקדם אחד. כל אחד הוא הליכה בעץ
  /// המאגרים של בר אילן, ותחום רחב יותר נבחר טוב יותר כקטגוריה שמעליהם.
  static const int maxScopeItems = 40;

  final ResponsaBackend _backend;
  final Map<String, String> _environment;

  /// מתי השירות עלה, ל-`/diagnostics`.
  final DateTime startedAt = DateTime.now();
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

  /// פרטים לאיתור תקלה במחשב של משתמש (docs/PROTOCOL.md): סיכום קצר וסוף
  /// היומן. נבנה רק לבקשה.
  Future<Map<String, Object?>> diagnostics() async => HelperDiagnostics.collect(
    serverVersion: serverVersion,
    startedAt: startedAt,
    sessionId: PeerSession.own,
    catalog: store.repository.info,
    lastBuild: builds.lastSummary,
    runningBuild: builds.runningSummary,
  );

  Future<Map<String, Object?>> search(Map<String, Object?> body) async {
    final query = _string(body, 'q');
    final path = _path(body);
    final offset = _int(body, 'offset', fallback: 0, min: 0);
    final limit = _int(body, 'limit', fallback: 50, min: 1, max: maxPageSize);
    final index = await _requireIndex();
    final hits = index.search(query, path: path);
    return {
      'total': hits.length,
      'results': [
        for (final book in hits.skip(offset).take(limit)) book.toJson(),
      ],
    };
  }

  /// רמה אחת בעץ הקטלוג של בר אילן, לעיון בקטגוריות מתוך התוסף.
  Future<Map<String, Object?>> browse(Map<String, Object?> body) async {
    final path = _path(body);
    final index = await _requireIndex();
    final level = index.browse(path);
    if (!level.exists) {
      throw const ApiError(
        'notFound',
        404,
        'הקטגוריה לא נמצאה ברשימת הספרים. ייתכן שהרשימה נקראה מחדש.',
      );
    }
    return {
      'path': level.path,
      'categories': [
        for (final category in level.categories)
          {
            'name': category.name,
            'path': category.path,
            'bookCount': category.bookCount,
          },
      ],
      'books': [for (final book in level.books) book.toJson()],
    };
  }

  /// גופן האייקונים של האוצריא שפנתה לשירות, ושמות הגליפים שבו.
  Future<Map<String, Object?>> otzariaIcons({String? clientExe}) async {
    final font = await OtzariaIconFont.load(
      OtzariaIconFont.candidates(
        clientExe: clientExe,
        environment: _environment,
      ),
    );
    if (font == null) {
      throw const ApiError(
        'notFound',
        404,
        'לא נמצא גופן האייקונים של אוצריא.',
      );
    }
    return {'font': base64Encode(font.bytes), 'glyphs': font.glyphs};
  }

  /// נתיב קטגוריה (`שו"ת/אחרונים`); ריק = שורש העץ.
  static String _path(Map<String, Object?> body) {
    final value = body['path'];
    if (value == null) return '';
    if (value is! String || value.length > 1000) {
      throw const ApiError.badRequest('path חייב להיות נתיב קטגוריה.');
    }
    return _normalizePath(value);
  }

  static String _normalizePath(String value) => value
      .split('/')
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .join('/');

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
    // מאותה טעינה כמו הספרים, כדי שלא יתאר קובץ אחר (CatalogStore._load).
    final builtAt = index.builtAt;
    return {
      'builtAt': ?builtAt,
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
    // מספר: אוצריא שולחת את מזהה הספר מחיפוש הספרייה (`$book.id`) כמות שהוא.
    final key = switch (body['key']) {
      final int number when number > 0 => '$number',
      final String _ => _string(body, 'key'),
      null => '',
      _ => throw const ApiError.badRequest('מפתח הספר אינו תקין.'),
    };
    if (key.isEmpty) throw const ApiError.badRequest('חסר מפתח ספר.');
    final notify = _bool(body, 'notify') ?? false;
    final autoStart = _bool(body, 'autoStart') ?? true;
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
        autoStart: autoStart,
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
          if (notify) ...{
            'message': openedMessage(book.title, report.broughtToFront),
            'severity': 'success',
          },
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

  /// מריץ חיפוש בבר אילן ומשאיר את התשובה שלו על המסך. טקסט מסומן אינו
  /// תלוי בקטלוג. חיפוש מתקדם (`advanced: true`) שולח את התחביר של בר
  /// אילן כמות שהוא, עם `options` ו-`scope` (docs/PROTOCOL.md); התחום
  /// נשען על הקטלוג כדי למצוא את הקטגוריות בעץ המאגרים.
  Future<Map<String, Object?>> searchText(Map<String, Object?> body) async {
    final advanced = _bool(body, 'advanced') ?? false;
    final notify = _bool(body, 'notify') ?? false;
    final autoStart = _bool(body, 'autoStart') ?? true;
    final String text;
    var truncated = false;
    var setup = ResponsaSearchSetup.none;
    if (advanced) {
      try {
        text = ResponsaAdvancedQuery.parse(
          _string(body, 'q', maxLength: ResponsaAdvancedQuery.maxLength * 2),
        ).text;
      } on FormatException catch (error) {
        throw ApiError.fromAutomationFailure(
          ResponsaFailure.queryInvalid,
          error.message,
        );
      }
      setup = await _searchSetup(body);
    } else {
      final query = ResponsaQuery.parse(
        _string(body, 'q', maxLength: maxSelectionLength, truncate: true),
      );
      if (query == null) {
        throw const ApiError.badRequest(
          'בטקסט שנבחר אין מילים בעברית לחיפוש בבר אילן. יש לסמן מילה או '
          'משפט בעברית ולנסות שוב.',
        );
      }
      text = query.text;
      truncated = query.truncated;
    }
    return _exclusive(_Automation.search, () async {
      final report = await _backend.searchText(
        text,
        installPath: await store.repository.sourceInstallPath(),
        setup: setup,
        autoStart: autoStart,
      );
      final outcome = report.outcome;
      if (report.ok &&
          outcome != null &&
          outcome.state != ResponsaSearchState.pending) {
        logLine(
          'search${advanced ? ' (advanced)' : ''} "$text": '
          '${outcome.state.name}'
          '${outcome.count == null ? '' : ' ${outcome.count}'}'
          '${outcome.broughtToFront ? '' : ' (not brought to front)'}',
        );
        if (outcome.state == ResponsaSearchState.invalid) {
          throw ApiError.fromAutomationFailure(
            ResponsaFailure.queryInvalid,
            outcome.message == null
                ? 'בר אילן לא קיבל את השאילתה. יש לבדוק את התחביר.'
                : 'בר אילן לא קיבל את השאילתה: ${outcome.message}',
          );
        }
        return {
          'ok': true,
          'outcome': outcome.state.name,
          'count': ?outcome.count,
          'message': ?(notify
              ? searchNotifyMessage(outcome, query: text, truncated: truncated)
              : _searchMessage(outcome)),
          if (notify)
            'severity': outcome.state == ResponsaSearchState.found
                ? 'success'
                : 'info',
          'query': text,
          'truncated': truncated,
          if (advanced) 'advanced': true,
          'broughtToFront': outcome.broughtToFront,
        };
      }
      final failure = report.failure ?? ResponsaFailure.timeout;
      logLine('search "$text" failed: ${failure.name} ${report.message}');
      await _rejectIfNotInstalled(failure);
      throw ApiError.fromAutomationFailure(
        failure,
        searchFailureMessage(failure, detail: report.message),
      );
    });
  }

  /// `options` ו-`scope` של חיפוש מתקדם. תחום גובר על "חיפוש בכל המאגרים",
  /// שבבר אילן מבטל כל בחירה.
  Future<ResponsaSearchSetup> _searchSetup(Map<String, Object?> body) async {
    final options = body['options'];
    if (options != null && options is! Map) {
      throw const ApiError.badRequest('options חייב להיות אובייקט.');
    }
    bool? option(String name) {
      final value = (options as Map?)?[name];
      if (value == null || value is bool) return value as bool?;
      throw ApiError.badRequest('options.$name חייב להיות true או false.');
    }

    final scope = await _scope(body['scope']);
    return ResponsaSearchSetup(
      advanced: true,
      allDatabases: scope != null ? false : option('allDatabases'),
      abbreviations: option('abbreviations'),
      showForms: option('showForms'),
      scope: scope,
    );
  }

  /// `{paths: [נתיב קטגוריה], books: [key]}` ← נתיבי שמות מהשורש, כפי
  /// שהם בעץ המאגרים של בר אילן (ספר: הנתיב שלו ואחריו שמו).
  Future<List<List<String>>?> _scope(Object? value) async {
    if (value == null) return null;
    if (value is! Map) {
      throw const ApiError.badRequest('scope חייב להיות אובייקט.');
    }
    final paths = _strings(value['paths'], 'scope.paths');
    final keys = _strings(value['books'], 'scope.books');
    if (paths.isEmpty && keys.isEmpty) {
      throw const ApiError.badRequest(
        'בתחום החיפוש צריך לבחור לפחות קטגוריה או ספר אחד.',
      );
    }
    if (paths.length + keys.length > maxScopeItems) {
      throw const ApiError.badRequest(
        'אפשר לבחור עד $maxScopeItems קטגוריות וספרים לחיפוש אחד.',
      );
    }
    final index = await _requireIndex();
    final scope = <List<String>>[];
    for (final raw in paths) {
      final path = _normalizePath(raw);
      // השורש הוא "כל הספרים": `options.allDatabases`, לא תחום.
      if (path.isEmpty) {
        throw const ApiError.badRequest('נתיב ריק בתחום החיפוש.');
      }
      if (!index.browse(path).exists) {
        throw ApiError(
          'notFound',
          404,
          'הקטגוריה "${path.replaceAll('/', ', ')}" לא נמצאה ברשימת '
              'הספרים. ייתכן שהרשימה נקראה מחדש.',
        );
      }
      scope.add(path.split('/'));
    }
    for (final key in keys) {
      final book = index.byKey(key);
      if (book == null) throw const ApiError.unknownBook();
      scope.add([
        ...book.contextPath.split('/').where((part) => part.isNotEmpty),
        book.title,
      ]);
    }
    return scope;
  }

  /// אורך מקום מדויק שהמשתמש כותב, ומספר התוצאות לבחירה.
  static const int maxReferenceLength = 200;
  static const int maxReferenceIndex = ResponsaController.maxLocateChoices - 1;

  /// מקום מדויק (`בראשית ב ג`) בעמוד כתיבת המקורות של בר אילן. כמה תוצאות
  /// בלי `index` — חוזרות לבחירה (`opened: false`), ושום דבר אינו נפתח.
  Future<Map<String, Object?>> openReference(Map<String, Object?> body) async {
    // האורך נבדק אחרי הנרמול: ניקוד וסימני כיווניות אינם נספרים.
    final reference = normalizeReference(
      _string(body, 'ref', maxLength: maxReferenceLength * 4),
    );
    if (reference.length > maxReferenceLength) {
      throw const ApiError.badRequest('המקום ארוך מדי.');
    }
    if (!RegExp('[\u05D0-\u05EA]').hasMatch(reference)) {
      throw const ApiError.badRequest(
        'יש לכתוב שם ספר ומקום בעברית, למשל "בראשית ב ג".',
      );
    }
    final rawIndex = body['index'];
    if (rawIndex != null &&
        (rawIndex is! int || rawIndex < 0 || rawIndex > maxReferenceIndex)) {
      throw const ApiError.badRequest('index חייב להיות מספר תוצאה.');
    }
    final index = rawIndex as int?;
    final notify = _bool(body, 'notify') ?? false;
    final autoStart = _bool(body, 'autoStart') ?? true;
    return _exclusive(_Automation.open, () async {
      final report = await _backend.locate(
        reference,
        index: index,
        installPath: await store.repository.sourceInstallPath(),
        autoStart: autoStart,
      );
      if (report.ok && report.choices.isNotEmpty) {
        logLine('locate "$reference": ${report.choices.length} choices');
        return {
          'ok': true,
          'opened': false,
          'ref': reference,
          'choices': report.choices,
        };
      }
      if (report.ok) {
        logLine(
          'located "$reference"${index == null ? '' : ' #$index'} '
          '-> "${report.window}"',
        );
        return {
          'ok': true,
          'opened': true,
          'ref': reference,
          if (report.window != null) 'window': report.window,
          'broughtToFront': report.broughtToFront,
          if (notify) ...{
            'message': openedMessage(
              report.window ?? reference,
              report.broughtToFront,
            ),
            'severity': 'success',
          },
        };
      }
      final failure = report.failure ?? ResponsaFailure.timeout;
      logLine('locate "$reference" failed: ${failure.name} ${report.message}');
      await _rejectIfNotInstalled(failure);
      throw ApiError.fromAutomationFailure(
        failure,
        failure == ResponsaFailure.referenceNotParsed
            ? 'בר אילן לא מצא את ${_quote(reference)}. כותבים שם ספר ומקום '
                  'בכתיב מלא, למשל "בראשית ב ג", "ברכות דף ב" או "שולחן ערוך '
                  'אורח חיים סימן א".'
            : openFailureMessage(
                failure,
                title: _shorten(reference),
                detail: report.message,
              ),
      );
    });
  }

  /// ניקוד וטעמים נמחקים, מקף הופך לרווח, וגרשיים מנורמלים: המנתח של בר אילן
  /// מצפה לכתיב מלא בלי ניקוד. סימני כיווניות ורוחב אפס, שמגיעים בהדבקה
  /// מאוצריא או מ-Word, אינם נראים אבל מפילים את הניתוח.
  static String normalizeReference(String value) => value
      .replaceAll(RegExp('[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]'), '')
      .replaceAll(RegExp('[\u0591-\u05BD\u05BF-\u05C7]'), '')
      .replaceAll('\u05BE', ' ')
      .replaceAll(RegExp('[\u05F3\u2018\u2019\u00B4`]'), "'")
      .replaceAll(RegExp("[\u05F4\u201C\u201D]|''"), '"')
      .replaceAll(RegExp(r'[\u0000-\u001F\u007F]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  /// "פתיחת בר אילן": מפעיל אותו אם צריך ומביא אותו לחזית.
  Future<Map<String, Object?>> showResponsa(Map<String, Object?> body) async {
    final report = await _backend.show(
      installPath: await store.repository.sourceInstallPath(),
    );
    if (report.ok) {
      logLine('show${report.broughtToFront ? '' : ' (not brought to front)'}');
      return {'ok': true, 'broughtToFront': report.broughtToFront};
    }
    final failure = report.failure ?? ResponsaFailure.unexpected;
    logLine('show failed: ${failure.name} ${report.message}');
    await _rejectIfNotInstalled(failure);
    throw ApiError.fromAutomationFailure(
      failure,
      report.message ?? 'לא ניתן היה לפתוח את בר אילן.',
    );
  }

  /// `notify: true` — אוצריא מציגה את `message` כמות שהוא (פעולת
  /// `localService.post` מתפריט הקשר), ולכן זה משפט שלם ולא רק הסיבה. אוצריא
  /// מקצרת הודעה ל-200 תווים, ולכן הטקסט המסומן מצוטט בקיצור.
  static String searchNotifyMessage(
    ResponsaSearchOutcome outcome, {
    required String query,
    required bool truncated,
  }) {
    final note = truncated ? ' החיפוש כלל רק את תחילת הטקסט שסומן.' : '';
    final count = outcome.count;
    final reason = outcome.message;
    final quoted = _quote(query);
    return switch (outcome.state) {
      ResponsaSearchState.found => switch (count) {
        null => 'החיפוש $quoted הוצג בבר אילן.$note',
        1 => 'בר אילן מצא תוצאה אחת עבור $quoted.$note',
        _ => 'בר אילן מצא ${_formatCount(count)} תוצאות עבור $quoted.$note',
      },
      ResponsaSearchState.asked =>
        'בר אילן לא מצא את $quoted במאגרים שנבחרו, ושואל אם לחפש בכל '
            'המאגרים. עונים על השאלה בחלון של בר אילן.$note',
      ResponsaSearchState.refused =>
        reason == null
            ? 'בר אילן לא ביצע את החיפוש. הסיבה מוצגת בחלון של בר אילן.$note'
            : 'בר אילן לא ביצע את החיפוש: $reason$note',
      ResponsaSearchState.forms ||
      ResponsaSearchState.invalid ||
      ResponsaSearchState.pending =>
        _searchMessage(outcome) ?? 'החיפוש נשלח לבר אילן.',
    };
  }

  /// `"<שם>" נפתח בבר אילן`, ואם Windows לא הביא את החלון לחזית — איפה הוא.
  static String openedMessage(String title, bool broughtToFront) =>
      broughtToFront
      ? '"$title" נפתח בבר אילן'
      : '"$title" נפתח בבר אילן. אם החלון לא הופיע, הוא בשורת המשימות.';

  /// טקסט של המשתמש בתוך הודעה: במירכאות, ועד [maxQuotedLength] תווים.
  static String _quote(String text) => '"${_shorten(text)}"';

  static const int maxQuotedLength = 40;

  static String _shorten(String text) => text.length <= maxQuotedLength
      ? text
      : '${text.substring(0, maxQuotedLength - 1).trimRight()}…';

  /// `2543` ← `2,543`, כמו בתוסף.
  static String _formatCount(int count) {
    final digits = '$count';
    final out = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) out.write(',');
      out.write(digits[i]);
    }
    return out.toString();
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
        ResponsaSearchState.forms =>
          'בר אילן פתח את "ניהול הצורות". בוחרים בו את הצורות שרוצים ולוחצים '
              '"אישור", ואז יוצגו התוצאות.',
        ResponsaSearchState.found ||
        ResponsaSearchState.invalid ||
        ResponsaSearchState.pending => null,
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
      ResponsaFailure.searchDialogNotFound ||
      ResponsaFailure.databasesDialogNotFound ||
      ResponsaFailure.searchScopeNotFound ||
      ResponsaFailure.queryInvalid =>
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
    ResponsaFailure.databasesDialogNotFound =>
      'בחירת הקטגוריות בבר אילן ("המאגרים המשתתפים") לא הצליחה. ייתכן '
          'שחלון אחר פתוח בבר אילן וממתין לתשובה. יש לסגור אותו ולנסות שוב.',
    // ההודעות של שני אלה נבנות במקום שבו הכשל ידוע (מה לא נמצא, מה בר
    // אילן השיב), ומגיעות ב-[detail].
    ResponsaFailure.searchScopeNotFound =>
      detail ?? 'חלק מהקטגוריות שנבחרו לא נמצאו בבר אילן.',
    ResponsaFailure.queryInvalid =>
      detail ?? 'בר אילן לא קיבל את השאילתה. יש לבדוק את התחביר.',
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

  static bool? _bool(Map<String, Object?> body, String name) {
    final value = body[name];
    if (value == null || value is bool) return value as bool?;
    throw ApiError.badRequest('$name חייב להיות true או false.');
  }

  /// רשימת מחרוזות (או חסר = ריקה), כל אחת עד 1000 תווים.
  static List<String> _strings(Object? value, String name) {
    if (value == null) return const [];
    if (value is! List ||
        value.any((item) => item is! String || item.length > 1000)) {
      throw ApiError.badRequest('$name חייב להיות רשימת מחרוזות.');
    }
    return value.cast<String>();
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
