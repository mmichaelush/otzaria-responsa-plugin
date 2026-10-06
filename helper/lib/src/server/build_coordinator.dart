import 'dart:async';

import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_catalog_build_service.dart';
import 'package:responsa_helper/src/server/api_error.dart';
import 'package:responsa_helper/src/server/catalog_store.dart';
import 'package:responsa_helper/src/server/responsa_backend.dart';

/// אירוע בבנייה, בצורה שנשלחת כשורת NDJSON (docs/PROTOCOL.md §4).
sealed class BuildEvent {
  const BuildEvent();

  Map<String, Object?> toJson();

  bool get isTerminal => false;
}

class BuildStarted extends BuildEvent {
  const BuildStarted();

  @override
  Map<String, Object?> toJson() => {'type': 'start'};
}

class BuildProgressEvent extends BuildEvent {
  final ResponsaBuildStage stage;
  final int scanned;

  /// מספר הצמתים בבנייה הקודמת. בבנייה ראשונה אין מכנה כזה.
  final int? expected;
  final int sectionsDone;
  final int sectionsTotal;

  const BuildProgressEvent({
    required this.stage,
    required this.scanned,
    required this.sectionsDone,
    required this.sectionsTotal,
    this.expected,
  });

  @override
  Map<String, Object?> toJson() => {
    'type': 'progress',
    'stage': stage.name,
    'scanned': scanned,
    if (expected != null) 'expected': expected,
    'sectionsDone': sectionsDone,
    'sectionsTotal': sectionsTotal,
  };
}

/// אין בנייה ולא הייתה בנייה מאז שהשירות עלה.
class BuildIdle extends BuildEvent {
  const BuildIdle();

  @override
  bool get isTerminal => true;

  @override
  Map<String, Object?> toJson() => {'type': 'idle'};
}

class BuildDone extends BuildEvent {
  final int books;
  final int scanned;

  const BuildDone({required this.books, required this.scanned});

  @override
  bool get isTerminal => true;

  @override
  Map<String, Object?> toJson() => {
    'type': 'done',
    'books': books,
    'scanned': scanned,
  };
}

class BuildFailed extends BuildEvent {
  final ApiError error;

  const BuildFailed(this.error);

  @override
  bool get isTerminal => true;

  @override
  Map<String, Object?> toJson() => {'type': 'error', ...error.toJson()};
}

/// בנייה אחת בכל רגע, שאינה קשורה לחיבור שהתחיל אותה: `fetchStream` נחתך
/// אחרי 120 שניות, ובנייה אורכת כמה דקות. חיבור חדש מצטרף לבנייה שרצה
/// ומקבל מיד את מצבה האחרון.
class BuildCoordinator {
  BuildCoordinator({
    required this._backend,
    required this._store,
    required this._targetPath,
  });

  final ResponsaBackend _backend;
  final CatalogStore _store;
  final String _targetPath;

  final Set<StreamController<BuildEvent>> _listeners = {};
  bool _running = false;
  BuildEvent? _last;
  DateTime? _startedAt;

  bool get isRunning => _running;

  /// תוצאת הקריאה האחרונה בשורה אחת, ל-`/diagnostics`. `null` עד הראשונה.
  String? get lastSummary => _lastSummary;
  String? _lastSummary;

  /// קריאה שרצה עכשיו, בשורה אחת, ל-`/diagnostics`.
  String? get runningSummary {
    if (!_running) return null;
    final progress = _lastProgress;
    final started = _startedAt;
    final minutes = started == null
        ? '?'
        : '${DateTime.now().difference(started).inMinutes}';
    return 'for $minutes min, ${progress?.scanned ?? 0} rows'
        '${progress != null && progress.sectionsTotal > 0 ? ', section ${progress.sectionsDone}/${progress.sectionsTotal}' : ''}';
  }

  /// ההתקדמות האחרונה: אחרי כשל, עד היכן הקריאה הגיעה.
  BuildProgressEvent? _lastProgress;

  /// מצב הבנייה ל-`/status`.
  Map<String, Object?> snapshot() {
    final last = _last;
    if (_running) {
      return {
        'state': 'running',
        if (_startedAt != null) 'startedAt': _startedAt!.toIso8601String(),
        if (last is BuildProgressEvent) ...last.toJson()..remove('type'),
      };
    }
    if (last is BuildFailed) {
      return {'state': 'failed', 'error': last.error.toJson()};
    }
    return {'state': 'idle'};
  }

  /// מתחיל בנייה, או מצטרף לזו שרצה. ביטול ההאזנה אינו עוצר את הבנייה.
  Stream<BuildEvent> watchOrStart() {
    final stream = _listen();
    if (!_running) unawaited(_run());
    return stream;
  }

  /// מצטרף לבנייה שרצה בלבד. כשאין כזו: אירוע הסיום האחרון, או [BuildIdle].
  /// כך חיבור מחדש (אחרי חסם זמן או חזרה ללשונית) לא מתחיל בנייה שאיש לא ביקש.
  Stream<BuildEvent> attach() {
    if (_running) return _listen();
    final last = _last;
    return Stream.value(
      last != null && last.isTerminal ? last : const BuildIdle(),
    );
  }

