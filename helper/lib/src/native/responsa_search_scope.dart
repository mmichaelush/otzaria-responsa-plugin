import 'package:responsa_helper/src/catalog/responsa_failure.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/native/responsa_profile.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:responsa_helper/src/text/responsa_hebrew.dart';
import 'package:responsa_helper/src/text/responsa_names.dart';

/// בחירת הקטגוריות והספרים שהחיפוש ירוץ בהם, ב"ניהול המאגרים" של בר אילן
/// (הכפתור "המאגרים המשתתפים" בחלון החיפוש).
///
/// נמדד בגרסה 25: העץ מימין לשמאל, וסמל הספר שליד כל פריט מראה את מצבו:
/// [_selected] ירוק, [_cleared] אדום, ו-2 חלקי. לחיצה על הסמל
/// מחליפה את מצבו; "התחל שוב" מנקה הכול. הלחיצה נשלחת כהודעת עכבר אל
/// העץ עצמו, כך שהסמן של המשתמש אינו זז, והדיאלוג עובד גם מחוץ למסך (שם
/// בר אילן פותח אותו כשהחלון הראשי ממוזער).
///
/// הבחירה נשמרת בבר אילן, כמו בחירה ידנית, ותקפה גם לחיפושים הבאים בו.
class ResponsaSearchScope {
  final ResponsaAutomation _automation;

  ResponsaSearchScope(this._automation);

  int get _pid => _automation.pid;

  static const int _selected = 0;
  static const int _cleared = 1;

  /// הכפתור "המאגרים המשתתפים" בחלון החיפוש.
  static const int databasesButtonId = 1210;

  /// הסמל משמאל לטקסט בקואורדינטות הלוגיות של העץ, ברוחב 16.
  static const int _iconOffset = 8;

  static const DialogHints databasesHints = DialogHints(
    role: 'databases',
    windowClass: '#32770',
    controls: [
      ControlHints(
        role: 'tree',
        classNames: {'SysTreeView32'},
        controlIds: {1002},
      ),
      ControlHints(
        role: 'clear_button',
        classNames: {'Button'},
        controlIds: {1136},
        textContains: {'התחל שוב', 'Start', 'Recommencer'},
      ),
      ControlHints(
        role: 'ok_button',
        classNames: {'Button'},
        controlIds: {1649},
        textContains: {'אישור', 'OK'},
      ),
      ControlHints(
        role: 'cancel_button',
        classNames: {'Button'},
        controlIds: {1651},
        textContains: {'ביטול', 'Cancel', 'Annuler'},
      ),
    ],
  );

  /// בוחר בדיוק את [paths] (כל נתיב: שמות התצוגה מהשורש עד הקטגוריה או
  /// הספר). מחזיר את הנתיבים שלא נמצאו בעץ; אז הבחירה של המשתמש נשארת
  /// כפי שהייתה, כדי שחיפוש לא ירוץ בטעות בתחום אחר.
  List<String> select(
    int searchDialog,
    List<List<String>> paths,
    ResponsaDeadline deadline,
  ) {
    final button = _child(searchDialog, databasesButtonId);
    if (button == null) {
      throw const ResponsaAutomationException(
        ResponsaFailure.databasesDialogNotFound,
        'בחלון החיפוש של בר אילן אין כפתור "המאגרים המשתתפים"',
      );
    }
    // מודאל: לחיצה ממתינה הייתה חוזרת רק כשהוא נסגר.
    ResponsaWin32.postClick(button);
    final dialog = _awaitDialog(deadline);
    final tree = dialog.handle('tree')!;
    final session = ResponsaTreeSession.open(_pid, tree);
    if (session == null) {
      ResponsaWin32.postClick(dialog.handle('cancel_button')!);
      throw const ResponsaAutomationException(
        ResponsaFailure.databasesDialogNotFound,
        'אין גישה לעץ המאגרים של בר אילן',
      );
    }
    try {
      ResponsaWin32.postClick(dialog.handle('clear_button')!);
      _awaitRoots(session, _cleared, deadline);

      final missing = <String>[];
      for (final path in paths) {
        final item = _find(session, path);
        if (item == null) {
          missing.add(path.join(' / '));
          continue;
        }
        // ספר בתוך קטגוריה שכבר נבחרה: לחיצה הייתה מבטלת אותו.
        if (session.readItem(item).image == _selected) continue;
        if (!_toggle(session, tree, item, deadline)) {
          missing.add(path.join(' / '));
        }
      }
      if (missing.isNotEmpty) {
        logLine('ResponsaSearchScope: לא נמצאו בעץ המאגרים: $missing');
        ResponsaWin32.postClick(dialog.handle('cancel_button')!);
        _awaitClosed(dialog.hwnd, deadline);
        return missing;
      }
      ResponsaWin32.postClick(dialog.handle('ok_button')!);
      _awaitClosed(dialog.hwnd, deadline);
      return const [];
    } on ResponsaAutomationException {
      // דיאלוג שנשאר פתוח היה חוסם את בר אילן; ביטול משאיר את הבחירה הקודמת.
      if (ResponsaWin32.isWindow(dialog.hwnd)) {
        ResponsaWin32.postClick(dialog.handle('cancel_button')!);
      }
      rethrow;
    } finally {
      session.close();
    }
  }

