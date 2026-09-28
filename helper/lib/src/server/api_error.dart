import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';

/// כשל שמוחזר ללקוח. `code` הוא החוזה (docs/PROTOCOL.md §3), ו-`message`
/// מוכנה להצגה למשתמש.
class ApiError implements Exception {
  final String code;
  final int status;
  final String message;
  final Map<String, Object?>? details;

  const ApiError(this.code, this.status, this.message, [this.details]);

  const ApiError.badRequest(String message) : this('badRequest', 400, message);

  const ApiError.forbidden(String message) : this('forbidden', 403, message);

  const ApiError.catalogMissing()
    : this(
        'catalogMissing',
        404,
        'קטלוג ספרי בר אילן עדיין לא נבנה. יש ללחוץ על "בניית קטלוג".',
      );

  const ApiError.unknownBook()
    : this(
        'unknownBook',
        404,
        'הספר לא נמצא בקטלוג. ייתכן שהקטלוג נבנה מחדש מאז; יש לחפש שוב.',
      );

  const ApiError.busy(String message) : this('busy', 409, message);

  factory ApiError.fromOpenFailure(
    ResponsaFailure failure,
    String message, {
    List<String> triedRefs = const [],
  }) {
    final details = triedRefs.isEmpty ? null : {'triedRefs': triedRefs};
    return switch (failure) {
      ResponsaFailure.responsaNotRunning => ApiError(
        'notRunning',
        409,
        message,
        details,
      ),
      ResponsaFailure.citationDialogNotFound ||
      ResponsaFailure.resultsNotCleared => ApiError(
        'dialogNotFound',
        502,
        message,
        details,
      ),
      ResponsaFailure.referenceNotParsed => ApiError(
        'referenceNotFound',
        404,
        message,
        details,
      ),
      ResponsaFailure.openedWrongBook => ApiError(
        'wrongBook',
        409,
        message,
        details,
      ),
      ResponsaFailure.mdiWindowLimitReached => ApiError(
        'windowLimit',
        409,
        message,
        details,
      ),
      ResponsaFailure.timeout => ApiError(
        'notResponding',
        504,
        message,
        details,
      ),
      ResponsaFailure.cancelled => ApiError('cancelled', 409, message, details),
    };
  }

  factory ApiError.fromBuildFailure(
    ResponsaBuildFailure failure,
    String message,
  ) => switch (failure) {
    ResponsaBuildFailure.busy => ApiError('busy', 409, message),
    ResponsaBuildFailure.notSupported ||
    ResponsaBuildFailure.notInstalled => ApiError('notInstalled', 409, message),
    ResponsaBuildFailure.notRunning => ApiError('notRunning', 409, message),
    ResponsaBuildFailure.elevated => ApiError('elevated', 409, message),
    ResponsaBuildFailure.treeNotFound => ApiError(
      'dialogNotFound',
      502,
      message,
    ),
    ResponsaBuildFailure.notResponding => ApiError(
      'notResponding',
      504,
      message,
    ),
    ResponsaBuildFailure.cancelled => ApiError('cancelled', 409, message),
    ResponsaBuildFailure.internal => ApiError('internal', 500, message),
  };

  Map<String, Object?> toJson() => {
    'code': code,
    'message': message,
    if (details != null) 'details': details,
  };

  @override
  String toString() => '$code: $message';
}