  Stream<BuildEvent> _listen() {
    late final StreamController<BuildEvent> controller;
    controller = StreamController<BuildEvent>(
      onCancel: () => _listeners.remove(controller),
    );
    _listeners.add(controller);
    final last = _last;
    if (_running && last != null) controller.add(last);
    return controller.stream;
  }

  /// `false` כשאין בנייה לבטל.
  bool cancel() {
    if (!_running) return false;
    _cancelRequested = true;
    _backend.cancelBuild();
    return true;
  }

  /// ביטול שהגיע לפני שהמנוע התחיל (בזמן הערכת המכנה) אינו מגיע אליו.
  bool _cancelRequested = false;

  String _summarize(BuildEvent event) {
    final started = _startedAt;
    final elapsed = started == null ? null : DateTime.now().difference(started);
    final when = started == null
        ? ''
        : ' ${started.toIso8601String().substring(0, 16).replaceFirst('T', ' ')}';
    final took = elapsed == null
        ? ''
        : ', ${elapsed.inMinutes}:'
              '${(elapsed.inSeconds % 60).toString().padLeft(2, '0')} min';
    final progress = _lastProgress;
    final reached = progress == null
        ? ''
        : ', reached ${progress.scanned} rows'
              '${progress.sectionsTotal > 0 ? ', section ${progress.sectionsDone}/${progress.sectionsTotal}' : ''}'
              '${progress.expected != null ? ' of ~${progress.expected}' : ''}';
    return switch (event) {
      BuildDone(:final books, :final scanned) =>
        'book list read OK$when$took: $books books from $scanned rows',
      BuildFailed(:final error) =>
        'book list read FAILED$when$took$reached: '
            '${error.code}: ${error.message}',
      _ => 'book list read ended$when$took',
    };
  }

  /// מספר הצמתים שהסריקה קוראת בעצי המהדורות המוכרות (CD25 ו-CD29, בלי
  /// צאצאי מקטעים — `ResponsaCatalogBuilder.mayContainBooks`). בבנייה ראשונה
  /// הוא המכנה, כדי שהאחוז יהיה אמיתי ולא "חלק 6 מתוך 20", שאינם שווים
  /// בגודלם.
  static const Map<int, int> knownNodeCounts = {25: 465701, 29: 586947};

  Future<int?> _expectedNodes() async {
    try {
      final previous = (await _store.repository.info()).nodeCount;
      if (previous != null && previous > 0) return previous;
      final version = (await _backend.status()).version;
      return version == null ? null : knownNodeCounts[version];
    } catch (error) {
      logLine('BuildCoordinator: cannot estimate node count: $error');
      return null;
    }
  }

  Future<void> _run() async {
    _running = true;
    _last = null;
    _lastProgress = null;
    _startedAt = DateTime.now();
    _cancelRequested = false;
    final expected = await _expectedNodes();
    if (_cancelRequested) {
      _finish(
        const BuildFailed(
          ApiError('cancelled', 409, 'קריאת רשימת הספרים בוטלה.'),
        ),
      );
      return;
    }
    _emit(const BuildStarted());
    try {
      await for (final progress in _backend.build(targetPath: _targetPath)) {
        switch (progress.stage) {
          case ResponsaBuildStage.failed:
            _finish(
              BuildFailed(
                ApiError.fromBuildFailure(
                  progress.failure ?? ResponsaBuildFailure.internal,
                  progress.error ?? 'קריאת רשימת הספרים נכשלה.',
                ),
              ),
            );
            return;
          case ResponsaBuildStage.done:
            _store.invalidate();
            _finish(
              BuildDone(books: progress.books, scanned: progress.scannedNodes),
            );
            return;
          case ResponsaBuildStage.starting ||
              ResponsaBuildStage.scanning ||
              ResponsaBuildStage.classifying:
            _emit(
              BuildProgressEvent(
                stage: progress.stage,
                scanned: progress.scannedNodes,
                expected: expected,
                sectionsDone: progress.sectionsDone,
                sectionsTotal: progress.sectionsTotal,
              ),
            );
        }
      }
      _finish(
        const BuildFailed(
          ApiError('internal', 500, 'קריאת רשימת הספרים הסתיימה בלי תוצאה.'),
        ),
      );
    } catch (error, stackTrace) {
      logLine('BuildCoordinator: $error\n$stackTrace');
      _finish(
        BuildFailed(
          ApiError('internal', 500, 'קריאת רשימת הספרים נכשלה: $error'),
        ),
      );
    }
  }

  void _emit(BuildEvent event) {
    _last = event;
    if (event is BuildProgressEvent) _lastProgress = event;
    for (final listener in List.of(_listeners)) {
      listener.add(event);
    }
  }

  void _finish(BuildEvent event) {
    _emit(event);
    _lastSummary = _summarize(event);
    logLine('BuildCoordinator: $_lastSummary');
    _running = false;
    final listeners = List.of(_listeners);
    _listeners.clear();
    for (final listener in listeners) {
      unawaited(listener.close());
    }
    if (event is BuildDone) {
      logLine('build done: ${event.books} books from ${event.scanned} nodes');
    } else if (event is BuildFailed) {
      logLine('build failed: ${event.error}');
    }
  }
}
