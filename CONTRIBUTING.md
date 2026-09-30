# תרומה לתוסף בר אילן

למפתחים שרוצים לתקן או להוסיף משהו. **סוכני AI:** [AGENTS.md](AGENTS.md). **הרכיבים וההחלטות:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). **החוזה בין התוסף לשירות:** [docs/PROTOCOL.md](docs/PROTOCOL.md).

המטרה: PR קטן, ממוקד ובטוח, שעובר את כל הבדיקות ואת הוולידטור של החנות.

## דרישות מוקדמות

| מה | בשביל מה |
|---|---|
| **Node.js 20 ומעלה** | בדיקות התוסף (`node:test`), `node --check`, הוולידטור והתצוגה המקדימה |
| **Dart SDK 3** | השירות (`helper/`). Dart טהור, בלי Flutter |
| **Edge או Chrome** | התצוגה המקדימה, `smoke.mjs`, צילומי המסך ובניית סמל התוסף |
| **Windows + פרויקט השו"ת של בר אילן** | בדיקות חיות (`dart test --run-skipped test/live_*`) ובדיקה ידנית באוצריא |
| **Inno Setup 6** | בניית המתקין בלבד (`installer/build.ps1`) |
| **Python 3** | `tools/set_gui_subsystem.py` בבנייה; Pillow לסמל ולצילומים צרים; fontTools לאייקונים |

**אין `npm install`:** לתוסף אין תלויות, אין bundler ואין שלב build.

## התחלה מהירה

1. צרו branch ייעודי.
2. קראו את `docs/ARCHITECTURE.md` §2 (גבולות השכבות) ואת `AGENTS.md` (מלכודות).
3. הריצו פעם אחת את הבדיקות, כדי לדעת שהסביבה תקינה:
   ```sh
   node --test plugin/test/*.test.js
   cd helper && dart pub get && dart test
   ```
4. בצעו שינוי ממוקד, עם בדיקה לפי הסיכון.
5. בדקו בתצוגה המקדימה (`node tools/preview/build-preview.mjs`, ופתיחת `tools/preview/out/preview.html`).
6. הריצו את כל פקודות האימות (למטה).

## מפת קבצים

### `plugin/` — התוסף (JS רגיל)

| קובץ | תפקיד |
|---|---|
| `manifest.json` | זהות, גרסה, הרשאות ותרומות עלייה (תפריט, קיצורים) |
| `index.html` | מבנה הלשונית וסדר הסקריפטים. אין בו לוגיקה |
| `background.html` | מנוע הרקע: רק i18n, domain, log, runtime, settings, service, engine |
| `css/style.css` | כל העיצוב. צבעים מתפקידי הערכה של אוצריא |
| `i18n/en.js` | מילון האנגלית. המפתחות הם מחרוזות המקור בעברית |
| `icon/icon.png` | סמל התוסף בחנות ובחלון ההתקנה (נבנה, לא נערך) |
| `js/responsa-i18n.js` | `t()`, כיוון, locale. `language` הוא getter |
| `js/responsa-domain.js` | כל ההחלטות, טהורות: איזה מסך, הודעות לפי קוד, פרטי ספר, רשימת ההכנה, `Links` |
| `js/responsa-log.js` | יומן בזיכרון (200 רשומות) ו-`scrub()` לנתיבים |
| `js/responsa-runtime.js` | הגבול היחיד מול `Otzaria.call` |
| `js/responsa-settings.js` | הגדרות, כל אחת במפתח אחסון משלה (`KEYS`) |
| `js/responsa-service.js` | הגבול היחיד מול הרשת: `network.fetchStream` אל השירות |
| `js/responsa-engine.js` | מה שעובד בלי מסך: לחיצה ימנית, פתיחה מהספרייה, קיצורים |
| `js/responsa-theme.js` | ערכת אוצריא ← משתני CSS |
| `js/responsa-icons.js` | אייקוני Fluent לדף (נבנה, לא נערך) |
| `js/responsa-ui.js` | DOM של המסך הראשי |
| `js/responsa-panels.js` | DOM של ההגדרות, העזרה ומסך הפתיחה |
| `js/responsa-view.js` | מחבר מודל ל-DOM: עדכון במקום, פוקוס, `inert` |
| `js/responsa-app.js` | הבקר: מצב, טיימרים, מחזור חיים, דיווח |
| `js/responsa-main.js` / `responsa-background.js` | חיבור לאירועי אוצריא, בלשונית וברקע |
| `test/` | בדיקות Node, בלי DOM ובלי תלויות. `test/helpers/` — גשר מדומה וטעינה |

