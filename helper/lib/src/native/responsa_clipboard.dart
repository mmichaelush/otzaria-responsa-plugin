import 'dart:ffi';
import 'dart:io' show sleep;
import 'dart:typed_data';

/// מה שהיה בלוח כשהתחלנו, כדי להחזיר אותו: טקסט, קבצים ותמונה (DIB), לא
/// פורמטים פרטיים של תוכנות אחרות.
class ResponsaClipboardSnapshot {
  final List<({int format, Uint8List data})> items;
  const ResponsaClipboardSnapshot(this.items);
}

/// הלוח של Windows, למה שהשירות צריך: להעתיק טקסט מחלון של בר אילן שאין לו
/// פקד טקסט לקרוא ממנו (הביוגרפיות, docs/ARCHITECTURE.md), ולהחזיר את מה
/// שהמשתמש העתיק קודם. חוסם: רק מאיזולט רקע.
class ResponsaClipboard {
  ResponsaClipboard._();

  static final DynamicLibrary _user32 = DynamicLibrary.open('user32.dll');
  static final DynamicLibrary _kernel32 = DynamicLibrary.open('kernel32.dll');

  static final int Function(int) _open = _user32
      .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
        'OpenClipboard',
      );
  static final int Function() _close = _user32
      .lookupFunction<Int32 Function(), int Function()>('CloseClipboard');
  static final int Function() _empty = _user32
      .lookupFunction<Int32 Function(), int Function()>('EmptyClipboard');
  static final int Function(int) _enum = _user32
      .lookupFunction<Uint32 Function(Uint32), int Function(int)>(
        'EnumClipboardFormats',
      );
  static final int Function(int) _get = _user32
      .lookupFunction<IntPtr Function(Uint32), int Function(int)>(
        'GetClipboardData',
      );
  static final int Function(int, int) _set = _user32
      .lookupFunction<IntPtr Function(Uint32, IntPtr), int Function(int, int)>(
        'SetClipboardData',
      );
  static final int Function() _sequence = _user32
      .lookupFunction<Uint32 Function(), int Function()>(
        'GetClipboardSequenceNumber',
      );

  static final int Function(int, int) _alloc = _kernel32
      .lookupFunction<IntPtr Function(Uint32, IntPtr), int Function(int, int)>(
        'GlobalAlloc',
      );
  static final Pointer<Uint8> Function(int) _lock = _kernel32
      .lookupFunction<
        Pointer<Uint8> Function(IntPtr),
        Pointer<Uint8> Function(int)
      >('GlobalLock');
  static final int Function(int) _unlock = _kernel32
      .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
        'GlobalUnlock',
      );
  static final int Function(int) _free = _kernel32
      .lookupFunction<IntPtr Function(IntPtr), int Function(int)>('GlobalFree');
  static final int Function(int) _size = _kernel32
      .lookupFunction<IntPtr Function(IntPtr), int Function(int)>('GlobalSize');

  static const int unicodeText = 13;
  static const int _gmemMoveable = 0x0002;

  /// ללוח יש בעלים אחד בכל רגע, ותוכנה אחרת עשויה להחזיק אותו לרגע.
  static const int _openAttempts = 20;
  static const Duration _openPause = Duration(milliseconds: 50);

  /// עולה בכל שינוי של הלוח: כך יודעים שההעתקה אכן קרתה, גם כשהטקסט זהה
  /// למה שהיה שם.
  static int get sequence => _sequence();

  /// הפורמטים שנשמרים ומוחזרים: טקסט, רשימת קבצים, שפה ותמונת DIB. רשימה
  /// סגורה ולא "הכול חוץ מ…": פורמט רשום של תוכנה אחרת (HTML, Office) עשוי
  /// להיות מצויר באיחור, ו-`GetClipboardData` עליו מחכה לבעלים בלי הגבלת זמן.
  static const Set<int> _kept = {
    1, // CF_TEXT
    7, // CF_OEMTEXT
    8, // CF_DIB
    13, // CF_UNICODETEXT
    15, // CF_HDROP
    16, // CF_LOCALE
    17, // CF_DIBV5
  };

  /// פורמט גדול מזה אינו נשמר: זיכרון השירות אינו אחסון ללוח.
  static const int _maxItemBytes = 16 * 1024 * 1024;

  /// `null` כשאי אפשר לפתוח את הלוח: אין מה להחזיר, ולכן גם אין להעתיק.
  static ResponsaClipboardSnapshot? snapshot() {
    if (!_acquire()) return null;
    try {
      final items = <({int format, Uint8List data})>[];
      for (var format = _enum(0); format != 0; format = _enum(format)) {
        if (!_kept.contains(format)) continue;
        final data = _bytes(_get(format));
        if (data != null) items.add((format: format, data: data));
      }
      return ResponsaClipboardSnapshot(items);
    } finally {
      _close();
    }
  }

  /// מחזיר את מה שהיה בלוח. לוח שהיה ריק נשאר ריק. `false` כשהלוח תפוס או
  /// כשפורמט כלשהו לא הוחזר.
  static bool restore(ResponsaClipboardSnapshot snapshot) {
    if (!_acquire()) return false;
    try {
      _empty();
      var complete = true;
      for (final item in snapshot.items) {
        if (!_put(item.format, item.data)) complete = false;
      }
      return complete;
    } finally {
      _close();
    }
  }

  /// הטקסט שבלוח (`CF_UNICODETEXT`), או `null`.
  static String? readText() {
    if (!_acquire()) return null;
    try {
      final data = _bytes(_get(unicodeText));
      if (data == null || data.length < 2) return null;
      final units = data.buffer.asUint16List(
        data.offsetInBytes,
        data.length ~/ 2,
      );
      final end = units.indexOf(0);
      return String.fromCharCodes(end < 0 ? units : units.sublist(0, end));
    } finally {
      _close();
    }
  }

  static bool _acquire() {
    for (var attempt = 0; attempt < _openAttempts; attempt++) {
      if (_open(0) != 0) return true;
      sleep(_openPause);
    }
    return false;
  }

  static Uint8List? _bytes(int handle) {
    if (handle == 0) return null;
    final size = _size(handle);
    if (size <= 0 || size > _maxItemBytes) return null;
    final pointer = _lock(handle);
    if (pointer.address == 0) return null;
    try {
      return Uint8List.fromList(pointer.asTypedList(size));
    } finally {
      _unlock(handle);
    }
  }

  static bool _put(int format, Uint8List data) {
    final handle = _alloc(_gmemMoveable, data.length);
    if (handle == 0) return false;
    final pointer = _lock(handle);
    if (pointer.address == 0) {
      _free(handle);
      return false;
    }
    pointer.asTypedList(data.length).setAll(0, data);
    _unlock(handle);
    // הלוח הופך לבעלים של הזיכרון רק כשההצבה הצליחה.
    if (_set(format, handle) == 0) {
      _free(handle);
      return false;
    }
    return true;
  }
}
