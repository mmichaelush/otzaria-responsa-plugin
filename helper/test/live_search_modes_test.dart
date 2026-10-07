// כלי מדידה ידני: חיפוש מתקדם ורגיל בבר אילן החי, גם כשעל המסך "חיפוש
// טבלאי" (כמו שדווח מבר אילן 31), ובלי חלון ניהול הצורות.
// dart test --run-skipped test/live_search_modes_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:test/test.dart';

/// כפתורי המעבר בין סוגי החיפוש, כמו ב-ResponsaSearchAutomation.
const List<int> _modeButtons = [1207, 1208, 1209, 1210];

List<int> _searchKinds(int pid, {bool visibleOnly = false}) => [
  for (final hwnd in ResponsaWin32.topWindows(pid))
    if (ResponsaWin32.className(hwnd) == '#32770' &&
        (!visibleOnly || ResponsaWin32.isVisible(hwnd)) &&
        _modeButtons.every(
          (id) => ResponsaWin32.children(
            hwnd,
          ).any((c) => ResponsaWin32.controlId(c) == id),
        ))
      hwnd,
];

String _visible(int pid) => [
  for (final hwnd in _searchKinds(pid, visibleOnly: true))
    '"${ResponsaWin32.windowText(hwnd)}"',
].join(', ');

/// מציג את "חיפוש טבלאי" בלחיצות על כפתורי המעבר, כמו משתמש.
Future<bool> _showTabular(int pid) async {
  for (final id in _modeButtons) {
    final from = _searchKinds(pid).first;
    final button = ResponsaWin32.children(
      from,
    ).firstWhere((c) => ResponsaWin32.controlId(c) == id);
    ResponsaWin32.postClick(button);
    await Future<void>.delayed(const Duration(seconds: 2));
    print('button $id -> visible: ${_visible(pid)}');
    if (_visible(pid).contains('טבלאי')) return true;
  }
  return false;
}

void main() {
  test('search modes', () async {
    final controller = ResponsaController(allowAutoStart: () => true);
    // נקבע אחרי החיפוש הראשון, שמפעיל את בר אילן כשהוא סגור. מופעים חונים
    // מחוץ למסך אינם נבחרים, כמו בשירות.
    int pidNow() => ResponsaWin32.topWindowsByClass(
      'ResponsaProject',
    ).firstWhere((w) => ResponsaWin32.isOnScreen(w.hwnd)).pid;
    var pid = 0;
    Future<void> run(
      String label,
      String query,
      ResponsaSearchSetup setup,
    ) async {
      final watch = Stopwatch()..start();
      final report = await controller.searchText(query, setup: setup);
      pid = pidNow();
      print(
        '$label "$query" ${watch.elapsedMilliseconds}ms: '
        '${report.ok ? report.outcome!.state.name : 'FAILED ${report.failure?.name} ${report.message}'}'
        '${report.outcome?.count == null ? '' : ' count=${report.outcome!.count}'}'
        ' | visible after: ${_visible(pid)}',
      );
      await Future<void>.delayed(const Duration(seconds: 2));
    }

    await run(
      'advanced',
      '#שבת [1:3] #נר',
      const ResponsaSearchSetup(advanced: true, showForms: false),
    );
    await run('simple', 'נר שבת', const ResponsaSearchSetup(showForms: false));
    print('tabular shown: ${await _showTabular(pid)}');
    await run(
      'advanced from tabular',
      '#שבת [1:3] #נר',
      const ResponsaSearchSetup(advanced: true, showForms: false),
    );
    print('tabular shown: ${await _showTabular(pid)}');
    await run(
      'simple from tabular',
      'נר שבת',
      const ResponsaSearchSetup(showForms: false),
    );
  }, timeout: const Timeout(Duration(minutes: 10)));
}
