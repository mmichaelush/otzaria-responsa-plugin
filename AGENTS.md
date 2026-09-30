# הוראות עבודה לסוכני AI

קראו קובץ זה לפני כל שינוי.

## סדר קריאה

1. `README.md`
2. `docs/ARCHITECTURE.md`: הרכיבים, ההחלטות ולמה.
3. `docs/PROTOCOL.md`: החוזה בין התוסף לשירות. שינוי בו מחייב עדכון של שני הצדדים, ושל `apiVersion` אם הוא שובר תאימות.
4. `CONTRIBUTING.md`: מפת הקבצים, איפה שמים קוד חדש, פקודות האימות ופרמטרי התצוגה המקדימה.
5. הקובץ הרלוונטי והבדיקות שלו.

## כללים

- **תקשורת:** בעברית. הערות בקוד קצרות, מסבירות *למה*, ולא היסטוריות.
- **`helper/`:** Dart טהור, בלי Flutter ובלי `package:otzaria`.
  - **יומן:** רק דרך `logLine`.
  - **Win32 חוסם:** כל קריאה רצה באיזולט, כדי שהשירות ימשיך לענות.
- **`plugin/`:** גבולות השכבות בטבלה ב-`docs/ARCHITECTURE.md` §2.
  - טקסט נכנס ל-DOM רק דרך `textContent`. אין `innerHTML` בכלל.
  - **כל טקסט בממשק עובר ב-`t('…')`**, בליטרל אחד (או `N('…')` למחרוזת שמתורגמת מאוחר יותר). מחרוזת חדשה נכנסת גם ל-`i18n/en.js`; `test/i18n.test.js` נכשל על מפתח חסר או יתום. לא שומרים תוצאה של `t()` בזמן טעינה: השפה מתחלפת בזמן ריצה.
  - **קריאות SDK רק דרך `responsa-runtime.js`** (חוץ מזרמי הרשת ב-`responsa-service.js`). `callSoft` לקריאות שאינן פעולה שהמשתמש ביקש; פעולה שהמשתמש ביקש מסתיימת תמיד בתוצאה או בהודעה.
  - **מה שקורה בלי מסך** (פתיחה מהספרייה, לחיצה ימנית, קיצור) ב-`responsa-engine.js`, כי הוא רץ גם בלשונית וגם ב-`background.html`.
  - **מפתח אחסון שמופיע ב-`when` במניפסט** מוגדר ב-`ResponsaSettings.KEYS`; `test/manifest.test.js` בודק שהם תואמים.
  - **מחלקת CSS חדשה** צריכה עיצוב, ועיצוב צריך שימוש: `test/ui-contract.test.js`. אייקון חדש נוסף ל-`tools/icon/build_icons.py` ונבנה מחדש, לא נערך ידנית.
  - **יומן:** `this.log.debug/info/warn/error` (`responsa-log.js`), לא `console` ישירות. info ומעלה מועתק ל-console, ואוצריא כותבת אותו ליומן שלה; `debug` נשאר בזיכרון, ולכן הוא לדברים תכופים (כל בקשה לשירות). טקסט שיוצא מהמחשב (העתקה, דיווח) עובר `scrub()`.
  - **כתובת חיצונית רק ב-`Domain.Links`.** `store` מצביע על `https://otzaria.org/plugins` עד הפרסום הראשון, ואחריו על `https://otzaria.org/plugins/<id>`.
