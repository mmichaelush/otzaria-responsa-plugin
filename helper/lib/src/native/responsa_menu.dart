import 'dart:ffi';

import 'package:ffi/ffi.dart';

/// קריאה של תפריט החלון הראשי של בר אילן, כדי למצוא פקודה **לפי הכיתוב**.
/// מזהי הפקודות משתנים בין מהדורות (`עיון` הוא 32781 ב-25), ולכן פקודה שאינה
/// בפרופיל הגרסה נמצאת כאן, ומזהה ידוע משמש רק נסיגה.
class ResponsaMenu {
  ResponsaMenu._();

  static final DynamicLibrary _user32 = DynamicLibrary.open('user32.dll');

  static final int Function(int) _getMenu = _user32
      .lookupFunction<IntPtr Function(IntPtr), int Function(int)>('GetMenu');
  static final int Function(int) _count = _user32
      .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
        'GetMenuItemCount',
      );
  static final int Function(int, int) _itemId = _user32
      .lookupFunction<Uint32 Function(IntPtr, Int32), int Function(int, int)>(
        'GetMenuItemID',
      );
  static final int Function(int, int) _subMenu = _user32
      .lookupFunction<IntPtr Function(IntPtr, Int32), int Function(int, int)>(
        'GetSubMenu',
      );
  static final int Function(int, int, Pointer<Utf16>, int, int) _text = _user32
      .lookupFunction<
        Int32 Function(IntPtr, Uint32, Pointer<Utf16>, Int32, Uint32),
        int Function(int, int, Pointer<Utf16>, int, int)
      >('GetMenuStringW');

  static const int _byPosition = 0x400;
  static const int _notACommand = 0xFFFFFFFF;
  static const int _maxText = 256;

  /// מזהה הפקודה של הפריט ש**כיתובו** [wanted], בכל עומק התפריט, או `null`.
  /// ההשוואה בלי קיצור מקלדת (`&`) ובלי טקסט המקשים (`\tCtrl+C`), כך ש
  /// `ה&עתק\tCtrl+C` הוא `העתק` ואינו `העתק עם הערות`.
  static int? commandOf(int mainWindow, String wanted) {
    final root = _getMenu(mainWindow);
    if (root == 0) return null;
    return _find(root, wanted, 0);
  }

  static int? _find(int menu, String wanted, int depth) {
    if (depth > 4) return null;
    final count = _count(menu);
    for (var i = 0; i < count; i++) {
      final id = _itemId(menu, i);
      if (id != _notACommand && id != 0 && _label(menu, i) == wanted) return id;
      final sub = _subMenu(menu, i);
      if (sub != 0) {
        final found = _find(sub, wanted, depth + 1);
        if (found != null) return found;
      }
    }
    return null;
  }

  static String _label(int menu, int position) {
    final buffer = calloc<Uint16>(_maxText).cast<Utf16>();
    try {
      final length = _text(menu, position, buffer, _maxText, _byPosition);
      if (length <= 0) return '';
      return normalize(buffer.toDartString(length: length));
    } finally {
      calloc.free(buffer);
    }
  }

  /// כיתוב תפריט בלי `&` ובלי הטקסט שאחרי טאב.
  static String normalize(String raw) =>
      raw.split('\t').first.replaceAll('&', '').trim();
}
