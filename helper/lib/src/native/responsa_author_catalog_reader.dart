import 'dart:io';

import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_automation.dart';
import 'package:responsa_helper/src/native/responsa_discovery.dart';
import 'package:responsa_helper/src/native/responsa_tree_reader.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:responsa_helper/src/text/responsa_author_table.dart';
import 'package:responsa_helper/src/text/responsa_book_catalog.dart';

/// המחברים מתוך "קטלוג ספרים" החי (הכפתור "קטלוג" בחלון העיון, ובו "הצג
/// קטלוג מחברים"): המקור השלישי, כשאין מחברים לא ב-`FILE65` ולא ב-`FILE06`
/// — למשל מהדורה שבה מבנה הקבצים אחר. כך זה עובד בכל מהדורה שיש בה הקטלוג,
/// איך שהקבצים בנויים.
///
/// כל פריט בעץ נושא ב-`lParam` את מזהה החיבור, כמו בעץ העיון
/// ([ResponsaAuthorTable.bookIdOf]; נמדד חי ב-CD25: `אבא שאול` = 0x…4818 =
/// 6216, כמו ב-`FILE06`). מחבר של ספר אחד הוא פריט בלי ילדים, והספר
/// בסוגריים שבשמו; מחבר של כמה ספרים הוא פריט שילדיו הספרים.
class ResponsaAuthorCatalogReader {
  ResponsaAuthorCatalogReader._();

  static const int catalogButton = 1139;
  static const int authorsButton = 1199;
  static const int treeId = 1002;
  static const int cancelButton = 2;

  static const Duration _openWait = Duration(seconds: 15);
  static const Duration _switchWait = Duration(seconds: 8);
  static const Duration _poll = Duration(milliseconds: 250);

  /// מזהה החיבור → מחבר. ריק כשאין קטלוג, או כשמשהו לא נענה: זה רק מקור
  /// נוסף, ובנייה לא נכשלת בגללו.
  static Map<int, String> read({
    required ResponsaAutomation automation,
    required DiscoveredDialog citationDialog,
  }) {
    final pid = automation.pid;
    final clock = Stopwatch()..start();
    int? catalog;
    var switched = false;
    try {
      // חלון עיון מוסתר (בוטל קודם) אינו פותח את הקטלוג (נמדד חי): מציגים
      // אותו כמו מהתפריט של בר אילן.
      if (!ResponsaWin32.isVisible(citationDialog.hwnd)) {
        ResponsaWin32.postCommand(
          automation.mainWindow,
          automation.profile.browseCommand,
        );
        _waitFor(
          _openWait,
          () => ResponsaWin32.isVisible(citationDialog.hwnd) ? true : null,
        );
      }
      final open =
          _button(citationDialog.hwnd, catalogButton) ??
          _button(citationDialog.container, catalogButton);
      if (open == null) {
        logLine(
          'ResponsaAuthorCatalog: no "קטלוג" button in the browse dialog',
        );
        return const {};
      }
      // רק מה שכבר היה מוצג: בר אילן מסתיר את הקטלוג בסגירה ומציג שוב את
      // אותו חלון (נמדד חי ב-CD25).
      final before = {
        for (final hwnd in ResponsaWin32.topWindows(pid))
          if (ResponsaWin32.isVisible(hwnd)) hwnd,
      };
      // מודאל: נלחץ ב-Post, אחרת הקריאה נתקעת עד שהוא נסגר.
      ResponsaWin32.postClick(open);
      catalog = _waitFor(_openWait, () {
        for (final hwnd in ResponsaWin32.topWindows(pid)) {
          if (before.contains(hwnd) || !ResponsaWin32.isVisible(hwnd)) continue;
          if (_isCatalog(hwnd, citationDialog)) return hwnd;
        }
        return null;
      });
      if (catalog == null) {
        logLine('ResponsaAuthorCatalog: the catalog dialog did not open');
        return const {};
      }
      final toggle = _button(catalog, authorsButton)!;
      final tree = _tree(catalog)!;
      final label = ResponsaWin32.windowText(toggle);
      // "הצג קטלוג מחברים" כשמוצגים הספרים; אחרי הלחיצה הכיתוב מתחלף.
      if (label.contains('מחבר')) {
        ResponsaWin32.postClick(toggle);
        switched = true;
        final changed = _waitFor(
          _switchWait,
          () => ResponsaWin32.windowText(toggle) != label ? true : null,
        );
        if (changed == null) {
          logLine('ResponsaAuthorCatalog: "$label" did not switch to authors');
          return const {};
        }
        // העץ נבנה מחדש אחרי שהכיתוב מתחלף.
        sleep(const Duration(milliseconds: 600));
      }
      final authors = _readTree(pid, tree);
      logLine(
        'ResponsaAuthorCatalog: ${authors.length} books with an author, '
        'in ${(clock.elapsedMilliseconds / 1000).toStringAsFixed(1)}s',
      );
      return authors;
    } catch (error) {
      logLine('ResponsaAuthorCatalog: $error');
      return const {};
    } finally {
      if (catalog != null && ResponsaWin32.isWindow(catalog)) {
        // בפעם הבאה שהמשתמש פותח את הקטלוג הוא יראה אותו כמו שהשאיר אותו.
        final toggle = _button(catalog, authorsButton);
        if (switched &&
            toggle != null &&
            ResponsaWin32.windowText(toggle).contains('קטלוג')) {
          ResponsaWin32.postClick(toggle);
          sleep(const Duration(seconds: 1));
        }
        final cancel = _button(catalog, cancelButton);
        if (cancel != null) ResponsaWin32.postClick(cancel);
        final dialog = catalog;
        _waitFor(
          const Duration(seconds: 5),
          () =>
              ResponsaWin32.isWindow(dialog) && ResponsaWin32.isVisible(dialog)
              ? null
              : true,
        );
      }
    }
  }

