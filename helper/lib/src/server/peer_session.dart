import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';
import 'package:win32/win32.dart';

/// ה-session של Windows שממנו מגיע חיבור.
///
/// `127.0.0.1` משותף לכל המשתמשים שמחוברים למחשב (החלפת משתמש מהירה, RDP).
/// בלי הבדיקה, האוצריא של משתמש אחד הייתה מדברת עם השירות של משתמש אחר,
/// והספרים היו נפתחים על המסך שלו.
abstract final class PeerSession {
  /// ה-session של השירות עצמו, או `null` מחוץ ל-Windows.
  static final int? own = Platform.isWindows
      ? _sessionOf(GetCurrentProcessId())
      : null;

  /// ה-session של התהליך שמחובר מ-[clientPort] אל [serverPort] ב-loopback,
  /// או `null` כשלא ניתן לדעת. `null` אינו חוסם: עדיף שירות שעובד על פני
  /// דחייה של המשתמש עצמו בגלל טבלה שלא נקראה.
  static int? ofClient({required int clientPort, required int serverPort}) {
    if (!Platform.isWindows) return null;
    final pid = _clientPid(clientPort, serverPort);
    return pid == null ? null : _sessionOf(pid);
  }

  static int? _sessionOf(int pid) {
    final session = calloc<Uint32>();
    try {
      return ProcessIdToSessionId(pid, session).value ? session.value : null;
    } finally {
      calloc.free(session);
    }
  }

  static const int _afInet = 2;
  static const int _tcpTableOwnerPidConnections = 4;
  static const int _errorInsufficientBuffer = 122;

  /// שורה ב-`MIB_TCPTABLE_OWNER_PID`: state, localAddr, localPort,
  /// remoteAddr, remotePort, owningPid — שש מילים של 32 ביט.
  static const int _rowWords = 6;

  static int? _clientPid(int clientPort, int serverPort) {
    final size = calloc<Uint32>();
    try {
      _getExtendedTcpTable(
        nullptr,
        size,
        0,
        _afInet,
        _tcpTableOwnerPidConnections,
        0,
      );
      // הטבלה יכולה לגדול בין שתי הקריאות.
      for (var attempt = 0; attempt < 3; attempt++) {
        final table = calloc<Uint8>(size.value + 1024);
        try {
          size.value += 1024;
          final result = _getExtendedTcpTable(
            table.cast(),
            size,
            0,
            _afInet,
            _tcpTableOwnerPidConnections,
            0,
          );
          if (result == _errorInsufficientBuffer) continue;
          if (result != 0) return null;
          final words = table.cast<Uint32>();
          final count = words[0];
          for (var i = 0; i < count; i++) {
            final row = words + 1 + i * _rowWords;
            if (_port(row[2]) == clientPort && _port(row[4]) == serverPort) {
              return row[5];
            }
          }
          return null;
        } finally {
          calloc.free(table);
        }
      }
      return null;
    } finally {
      calloc.free(size);
    }
  }

  /// הפורט שמור ב-network byte order, בשני הבתים הנמוכים.
  static int _port(int raw) => ((raw & 0xFF) << 8) | ((raw >> 8) & 0xFF);

  static final _getExtendedTcpTable = DynamicLibrary.open('iphlpapi.dll')
      .lookupFunction<
        Uint32 Function(
          Pointer<Void>,
          Pointer<Uint32>,
          Int32,
          Uint32,
          Int32,
          Uint32,
        ),
        int Function(Pointer<Void>, Pointer<Uint32>, int, int, int, int)
      >('GetExtendedTcpTable');
}
