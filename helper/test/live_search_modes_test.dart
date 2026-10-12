// כלי מדידה ידני: חיפוש מתקדם ורגיל בבר אילן החי, גם כשעל המסך "חיפוש
// טבלאי" (כמו שדווח מבר אילן 31), ובלי חלון ניהול הצורות; וניסוח חופשי.
// dart test --run-skipped test/live_search_modes_test.dart
@Tags(['live'])
library;

// כלי מדידה ידני: הפלט שלו הוא **התוצר**, והוא נקרא בטרמינל.
// ignore_for_file: avoid_print

import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_controller.dart';
import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/native/responsa_installation_discovery.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_search_automation.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:test/test.dart';

/// כפתורי המעבר בין סוגי החיפוש, כמו ב-ResponsaSearchAutomation.
const List<int> _modeButtons = [1207, 1208, 1209, 1189];

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

/// חלונות תוצאות שחיפושים קודמים של הבדיקה השאירו (`נמצאו N תוצאות`, ושל
/// ניסוח חופשי `    1-6`): בתקרת החלונות של בר אילן החיפוש הבא נכשל.
/// סגירת חלון MDI כשסיכום "N תוצאות" פתוח הפילה את בר אילן 25 פעמיים
/// (0xc0000005, נמדד), ולכן הסיכום נסגר קודם, כמו בשירות.
void _closeResultWindows() {
  final results = RegExp(r'^\s*(נמצאו \d[\d,]* תוצאות\s+)?\d+-\d+\s*$');
  for (final instance in ResponsaWin32.topWindowsByClass('ResponsaProject')) {
    if (!ResponsaWin32.isOnScreen(instance.hwnd)) continue;
    for (final summary in ResponsaDiscovery.discoverAll(
      instance.pid,
      ResponsaVersionProfile.searchSummaryHintsDefault,
    )) {
      ResponsaWin32.click(summary.handle('ok_button')!);
    }
    final client = ResponsaWin32.mdiClient(instance.hwnd);
    if (client == null) continue;
    for (final child in ResponsaWin32.directChildren(client)) {
      if (results.hasMatch(ResponsaWin32.windowText(child))) {
        ResponsaWin32.destroyMdiChild(instance.hwnd, child);
      }
    }
  }
}

void main() {
  test('search modes', () async {
    _closeResultWindows();
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
      expect(report.ok, isTrue);
      // בר אילן מסתיר את חלון החיפוש אחרי חיפוש שמצא; חלון שנשאר הוא
      // התקלה מבר אילן 31 ו-32.
      expect(_visible(pid), isEmpty, reason: label);
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
    await run(
      'free',
      'האם מותר לנסוע באופניים בשבת',
      const ResponsaSearchSetup(freeForm: true),
    );
    print('tabular shown: ${await _showTabular(pid)}');
    await run(
      'free from tabular',
      'האם מותר לנסוע באופניים בשבת',
      const ResponsaSearchSetup(freeForm: true),
    );
    await run(
      'easy after free',
      'נר שבת',
      const ResponsaSearchSetup(easy: true),
    );
    print('tabular shown: ${await _showTabular(pid)}');
    await run(
      'easy from tabular',
      'נר שבת',
      const ResponsaSearchSetup(easy: true),
    );
    await run(
      'advanced after free',
      '#שבת [1:3] #נר',
      const ResponsaSearchSetup(advanced: true, showForms: false),
    );
  }, timeout: const Timeout(Duration(minutes: 10)));

  // כמו שדווח מבר אילן 31 ו-32, ובנוי כאן כמו ש-0.5.6 יצר אותו: "חיפוש
  // טבלאי" על המסך, ומעבר ל"ניסוח חופשי" מחלון מוסתר. "ביטול" של הטבלאי
  // לא עושה אז כלום.
  test('a stale tabular window is closed', () async {
    _closeResultWindows();
    final controller = ResponsaController(allowAutoStart: () => true);
    final report = await controller.searchText(
      'נר שבת',
      setup: const ResponsaSearchSetup(easy: true),
    );
    expect(report.ok, isTrue, reason: report.message);
    await Future<void>.delayed(const Duration(seconds: 1));
    final main = ResponsaWin32.topWindowsByClass(
      'ResponsaProject',
    ).firstWhere((w) => ResponsaWin32.isOnScreen(w.hwnd));
    final automation = ResponsaSearchAutomation(
      ResponsaAutomation(
        pid: main.pid,
        profile: ResponsaVersionProfile.forVersion(
          ResponsaInstallationDiscovery.versionFromWindowTitle(
            ResponsaWin32.windowText(main.hwnd),
          ),
        ),
      ),
    );
    automation.closeSearchSummaries();
    expect(await _showTabular(main.pid), isTrue);
    final hidden = _searchKinds(
      main.pid,
    ).firstWhere((h) => ResponsaWin32.windowText(h).contains('קל'));
    ResponsaWin32.postClick(
      ResponsaWin32.children(
        hidden,
      ).firstWhere((c) => ResponsaWin32.controlId(c) == 1189),
    );
    await Future<void>.delayed(const Duration(seconds: 2));
    final free = _searchKinds(
      main.pid,
      visibleOnly: true,
    ).firstWhere((h) => ResponsaWin32.windowText(h).contains('חופשי'));
    ResponsaWin32.postClick(
      ResponsaWin32.children(
        free,
      ).firstWhere((c) => ResponsaWin32.controlId(c) == 2),
    );
    await Future<void>.delayed(const Duration(seconds: 1));
    print('stale: ${_visible(main.pid)}');
    expect(_visible(main.pid), contains('טבלאי'));
    automation.closeLeftoverSearchWindows(0);
    print('after: ${_visible(main.pid)}');
    expect(_visible(main.pid), isEmpty);
  }, timeout: const Timeout(Duration(minutes: 3)));
}