  static Map<int, String> _readTree(int pid, int tree) {
    final session = ResponsaTreeSession.open(pid, tree);
    if (session == null) return const {};
    final byBook = <int, List<String>>{};
    void add(int param, String author) {
      final id = ResponsaAuthorTable.bookIdOf(param);
      if (id == 0 || author.isEmpty) return;
      final names = byBook[id] ??= [];
      if (!names.contains(author)) names.add(author);
    }

    try {
      for (
        var item = session.root;
        item != 0;
        item = session.nextSibling(item)
      ) {
        final read = session.readItem(item);
        if (session.failed) break;
        final name = ResponsaBookCatalog.fromVisual(read.name);
        if (read.children <= 0) {
          final author = ResponsaBookCatalog.authorName(name, singleBook: true);
          if (author != null) add(read.param, author);
          continue;
        }
        final author = ResponsaBookCatalog.authorName(name, singleBook: false);
        for (
          var child = session.firstChild(item);
          child != 0;
          child = session.nextSibling(child)
        ) {
          final book = session.readItem(child);
          if (session.failed) break;
          if (author != null) add(book.param, author);
        }
        session.collapse(item);
      }
    } finally {
      session.close();
    }
    return ResponsaBookCatalog.joined(byBook);
  }

  /// גם בחלון העיון יש פקד 1199 ("כל המאגרים", בעמוד "עץ מקורות") ועץ
  /// 1002: לחיצה שם משנה את העץ שהקריאה קוראת. לכן רק חלון ששמו "קטלוג…",
  /// שאינו חלון העיון, ושהכפתור בו הוא "הצג קטלוג…".
  static bool _isCatalog(int hwnd, DiscoveredDialog citationDialog) {
    if (hwnd == citationDialog.hwnd || hwnd == citationDialog.container) {
      return false;
    }
    if (!ResponsaWin32.windowText(hwnd).trim().startsWith('קטלוג')) {
      return false;
    }
    final toggle = _button(hwnd, authorsButton);
    return toggle != null &&
        ResponsaWin32.windowText(toggle).contains('קטלוג') &&
        _tree(hwnd) != null;
  }

  static int? _button(int parent, int id) {
    for (final child in ResponsaWin32.children(parent)) {
      if (ResponsaWin32.controlId(child) == id &&
          ResponsaWin32.className(child) == 'Button' &&
          ResponsaWin32.isVisible(child)) {
        return child;
      }
    }
    return null;
  }

  static int? _tree(int parent) {
    for (final child in ResponsaWin32.children(parent)) {
      if (ResponsaWin32.controlId(child) == treeId &&
          ResponsaWin32.className(child) == 'SysTreeView32') {
        return child;
      }
    }
    return null;
  }

  static T? _waitFor<T>(Duration limit, T? Function() probe) {
    final clock = Stopwatch()..start();
    while (clock.elapsed < limit) {
      final found = probe();
      if (found != null) return found;
      sleep(_poll);
    }
    return null;
  }
}
