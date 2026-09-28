import 'dart:io';

/// stdout שמור לתשובות HTTP של השירות, ולכן היומן נכתב ל-stderr.
void logLine(String message) => stderr.writeln(message);
