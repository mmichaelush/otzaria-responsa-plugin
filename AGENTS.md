# הוראות עבודה לסוכני AI

קראו קובץ זה לפני כל שינוי.

## סדר קריאה

1. `README.md`
2. `docs/ARCHITECTURE.md`: הרכיבים, ההחלטות ולמה.
3. `docs/PROTOCOL.md`: החוזה בין התוסף לשירות. שינוי בו מחייב עדכון של שני הצדדים, ושל `apiVersion` אם הוא שובר תאימות.
4. הקובץ הרלוונטי והבדיקות שלו.

## כללים

- **תקשורת:** בעברית. הערות בקוד קצרות, מסבירות *למה*, ולא היסטוריות.
- **`helper/`:** Dart טהור, בלי Flutter ובלי `package:otzaria`.
  - **יומן:** רק דרך `logLine`.
  - **Win32 חוסם:** כל קריאה רצה באיזולט, כדי שהשירות ימשיך לענות.
- **`plugin/`:** גבולות השכבות בטבלה ב-`docs/ARCHITECTURE.md` §2.
  - טקסט נכנס ל-DOM רק דרך `textContent`.
  - אין `innerHTML` עם מידע מהשירות.
- **גרסה:** `plugin/manifest.json` ו-`HelperService.serverVersion` זהים תמיד.
- **טקסט בממשק:** שינוי טקסט בממשק או בהודעות השירות מחייב עדכון של טבלת פתרון הבעיות ב-`docs/USER_GUIDE.md`, ושל צילומי המסך (`node tools/preview/screenshots.mjs`, העתקה ל-`docs/images`).
- **טווח הפורטים (39700–39709):** מוגדר בשני מקומות. `bin/responsa_helper.dart` ו-`responsa-domain.js` משתנים יחד.
- **תוכן:** אין העתקת תוכן מבר אילן. רק קטלוג ופתיחה בתוכנה המקורית.
- **הודעות למשתמש:** בעברית, ברורות, ואומרות מה לעשות. ההחלטות נשענות על `code` ולא על טקסט.
- **לפני קומיט:**
  - `dart format`;
  - `dart analyze --fatal-infos`;
  - `dart test`;
  - `node --test plugin/test/*.test.js`;
  - הוולידטור הרשמי, דרך `installer/build.ps1` או CI.

## מלכודות Win32 (מבר אילן)

- **`SendMessageTimeoutW` + `SMTO_ABORTIFHUNG` בלבד.** `SendMessage` נתקע לנצח כשמוצג דיאלוג מודאלי.
- **כפתור שמריץ פעולה ופותח מודאל ("בצע חיפוש"): `ResponsaWin32.postClick`.** `BM_CLICK` סינכרוני עליו לא חוזר.
- **מודאל "מידע" יכול להיות שאלה** (כן/לא/ביטול, בלי "אישור"). היא חוסמת את התוכנה כמו הודעה, ונסגרת ב"ביטול", לעולם לא ב"כן".
- **מזהה 1 אינו כפתור:** במודאל הסיכום של החיפוש הוא משותף לכפתור, ל-`AfxWnd110u` ול-`ScrollBar`. כפתור נבחר לפי מחלקה וטקסט.
- **`RESPONSA.exe` הוא 32 ביט.** `TVITEMW` בתהליך היעד בפריסת 32 ביט (40 בתים). פריסה שגויה מחזירה עץ ריק בלי שגיאה.
- **סגירת חלון MDI:** `WM_MDIDESTROY` ל-`MDIClient` בלבד. `WM_CLOSE` מפיל את המופע. יש תקרה של כ-22 חלונות MDI.
- **דיאלוג עיון חונה ובלתי נראה** תואם בשם ובמחלקה אבל לא עונה. מעדיפים חלון נראה.
- **הליכה על העץ מוחקת את מה שפתחה:** קיפול ואז `TVE_COLLAPSERESET`, ברמה 2. אחרת בר אילן קופא אחרי שינה.
- **קודם התקנה, ואז המופע שתואם לנתיב שלה.** לא בוחרים מופע שרירותי.
- **שם ספר במאגר אינו הפניה שאפשר לשלוח.** עוברים דרך `ResponsaNames`.
- **`\b` ב-RegExp של Dart הוא ASCII בלבד.** הוא לא עובד אחרי אותיות עבריות.
- **השירות אינו תהליך החזית.** `bringToFront` מצטרף לתור הקלט של חלון החזית (`AttachThreadInput`).

## מלכודות בנייה והפצה

- **`dart build cli`, לא `dart compile exe`:** השני לא תומך ב-build hooks של `sqlite3`. התוצר: `bundle/bin/*.exe` ועוד `bundle/lib/sqlite3.dll`.
- **השירות מסומן GUI** (`tools/set_gui_subsystem.py`), ולכן **אין לו stderr**. כתיבה ל-stderr נכשלת באיחור, כשגיאה שלא נתפסה. `logLine` בודק `GetStdHandle` לפני, ו-`main` רץ ב-`runZonedGuarded`.
- **לא שירות Windows:** Session 0 לא רואה את חלונות בר אילן. ההפעלה היא ב-HKCU\Run.
- **`installer/build.ps1` ב-UTF-8 עם BOM.** PowerShell 5.1 קורא בלעדיו ANSI.
- **Inno Setup:** שורה שמתחילה ב-`[`, גם בתוך `[Code]`, נקראת כתגית סעיף.
- **טקסט מסך הסיום של Inno:** בלי קיצורי דרך הוא נלקח מ-`FinishedLabelNoIcons`, לא מ-`FinishedLabel`.
- **הוולידטור:**
  - `name` עד 14 תווים וזהה ל-`toolTab.title`;
  - בדיקת ה-hex ב-CSS תופסת גם סלקטור מזהה (`#fade`), ולכן **רק מחלקות**;
  - `font-size` ב-px מותר רק בסלקטור שמכיל `topbar`.
- **אל תריצו את אוצריא מתוך תיקיית המאגר:** היא כותבת `.sentry-native/` לתיקיית העבודה.
- **כתיבה ל-stdout/stderr רק אחרי בדיקת `hasStdout`/`_hasStderr`** (`log.dart`). בתוכנת GUI, `try/catch` אינו תופס את הכשל, כי הוא אסינכרוני.
- **PowerShell 5.1 עם `$ErrorActionPreference='Stop'`:** כל שורת stderr של פקודה חיצונית הופכת לחריגה. סביב פקודות כאלה עוברים ל-`Continue`, ומכריעים לפי `$LASTEXITCODE`.
- **בדיקה חיה מ-shell מוגבה אינה בדיקה של משתמש רגיל.** מפעילים דרך `explorer.exe`, או בודקים ב-`whoami /groups`.

## בדיקה חיה של הממשק

`SetCursorPos` לבדו לא מזיז את המצביע בתוך WebView של Flutter, ולכן כל קליק "נוחת" במקום הקודם. זה נראה כמו באג של התוסף ואינו כזה. מזיזים עם `mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)` בצעדים, ורק אז לוחצים.