### `helper/` — השירות המקומי (Dart)

| מקום | תפקיד |
|---|---|
| `bin/responsa_helper.dart` | כניסה, ארגומנטים, בחירת פורט |
| `lib/src/server/` | HTTP, אבטחה, נקודות הקצה (`helper_service.dart`), בנייה, קטלוג בזיכרון, נתיבים (`helper_paths.dart`) |
| `lib/src/native/` | Win32 מול בר אילן: גילוי, עץ, פתיחה, חיפוש, כתיבת הקטלוג |
| `lib/src/text/` | עברית: נרמול, שמות, מחברים, ביבליוגרפיה, ניקוי שאילתה |
| `lib/src/catalog/` | מאגר הקטלוג (SQLite) ומיפוי לקטגוריות אוצריא |
| `lib/src/log.dart` | `logLine`: היומן היחיד |
| `test/` | בדיקות יחידה ו-HTTP מול `FakeBackend`; `live_*` רצות רק מול בר אילן אמיתי |

### `installer/` ו-`tools/`

| מקום | תפקיד |
|---|---|
| `installer/OtzariaResponsa.iss` | מתקין Inno Setup: השירות, והצעה להתקין או לעדכן את התוסף |
| `installer/build.ps1` | בונה הכול: השירות, קובץ התוסף (דרך הוולידטור) והמתקין. UTF-8 עם BOM |
| `installer/icon.ico` | סמל המתקין (נבנה, לא נערך) |
| `tools/preview/` | תצוגה מקדימה בדפדפן: `stub.js` (גשר מדומה), `smoke.mjs`, `screenshots.mjs` |
| `tools/icon/` | `build_icons.py` (אייקוני הדף), `icon.html` + `build_app_icon.mjs` (סמל התוסף והמתקין) |
| `tools/set_gui_subsystem.py` | מסמן את השירות כתוכנת GUI, בלי חלון קונסול |

## איפה לשים קוד חדש

שאלו לפי הסדר:

1. **זו החלטה** (מה להציג, איזו הודעה, האם לשלוח)? ← `responsa-domain.js`. פונקציה טהורה, עם בדיקה ב-`domain.test.js`.
2. **זה חייב לעבוד גם כשהלשונית סגורה** (לחיצה ימנית, מסך הספרייה, קיצור)? ← `responsa-engine.js`. הוא רץ גם ב-`background.html`, ושם אין DOM.
3. **זה ציור של המסך?** ← `responsa-ui.js` (מסך ראשי) או `responsa-panels.js` (הגדרות, עזרה, פתיחה). DOM בלבד: מודל ופעולות נכנסים, אלמנט יוצא.
4. **זה מצב, טיימר או תגובה לפעולת משתמש?** ← `responsa-app.js`.
5. **קריאה חדשה ל-SDK של אוצריא?** ← דרך `responsa-runtime.js`, תמיד.
6. **בקשה חדשה לשירות?** ← `responsa-service.js`, ובצד השני נקודת קצה ב-`helper_service.dart` ועדכון של `docs/PROTOCOL.md`.
7. **משהו שיעזור לדבג?** ← `this.log.info/warn/error` (`responsa-log.js`). `debug` לדברים תכופים, כמו כל בקשה.
8. **כתובת חיצונית?** ← `Domain.Links`, ורק שם.

## כללים

### טקסט ו-DOM
- **טקסט נכנס ל-DOM רק דרך `textContent`.** אין `innerHTML`, בכלל.
- **כל מחרוזת בממשק עוברת ב-`t('…')`**, בליטרל אחד, ונוספת ל-`i18n/en.js`. `test/i18n.test.js` נכשל על מפתח חסר, יתום, או עם משתנים שונים.
- **לא שומרים תוצאה של `t()` בזמן טעינה:** השפה מתחלפת בזמן ריצה. למחרוזת שמתורגמת מאוחר יותר: `N('…')`.
- **הודעה למשתמש** בעברית פשוטה, ואומרת מה לעשות. ההחלטות לפי `code`, לעולם לא לפי טקסט.

