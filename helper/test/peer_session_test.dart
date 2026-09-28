@TestOn('windows')
library;

import 'dart:io';

import 'package:responsa_helper/src/server/peer_session.dart';
import 'package:test/test.dart';

/// חיבור loopback אמיתי: הטבלה של Windows מחזירה את התהליך שלנו, ולכן את
/// ה-session שלנו.
void main() {
  test('החיבור של התהליך עצמו מזוהה כ-session שלו', () async {
    final server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final accepted = server.first;
    final socket = await Socket.connect(
      InternetAddress.loopbackIPv4,
      server.port,
    );
    final peer = await accepted;
    try {
      expect(PeerSession.own, isNotNull);
      expect(
        PeerSession.ofClient(
          clientPort: peer.remotePort,
          serverPort: server.port,
        ),
        PeerSession.own,
      );
    } finally {
      await socket.close();
      peer.destroy();
      await server.close();
    }
  });

  test('חיבור שאינו קיים מחזיר null', () {
    expect(PeerSession.ofClient(clientPort: 1, serverPort: 2), isNull);
  });
}