  DiscoveredDialog _awaitDialog(ResponsaDeadline deadline) {
    final own = deadline.within(ResponsaAutomation.dialogBudget);
    while (!own.expired) {
      _automation.pause(ResponsaAutomation.poll, deadline);
      final found = ResponsaDiscovery.discoverDialog(_pid, databasesHints);
      if (found != null && ResponsaWin32.isVisible(found.hwnd)) return found;
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.databasesDialogNotFound,
      'חלון "המאגרים המשתתפים" של בר אילן לא נפתח בזמן',
    );
  }

  void _awaitRoots(
    ResponsaTreeSession session,
    int image,
    ResponsaDeadline deadline,
  ) {
    final own = deadline.within(const Duration(seconds: 5));
    while (!own.expired) {
      final roots = _siblings(session, session.root);
      if (roots.isNotEmpty &&
          roots.every((item) => session.readItem(item).image == image)) {
        return;
      }
      _automation.pause(ResponsaAutomation.poll, deadline);
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.databasesDialogNotFound,
      'בר אילן לא ניקה את בחירת המאגרים',
    );
  }

  void _awaitClosed(int dialog, ResponsaDeadline deadline) {
    final own = deadline.within(ResponsaAutomation.dialogBudget);
    while (!own.expired) {
      if (!ResponsaWin32.isWindow(dialog) || !ResponsaWin32.isVisible(dialog)) {
        return;
      }
      _automation.pause(ResponsaAutomation.poll, deadline);
    }
    throw const ResponsaAutomationException(
      ResponsaFailure.databasesDialogNotFound,
      'חלון "המאגרים המשתתפים" של בר אילן לא נסגר',
    );
  }

  /// הולך בעץ לפי השמות, ופורש כל רמה בדרך (העץ נטען עצלנית).
  int? _find(ResponsaTreeSession session, List<String> path) {
    var level = _siblings(session, session.root);
    int? item;
    for (var depth = 0; depth < path.length; depth++) {
      final names = [for (final i in level) session.readItem(i).name];
      final index = matchName(path[depth], names);
      if (index == null) return null;
      item = level[index];
      if (depth + 1 < path.length) {
        level = _siblings(session, session.firstChild(item));
      }
    }
    return item;
  }

  bool _toggle(
    ResponsaTreeSession session,
    int tree,
    int item,
    ResponsaDeadline deadline,
  ) {
    session.ensureVisible(item);
    final rect = session.itemRect(item);
    if (rect == null) return false;
    ResponsaWin32.postMouseClick(
      tree,
      rect.left - _iconOffset,
      (rect.top + rect.bottom) ~/ 2,
    );
    final own = deadline.within(const Duration(seconds: 3));
    while (!own.expired) {
      _automation.pause(ResponsaAutomation.poll, deadline);
      if (session.readItem(item).image == _selected) return true;
    }
    return false;
  }

  static List<int> _siblings(ResponsaTreeSession session, int first) => [
    for (var item = first; item != 0; item = session.nextSibling(item)) item,
  ];

  static int? _child(int dialog, int id) {
    for (final child in ResponsaWin32.children(dialog)) {
      if (ResponsaWin32.controlId(child) == id) return child;
    }
    return null;
  }

  /// איזה מבין [treeNames] (בסדר החזותי של העץ) הוא [wanted] (שם תצוגה
  /// מהקטלוג). שמות העץ של החיפוש כמעט זהים לאלה של עץ העיון, שממנו נבנה
  /// הקטלוג, אבל לא תמיד: `תנ"ך` בחיפוש הוא `תנ"ך (החומש מחולק לפרקים)`
  /// בעיון. לכן לפי הסדר: שם זהה, כתיב זהה, ליבה זהה (בלי ההסתייגות
  /// שבסוגריים), ולבסוף התחלה משותפת — רק כשיש בדיוק התאמה אחת.
  static int? matchName(String wanted, List<String> treeNames) {
    final display = [
      for (final name in treeNames)
        ResponsaNames.displayOf(name).replaceAll('/', '∕'),
    ];
    final index = display.indexOf(wanted);
    if (index >= 0) return index;

    int? only(bool Function(String name) test) {
      int? found;
      for (var i = 0; i < display.length; i++) {
        if (!test(display[i])) continue;
        if (found != null) return null;
        found = i;
      }
      return found;
    }

    final key = ResponsaHebrew.spellingKey(wanted);
    if (key.isEmpty) return null;
    final bySpelling = only((name) => ResponsaHebrew.spellingKey(name) == key);
    if (bySpelling != null) return bySpelling;

    String core(String name) =>
        ResponsaHebrew.spellingKey(ResponsaNames.withoutQualifier(name));
    final wantedCore = core(wanted);
    if (wantedCore.isNotEmpty) {
      final byCore = only((name) => core(name) == wantedCore);
      if (byCore != null) return byCore;
    }
    return only((name) {
      final other = ResponsaHebrew.spellingKey(name);
      return other.isNotEmpty &&
          (other.startsWith('$key ') || key.startsWith('$other '));
    });
  }
}
