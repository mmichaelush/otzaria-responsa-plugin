import 'package:sqlite3/sqlite3.dart';

/// נקודת כניסה זמנית עד שהשרת (E3) ייכנס: מאמתת שהבנייה ארזה את SQLite.
void main() {
  final db = sqlite3.openInMemory();
  try {
    print(
      'responsa_helper 0.1.0, sqlite ${db.select('SELECT sqlite_version() AS v').first['v']}',
    );
  } finally {
    db.close();
  }
}
