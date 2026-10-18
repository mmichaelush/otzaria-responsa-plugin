import 'dart:io';
import 'dart:typed_data';

import 'package:meta/meta.dart';
import 'package:responsa_helper/src/log.dart';
import 'package:responsa_helper/src/native/responsa_installation.dart';
import 'package:responsa_helper/src/text/responsa_author_table.dart';
import 'package:responsa_helper/src/text/responsa_book_catalog.dart';

/// קריאת טבלת המחברים מארכיון הספרים (כ-2GB) של ההתקנה.
/// נקראים ממנו רק ספריית המכל וקובצי הטבלה, לא הארכיון כולו.
class ResponsaAuthorTableReader {
  ResponsaAuthorTableReader._();

  /// חסם: ספרייה שגויה לא תגרום לקריאת מאות מגה-בתים לזיכרון.
  static const int _maxMemberBytes = 1 << 20;

  /// [ResponsaAuthorTable.empty] כשאין ארכיון או שהמבנה לא מוכר - לא עוצרים
  /// בנייה בגלל זה, הביבליוגרפיה נשארת נסיגה.
  static ResponsaAuthorTable forInstallation(
    ResponsaInstallation installation,
  ) {
    final archive = installation.archivePath;
    if (archive == null) {
      logLine(
        'ResponsaAuthorTable: אין ארכיון (FILE00) ל-${installation.installPath}; '
        'המחברים רק מהביבליוגרפיה',
      );
      return ResponsaAuthorTable.empty;
    }
    return forArchive(archive);
  }

  @visibleForTesting
  static ResponsaAuthorTable forArchive(String archivePath) {
    RandomAccessFile? file;
    try {
      file = File(archivePath).openSync();
      final length = file.lengthSync();
      final head = file.readSync(2);
      if (head.length < 2) return ResponsaAuthorTable.empty;
      final count = head[0] | (head[1] << 8);
      file.setPositionSync(0);
      final directory = ResponsaAuthorTable.parseDirectory(
        file.readSync(2 + count * ResponsaAuthorTable.directoryEntrySize),
        length,
      );
      if (directory == null) {
        logLine('ResponsaAuthorTable: מבנה לא מוכר ב-$archivePath');
        return ResponsaAuthorTable.empty;
      }
      final members = <String, Uint8List>{};
      Uint8List? catalog;
      for (final entry in directory) {
        final isCatalog =
            entry.name.toUpperCase() == ResponsaBookCatalog.member;
        if (!isCatalog && !ResponsaAuthorTable.isTableMember(entry.name)) {
          continue;
        }
        if (entry.size > _maxMemberBytes) continue;
        file.setPositionSync(entry.offset);
        final bytes = file.readSync(entry.size);
        if (isCatalog) {
          catalog = bytes;
        } else {
          members[entry.name] = bytes;
        }
      }
      final table = ResponsaAuthorTable.parse(members);
      logLine(
        'ResponsaAuthorTable: ${table.authorCount} מחברים '
        'מתוך ${members.length} קבצים',
      );
      if (table.authorCount > 0) return table;

      // בר אילן 29 ו-32: `FILE65` ריק, והמחברים רק בקטלוג.
      final fromCatalog = catalog == null
          ? null
          : ResponsaBookCatalog.authors(catalog);
      logLine(
        'ResponsaAuthorTable: catalog (FILE06): '
        '${catalog == null
            ? 'missing'
            : fromCatalog == null
            ? 'unknown structure, ${catalog.length} bytes'
            : '${fromCatalog.length} books with an author'}',
      );
      if (fromCatalog != null && fromCatalog.isNotEmpty) {
        return ResponsaAuthorTable.fromCatalog(fromCatalog);
      }
      // מה שצריך כדי להבין מבנה חדש מהדיווח הבא, בלי עוד כלי בדיקה.
      _describeFormat(members, catalog);
      return table;
    } catch (error) {
      logLine('ResponsaAuthorTable: $error');
      return ResponsaAuthorTable.empty;
    } finally {
      file?.closeSync();
    }
  }

  /// הבתים הראשונים של קובץ מחברים אחד ושל הקטלוג, ביומן.
  static void _describeFormat(
    Map<String, Uint8List> members,
    Uint8List? catalog,
  ) {
    String head(Uint8List bytes) => [
      for (final byte in bytes.take(_describedBytes))
        byte.toRadixString(16).padLeft(2, '0'),
    ].join(' ');
    final authors = [
      for (final name in members.keys)
        if (name.toUpperCase().startsWith('FILE65')) name,
    ]..sort();
    final sample = authors.isEmpty ? null : authors.first;
    logLine(
      'ResponsaAuthorTable: format: FILE65 x${authors.length}'
      '${sample == null ? '' : ', $sample ${members[sample]!.length} bytes: ${head(members[sample]!)}'}'
      '${catalog == null ? '' : '; FILE06: ${head(catalog)}'}',
    );
  }

  static const int _describedBytes = 96;
}
