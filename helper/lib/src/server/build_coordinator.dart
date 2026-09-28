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
/// אחרי 120 שניות, ובנייה אורכת כחמש דקות. חיבור חדש מצטרף לבנייה שרצה
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
    _backend.cancelBuild();
    return true;
  }

  /// מספר הצמתים שנמדד בעצי המהדורות המוכרות (docs/57). בבנייה ראשונה
  /// הוא המכנה, כדי שהאחוז יהיה אמיתי ולא "חלק 6 מתוך 20" שאינם שווים.
  static const Map<int, int> knownNodeCounts = {25: 1251889, 29: 1552791};

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
    _startedAt = DateTime.now();
    final expected = await _expectedNodes();
    _emit(const BuildStarted());
    try {
      await for (final progress in _backend.build(targetPath: _targetPath)) {
        switch (progress.stage) {
          case ResponsaBuildStage.failed:
            _finish(
              BuildFailed(
                ApiError.fromBuildFailure(
                  progress.failure ?? ResponsaBuildFailure.internal,
                  progress.error ?? 'בניית הקטלוג נכשלה.',
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
          ApiError('internal', 500, 'בניית הקטלוג הסתיימה ללא תוצאה.'),
        ),
      );
    } catch (error, stackTrace) {
      logLine('BuildCoordinator: $error\n$stackTrace');
      _finish(
        BuildFailed(ApiError('internal', 500, 'בניית הקטלוג נכשלה: $error')),
      );
    }
  }

  void _emit(BuildEvent event) {
    _last = event;
    for (final listener in List.of(_listeners)) {
      listener.add(event);
    }
  }

  void _finish(BuildEvent event) {
    _emit(event);
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