- **ההבהרה על רישיון בר אילן היא כלל מוצר, לא עיצוב.** כך נקבע בפורום אוצריא (`Domain.Links.forum`): בפתיחה הראשונה מזהירים שהתוסף נועד למי שרכש רישיון כדין. היא ראשונה במסך הפתיחה (`Panels.welcomeDialog`) ומופיעה גם ב"אודות". אין להסיר, לקצר, להזיז למטה או להסתיר אותה מאחורי לחיצה.
- **שני מסלולי מניפסט:** ב-`main` היעד הוא אוצריא 0.9.97, בלי חיפוש הספרייה. הגרסה עם `library.books.provide` ו-`startup.libraryBooks` (`minAppVersion` 0.9.98) ממתינה ל-PR המארח. הקוד משותף: בלי ההרשאה (`Domain.hostSupportsLibrary`) הממשק מסתיר כל מה שקשור לספרייה, ו-`manifest.test.js` בודק את הספק רק כשהוא מוצהר. לא מוסיפים ל-`main` את ה-API של 0.9.98.
- **סמל התוסף** (`plugin/icon/icon.png`, `installer/icon.ico`) הוא ציור מקורי מ-`tools/icon/icon.html` (`node tools/icon/build_app_icon.mjs`). **לא מעתיקים מ-`otzaria_icons`:** GPL-3.0, ולמאגר הזה אין רישיון. אייקון הלשונית במניפסט הוא שם של אייקון אוצריא, והמארח מצייר אותו.
- **גרסה:** `plugin/manifest.json` ו-`HelperService.serverVersion` זהים תמיד.
- **טקסט בממשק:** שינוי טקסט בממשק או בהודעות השירות מחייב עדכון של טבלת פתרון הבעיות ב-`docs/USER_GUIDE.md`, ושל צילומי המסך (`node tools/preview/screenshots.mjs`, העתקה ל-`docs/images`).
- **טווח הפורטים (39700–39709):** מוגדר בשני מקומות. `bin/responsa_helper.dart` ו-`responsa-domain.js` משתנים יחד.
- **תוכן:** אין העתקת תוכן מבר אילן. רק קטלוג ופתיחה בתוכנה המקורית.
- **הודעות למשתמש:** בעברית, ברורות, ואומרות מה לעשות. ההחלטות נשענות על `code` ולא על טקסט.
- **לפני קומיט:**
  - `dart format`;
  - `dart analyze --fatal-infos`;
  - `dart test`;
  - `node --check` לכל קובץ ב-`plugin/js/` וב-`plugin/i18n/`;
  - `node --test plugin/test/*.test.js`;
  - `node tools/preview/smoke.mjs` (כל מסך בדפדפן אמיתי; נכשל על שגיאת קונסול);
  - הוולידטור הרשמי: `node build/validator/src/cli.js plugin --app-version 0.9.97 --fail-on-warnings --publish false`, או `installer/build.ps1`.

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
- **ה-shell משבש לוכסנים הפוכים ב-heredoc** (`\b`, `\\`, נתיבי Windows ו-RegExp). סקריפט תיקון נכתב לקובץ ומורץ ממנו, לא מודבק לשורת הפקודה.

## מלכודות אוצריא

- **`app.startup_contributions` מוצעת כבויה בחלון ההתקנה** (למרות שהתיעוד אומר "דלוקה"). בלעדיה אין פריט בתפריט, אין קיצורים ואין ספק ספרים. התוסף מזהה זאת (`Domain.lacksStartupPermission`) ומסביר.
- **לחיצה על פריט תפריט שולחת שני אירועים:** `contextMenu.itemClicked` וגם `reader.context_menu_item_clicked`. מטפלים רק בראשון, אחרת החיפוש רץ פעמיים.
- **`library.setProviderBooks` ו-`libraryBooks`** קיימים מאוצריא 0.9.98 בלבד. במניפסט עם `minAppVersion` נמוך יותר הוולידטור חוסם; ולכן הם במסלול הנפרד (ראו "שני מסלולי מניפסט").
- **בלי `app.startup_contributions` אוצריא אינה רושמת את ספק `libraryBooks`,** ו-`library.setProviderBooks` נדחה ב-`error.not_found`. לכן `Engine.syncLibrary` אינו מנסה כשההרשאה כבויה. אחרי כשל הוא ממתין עשר דקות, ושינוי הרשאות (`Engine.setPermissions`) מבטל את ההמתנה.
- **`I18n.language` הוא getter.** `const { language } = I18n` מקפיא את הערך של רגע הטעינה. קוראים `I18n.language` בכל שימוש.
- **הכותרת בתפריט הלחיצה הימנית** מגיעה מהמניפסט בעברית. הלשונית מעדכנת אותה בכל מעבר שפה, ומנוע הרקע קורא את השפה מחדש לפני כל אירוע ומעדכן אותה אם השתנתה (`engine.patchContextMenuTitle`).
- **תצוגה מקדימה:** `tools/preview/build-preview.mjs` משכתב נתיבי `js/`, `css/` ו-`i18n/`. תיקייה חדשה ב-`plugin/` צריכה שורה שם, אחרת הקובץ לא נטען בתצוגה ואין שגיאה.
  - **פרמטרים של `stub.js`:** `scenario`, `mode=dark`, `lang=en`, `library=1`, `query`, `sheet`, `tab`, `welcome=1`, `details=<key>`, `offline=1`. בלי `welcome=1` מסך הפתיחה מסומן כ"כבר הוצג". פירוט ב-`CONTRIBUTING.md`.
  - **`smoke.mjs` מתעלם משורות `[responsa] …`:** היומן רושם כשלים צפויים בכוונה (שירות שלא עונה הוא תרחיש). רק `[responsa] event … failed` נחשב שגיאה.

## בדיקה חיה של הממשק

`SetCursorPos` לבדו לא מזיז את המצביע בתוך WebView של Flutter, ולכן כל קליק "נוחת" במקום הקודם. זה נראה כמו באג של התוסף ואינו כזה. מזיזים עם `mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE)` בצעדים, ורק אז לוחצים.
