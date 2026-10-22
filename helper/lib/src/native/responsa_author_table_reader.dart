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

  /// "קטלוג ספרים" (`FILE06`) גדול מהטבלאות: ברשומות של כל החיבורים והמחברים.
  static const int _maxCatalogBytes = 32 << 20;

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
        if (entry.size > (isCatalog ? _maxCatalogBytes : _maxMemberBytes)) {
          logLine(
            'ResponsaAuthorTable: ${entry.name} is ${entry.size} bytes; skipped',
          );
          continue;
        }
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
        'מתוך ${members.length} קבצים; גודל רשומה לפי מדור: '
        '${ResponsaAuthorTable.describeTables(members)}',
      );
      // בכל מהדורה הקטלוג משלים חיבור שאין לו שם ב-`FILE65`.
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
      final merged = ResponsaAuthorTable.merged(
        table,
        fromCatalog == null || fromCatalog.isEmpty
            ? ResponsaAuthorTable.empty
            : ResponsaAuthorTable.fromCatalog(fromCatalog),
      );
      // מה שצריך כדי להבין מבנה חדש מהדיווח הבא, בלי עוד כלי בדיקה.
      if (merged.authorCount == 0) {
        _describeFormat(members, catalog);
        _describeDirectory(directory);
      }
      return merged;
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

  /// שמות הקבצים שבארכיון לפי קידומת, עם מספרם וגודלם: מהדורה שמספרה אחר
  /// (או שמות אחרים) מתגלה מהדיווח הראשון, בלי כלי בדיקה.
  static void _describeDirectory(
    List<({String name, int offset, int size})> directory,
  ) {
    final groups = <String, ({int count, int bytes})>{};
    for (final entry in directory) {
      final base = entry.name.split('.').first.toUpperCase();
      final seen = groups[base] ?? (count: 0, bytes: 0);
      groups[base] = (count: seen.count + 1, bytes: seen.bytes + entry.size);
    }
    final names = groups.keys.toList()..sort();
    final shown = names.take(_describedGroups);
    logLine(
      'ResponsaAuthorTable: directory ${directory.length} entries: '
      '${[for (final name in shown) '$name x${groups[name]!.count} ${groups[name]!.bytes ~/ 1024}KB'].join(', ')}'
      '${names.length > _describedGroups ? ', +${names.length - _describedGroups} more' : ''}',
    );
  }

  static const int _describedGroups = 80;

  static const int _describedBytes = 96;
}
