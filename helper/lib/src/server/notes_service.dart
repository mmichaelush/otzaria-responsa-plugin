import 'package:responsa_helper/src/catalog/responsa_catalog_repository.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/notes/annot_reader.dart';
import 'package:responsa_helper/src/notes/notes_store.dart';
import 'package:responsa_helper/src/server/api_error.dart';

/// `POST /notes/list` — ההערות האישיות של המשתמש בבר אילן, לקריאה בלבד
/// (docs/PROTOCOL.md). הקובץ שייך למשתמש ואינו תוכן של בר אילן; השירות אינו
/// כותב אליו אף פעם.
class NotesService {
  NotesService({
    required this._installations,
    required this._preferredInstallPath,
    NotesStore? store,
  }) : _store = store ?? NotesStore();

  static const int maxPageSize = 200;
  static const int maxQueryLength = 200;

  final Future<List<ResponsaInstallation>> Function() _installations;

  /// ההתקנה שממנה נבנה הקטלוג: כשיש כמה התקנות, ההערות שלה הן שמעניינות.
  final Future<String?> Function() _preferredInstallPath;
  final NotesStore _store;

  Future<Map<String, Object?>> list(Map<String, Object?> body) async {
    final query = _query(body);
    final offset = _integer(body, 'offset', fallback: 0, min: 0);
    final limit = _integer(body, 'limit', fallback: 100, max: maxPageSize);

    final installations = await _installations();
    if (installations.isEmpty) {
      throw const ApiError(
        'notInstalled',
        409,
        'בר אילן (פרויקט השו"ת) אינו מותקן במחשב הזה.',
      );
    }
    final installation = _choose(installations, await _preferredInstallPath());
    final file = installation.annotPath;
    if (file == null) {
      // משתמש שלא כתב הערה אף פעם: מצב רגיל, לא תקלה.
      return {'available': false, 'all': 0, 'total': 0, 'notes': const []};
    }

    final NotesPage page;
    try {
      page = _store.page(file, query: query, offset: offset, limit: limit);
    } on AnnotReadException catch (error) {
      logLine('notes: $error ($file)');
      throw ApiError('notesUnreadable', 500, error.message);
    }
    return {
      'available': true,
      'all': page.all,
      'total': page.total,
      'offset': offset,
      'empty': page.empty,
      if (page.modified case final modified?)
        'modified': modified.toUtc().toIso8601String(),
      'notes': [for (final note in page.notes) note.toJson()],
    };
  }

  /// קודם ההתקנה של הקטלוג, אחריה זו שיש בה קובץ הערות, ובסוף הראשונה.
  static ResponsaInstallation _choose(
    List<ResponsaInstallation> installations,
    String? preferredPath,
  ) {
    if (preferredPath != null) {
      final wanted = ResponsaCatalogInfo.comparablePath(preferredPath);
      for (final installation in installations) {
        if (ResponsaCatalogInfo.comparablePath(installation.installPath) ==
            wanted) {
          return installation;
        }
      }
    }
    return installations.firstWhere(
      (installation) => installation.annotPath != null,
      orElse: () => installations.first,
    );
  }

  static String _query(Map<String, Object?> body) {
    final value = body['q'];
    if (value == null) return '';
    if (value is! String || value.length > maxQueryLength) {
      throw const ApiError.badRequest('q חייב להיות טקסט קצר.');
    }
    return value.trim();
  }

  static int _integer(
    Map<String, Object?> body,
    String name, {
    required int fallback,
    int min = 1,
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