### עיצוב (החנות אוכפת)
החנות דוחה פרסום על הפרות שהאריזה מציגה רק כהערה. `test/design.test.js` מראה את הבדיקה שלה:
- **צבעים רק דרך `var(--color-*)`.** אין hex, `rgb()`, `hsl()` או שמות צבעים מחוץ להגדרת משתנה.
- **`font-size` ב-px רק בסלקטור שמכיל `topbar`.**
- **`border-radius` רק דרך `var()` או `%`.**
- **אין סלקטור מזהה (`#…`) ב-CSS:** בדיקת ה-hex תופסת גם אותו.
- **`font-family` רק דרך `var(--font-*)`.**
- **כיוונים לוגיים:** `inline-start`/`inline-end`, לא `left`/`right`. הממשק מתהפך באנגלית.
- **כל מחלקה חדשה מקבלת עיצוב, וכל עיצוב משמש מחלקה:** `test/ui-contract.test.js`. מחלקה שהיא רק וו לקוד נכנסת ל-`HOOKS` שם.
- **רוחב:** כל מסך עובד גם בחלון צר (כ-380px), בהיר וכהה.

### מוצר
- **ההבהרה על רישיון בר אילן** מוצגת ראשונה במסך הפתיחה, וגם ב"אודות". כך נקבע בפורום אוצריא ([הודעה 40010](https://otzaria.org/forum/post/40010)). לא מסירים אותה, לא מקצרים ולא מזיזים למטה.
- **אין העתקת תוכן מבר אילן.** רק קטלוג, ופתיחה או חיפוש בתוכנה המקורית.
- **התוסף עובד בלי אינטרנט.** כל תקשורת היא ל-`127.0.0.1`. קישור חיצוני בודק את `model.online` ומסביר כשאין חיבור.
- **שתי גרסאות מניפסט:** `main` מכוון לאוצריא 0.9.97, בלי חיפוש הספרייה. הגרסה עם `library.books.provide` ו-`startup.libraryBooks` (`minAppVersion` 0.9.98) ממתינה ל-PR המארח באוצריא. הקוד תומך בשתיהן: בלי ההרשאה, הממשק מסתיר כל מה שקשור לספרייה.

### גרסאות ופרוטוקול
- **`plugin/manifest.json` ו-`HelperService.serverVersion` זהים תמיד.** `test/manifest.test.js` ו-`build.ps1` בודקים.
- **שינוי בפרוטוקול:** שני הצדדים יחד, ו-`docs/PROTOCOL.md`. שדה חדש לא שובר; שינוי שובר מעלה את `apiVersion`.
- **מפתח אחסון שמופיע ב-`when` במניפסט** מוגדר ב-`ResponsaSettings.KEYS`.

## הוספת אייקון

| איפה | איך |
|---|---|
| **בתוך הדף** | מוסיפים את השם (למשל `wifi_off_24_regular`) ל-`ICONS` ב-`tools/icon/build_icons.py`, ומריצים `py -3 tools/icon/build_icons.py`. דורש את `fluentui_system_icons` ב-pub cache ואת fontTools. `responsa-icons.js` אינו נערך ידנית, ו-`ui-contract.test.js` נכשל על אייקון שהקוד מבקש ואינו בקובץ |
| **בלשונית ובתפריט של אוצריא** | שם של אייקון אוצריא במניפסט (`iconName`, `icon`). אוצריא מציירת אותו, ולכן הוא לא נכנס ל-`responsa-icons.js` |
| **סמל התוסף והמתקין** | עורכים את `tools/icon/icon.html` ומריצים `node tools/icon/build_app_icon.mjs`. נבנים `plugin/icon/icon.png` ו-`installer/icon.ico`. דורש Edge או Chrome ו-Python עם Pillow |

**רישוי:** סמל התוסף הוא ציור מקורי. **לא מעתיקים אליו מ-`otzaria_icons`:** הספרייה ב-GPL-3.0, ולמאגר הזה עוד אין רישיון שמתאים לה.

## דיבוג

| מה | איפה |
|---|---|
| **יומן התוסף** | בלשונית: סימן השאלה ← **מצב המערכת** ← "פעולות אחרונות" (40 האחרונות, מ-info ומעלה). "העתקת הפרטים" מעתיקה את פרטי המערכת ועד 150 רשומות, גם debug, עם נתיבי משתמש מקוצרים |
| **היומן של אוצריא** | רשומות info ומעלה מועתקות ל-console, ואוצריא כותבת אותן כ-`Plugin [com.otzaria-responsa]: [responsa] …`. זו הדרך היחידה לראות את מנוע הרקע, שאין לו מסך |
| **יומן השירות** | `%LOCALAPPDATA%\OtzariaResponsa\helper.log` (מסתובב ב-2MB ל-`helper.log.1`). משתנה הסביבה `OTZARIA_RESPONSA_LOG` קובע נתיב אחר. כל בקשה: שיטה, נתיב, סטטוס, זמן |
| **השירות מהקוד** | `cd helper && dart run bin/responsa_helper.dart --port=39800 --data-dir=C:\temp\rp`, לצד השירות המותקן |
| **קריאה ידנית לשירות** | `docs/ARCHITECTURE.md` §5. גוף בעברית שולחים מקובץ UTF-8 |

### תצוגה מקדימה

`node tools/preview/build-preview.mjs` בונה את `tools/preview/out/preview.html` מה-`index.html` האמיתי, עם גשר מדומה. הפרמטרים בכתובת:

| פרמטר | מה |
|---|---|
| `scenario=` | `ready`, `serviceMissing`, `needsCatalog`, `building`, `buildFailed`, `rebuilding`, `otherInstallation`, `notInstalled`, `portTaken`, `permissionDenied`, `serviceError`, `serviceOutdated`, `unsupported` |
| `mode=dark` | ערכה כהה |
| `lang=en` | אנגלית |
| `library=1` | אוצריא שמעניקה `library.books.provide` |
| `query=` | חיפוש מוכן |
| `sheet=settings` / `sheet=help&tab=guide\|troubleshoot\|status\|about` | לוח פתוח |
| `welcome=1` | מסך הפתיחה (בלי הסימון "כבר הוצג") |
| `details=<key>` | פרטי הספר פתוחים (למשל `3232`, עם `query`) |
| `offline=1` | בלי אינטרנט |

- **`node tools/preview/screenshots.mjs [out-dir]`:** כל מסך, בהיר וכהה, גם ברוחב טלפון (דרך iframe ברוחב מדויק).
- **תיקייה חדשה ב-`plugin/`** צריכה שורה ב-`build-preview.mjs`, אחרת היא לא נטענת בתצוגה, בלי שגיאה.

## פקודות אימות

```sh
# התוסף
for f in plugin/js/*.js plugin/i18n/*.js; do node --check "$f"; done
node --test plugin/test/*.test.js
node tools/preview/smoke.mjs

# השירות
cd helper
dart format --output=none --set-exit-if-changed .
dart analyze --fatal-infos
dart test
cd ..

# הוולידטור הרשמי (אותה בדיקה שהחנות מריצה)
node build/validator/src/cli.js plugin --app-version 0.9.97 --fail-on-warnings --publish false

git diff --check
```

- **`smoke.mjs`** טוען כל מסך, לוח וכרטיסייה, בעברית, באנגלית ובכהה, ונכשל על שגיאה בקונסול. שורות היומן של התוסף (`[responsa] …`) אינן שגיאה, כי כשל צפוי נרשם בכוונה. רק `[responsa] event … failed` נחשב.
- **הוולידטור** נמצא ב-`build/validator`. אם אינו שם, `installer/build.ps1` משכפל אותו (`Otzaria/otzaria-plugin-validator`, `v1`). `--app-version` שווה ל-`minAppVersion`.
- **אריזה ומתקין:** `powershell -File installer/build.ps1`. בונה את השירות, אורז את התוסף דרך הוולידטור ובונה את המתקין ל-`installer/output/`.
- **חי, מול בר אילן:** `cd helper && dart test --run-skipped test/live_*`. מפעיל את בר אילן על המסך.

## רשימת בדיקה ל-PR

- [ ] כל פקודות האימות עוברות.
- [ ] מחרוזת חדשה: ב-`t()` ובמילון האנגלית.
- [ ] שינוי בממשק: נבדק בתצוגה המקדימה, בהיר וכהה, בעברית ובאנגלית, וברוחב צר. צילומים לפני ואחרי.
- [ ] שינוי בטקסט שהמשתמש רואה: טבלת פתרון הבעיות ב-`docs/USER_GUIDE.md` עודכנה, וצילומי המסך ב-`docs/images` נוצרו מחדש.
- [ ] שינוי בפרוטוקול: שני הצדדים ו-`docs/PROTOCOL.md`.
- [ ] API חדש של אוצריא: באיזו גרסה הוא נוסף, והאם הוא מחייב להעלות את `minAppVersion`.
- [ ] `CHANGELOG.md`: שורה בסעיף הגרסה הבאה.
- [ ] ההבהרה על הרישיון לא נפגעה.

## סגנון קומיט

- **שורת נושא בעברית, קצרה, ומה השתנה:** `build.ps1: קובץ התוסף לפי שמו ולא לפי פלט הוולידטור`.
- **קומיט גרסה:** `0.2.0: <העיקר>`.
- **תיקון לקומיט שעוד לא נדחף** נכנס אליו, ולא כקומיט "תיקון" נוסף.
- **הערות בקוד** מסבירות *למה*, לא מה השתנה ומתי.
