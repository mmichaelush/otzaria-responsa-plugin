@TestOn('windows')
library;

import 'dart:ffi';

import 'package:ffi/ffi.dart';
import 'package:responsa_helper/src/native/responsa_win32.dart';
import 'package:test/test.dart';
import 'package:win32/win32.dart';

/// רשימת התוצאות של בר אילן (פקד 1617) היא Multi-Select, ובפתיחה כבר מסומן בה
/// הפריט הראשון: `LB_SETSEL` לבדו מוסיף לבחירה, ו"הצג טקסט" פותח את כל
/// המסומנים — "מגן אברהם סימן מא" נפתח יחד עם סימן א (דיווח משתמש, 23.11.2026).
/// הבדיקה מול `ListBox` אמיתי באותו סגנון.
void main() {
  const lbAddString = 0x0180;
  const lbGetSel = 0x0187;
  const lbGetSelCount = 0x0190;
  const lbsNotify = 0x0001;
  const lbsMultipleSel = 0x0008;
  const wsChild = 0x40000000;
  const wsPopup = 0x80000000;

  late int parent;
  late int list;

  int create(String className, int style, {int parent = 0}) {
    final name = className.toNativeUtf16();
    try {
      final result = CreateWindowEx(
        const WINDOW_EX_STYLE(0),
        PCWSTR(name),
        null,
        WINDOW_STYLE(style),
        0,
        0,
        200,
        200,
        parent == 0 ? null : HWND(Pointer.fromAddress(parent)),
        null,
        null,
        null,
      );
      expect(result.value.address, isNot(0), reason: 'CreateWindowEx נכשל');
      return result.value.address;
    } finally {
      calloc.free(name);
    }
  }

  void addItems(int count) {
    for (var i = 0; i < count; i++) {
      final text = 'סימן $i'.toNativeUtf16();
      try {
        ResponsaWin32.send(list, lbAddString, lParam: text.address);
      } finally {
        calloc.free(text);
      }
    }
  }

  bool isSelected(int index) =>
      (ResponsaWin32.send(list, lbGetSel, wParam: index) ?? 0) > 0;

  int selectedCount() => ResponsaWin32.send(list, lbGetSelCount) ?? -1;

  setUp(() {
    // חלון עליון שאינו מוצג, וב-ListBox שבתוכו אותו סגנון של בר אילן.
    parent = create('STATIC', wsPopup);
    list = create(
      'LISTBOX',
      wsChild | lbsNotify | lbsMultipleSel,
      parent: parent,
    );
    addItems(60);
  });

  tearDown(() {
    DestroyWindow(HWND(Pointer.fromAddress(parent)));
  });

  test('בחירת פריט מחליפה את הבחירה הקיימת ואינה מצטרפת אליה', () {
    // כמו בר אילן אחרי ניתוח ההפניה: הפריט הראשון כבר מסומן.
    ResponsaWin32.send(list, ResponsaWin32.lbSetSel, wParam: 1, lParam: 0);
    expect(selectedCount(), 1);

    ResponsaWin32.listBoxSelect(parent, list, 40);

    expect(isSelected(40), isTrue);
    expect(isSelected(0), isFalse, reason: 'הפריט הראשון אינו נשאר מסומן');
    expect(selectedCount(), 1, reason: 'רק מה שנבחר ייפתח ב"הצג טקסט"');
  });

  test('בחירה חוזרת בפריט אחר, ובפריט הראשון, משאירה פריט אחד', () {
    ResponsaWin32.listBoxSelect(parent, list, 12);
    ResponsaWin32.listBoxSelect(parent, list, 30);
    expect(isSelected(12), isFalse);
    expect(isSelected(30), isTrue);
    expect(selectedCount(), 1);

    ResponsaWin32.listBoxSelect(parent, list, 0);
    expect(isSelected(30), isFalse);
    expect(isSelected(0), isTrue);
    expect(selectedCount(), 1);
  });

  test('בחירה ברשימה שאין בה בחירה קודמת', () {
    ResponsaWin32.listBoxSelect(parent, list, 7);
    expect(isSelected(7), isTrue);
    expect(selectedCount(), 1);
  });
}
