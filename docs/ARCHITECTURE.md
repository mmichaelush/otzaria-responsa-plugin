# ארכיטקטורה, תחזוקה ודיבוג

למפתחים ולמתחזקים. **למשתמשים:** [USER_GUIDE.md](USER_GUIDE.md). **החוזה בין הרכיבים:** [PROTOCOL.md](PROTOCOL.md).

---

## 1. התמונה הכללית

```mermaid
flowchart RL
  subgraph Otzaria["אוצריא (תהליך 64 ביט)"]
    Tab["לשונית התוסף<br/>plugin/ · WebView2"]
    Host["גשר המארח<br/>network.fetchStream"]
  end
  subgraph Helper["responsa_helper.exe (רקע, בלי קונסול)"]
    Api["http_api<br/>אבטחה + ניתוב"]
    Svc["helper_service<br/>לוגיקה"]
    Idx["catalog_index<br/>חיפוש בזיכרון"]
    Bld["build_coordinator<br/>בנייה אחת"]
    Eng["native/ + text/<br/>מנוע Win32"]
  end
  Cat[("catalog.sqlite<br/>%LOCALAPPDATA%\\OtzariaResponsa")]
  RP["RESPONSA.exe<br/>(32 ביט)"]

  Tab -->|Otzaria.call| Host -->|HTTP 127.0.0.1:39700| Api --> Svc
  Svc --> Idx --> Cat
  Svc --> Bld --> Eng
  Svc -->|פתיחה| Eng
  Eng -->|SendMessageTimeout · ReadProcessMemory| RP
  Bld -->|כתיבה אטומית| Cat
```

**למה ככה:**
- **תוסף לא יכול להריץ קוד מקומי.** אין API להפעלת תהליך, ו-`app.openUrl` מקבל רק http/https. לכן שליטה בבר אילן חייבת לשבת בתהליך נפרד.
- **המתחזק של אוצריא הכריע** (Otzaria/otzaria#1593) שקוד כזה רץ כשירות מותקן שהתוסף פונה אליו ב-localhost, כמו תוסף היברובוקס.

---

## 2. הרכיבים

### `helper/` — השירות המקומי (Dart טהור)

| תיקייה או קובץ | תפקיד |
|---|---|
| `bin/responsa_helper.dart` | כניסה: ארגומנטים, נעילת מופע דרך הפורט, `runZonedGuarded` |
| `lib/src/server/http_api.dart` | כללי אבטחה, ניתוב, JSON ו-NDJSON עם heartbeat |
| `lib/src/server/helper_service.dart` | כל נקודת קצה כמתודה; מיפוי כשלים להודעות למשתמש |
| `lib/src/server/build_coordinator.dart` | בנייה אחת, לא קשורה לחיבור; `start` ו-`attach` |
| `lib/src/server/catalog_store.dart` + `catalog_index.dart` | הקטלוג בזיכרון, נטען מחדש כשהקובץ משתנה |
| `lib/src/server/responsa_backend.dart` | ממשק מעל המנוע. `FakeBackend` בבדיקות |
| `lib/src/native/` | מנוע ה-Win32: גילוי התקנה, קריאת העץ, פתיחה, בנייה. הועבר מ-Otzaria#1572 |
| `lib/src/text/` | עברית: נרמול, שמות, מחברים, ביבליוגרפיה. בלי Win32 |
| `lib/src/catalog/` | מאגר הקטלוג, מיפוי קטגוריות לאוצריא, סמל |
| `lib/src/log.dart` | יומן לכל האיזולטים, לקובץ ול-stderr כשיש |

### `plugin/` — התוסף (JS רגיל, בלי build)

מחולק לשכבות עם גבולות ברורים. כל שכבה משתמשת רק בשכבות שמתחתיה:

| קובץ | מותר | אסור |
|---|---|---|
| `responsa-domain.js` | החלטות: איזה מסך, התקדמות, טקסטים | DOM, SDK, טיימרים |
| `responsa-service.js` | `network.fetchStream`, JSON, NDJSON, תרגום שגיאות | DOM |
| `responsa-theme.js` | ערכה ← משתני CSS | לוגיקה |
| `responsa-ui.js` | בניית DOM, רק `textContent` | SDK, החלטות |
| `responsa-app.js` | בקר (מצב, טיימרים, מחזור חיים) + View | בניית DOM ישירה |
| `responsa-main.js` | חיבור לאירועי אוצריא | כל השאר |

### `installer/` — מתקין Inno Setup

- **`OtzariaResponsa.iss`:** מתקין בעברית, למשתמש בלבד.
- **`build.ps1`:** בונה הכול. הקובץ שמור ב-**UTF-8 עם BOM**, כי PowerShell 5.1 קורא בלעדיו ANSI.

---

## 3. החלטות תכנון, ולמה

| החלטה | הסיבה | מה נשבר בלעדיה |
|---|---|---|
| **הפעלה בכניסה (HKCU\Run), לא שירות Windows** | שירות רץ ב-Session 0 ולא רואה את חלונות בר אילן בסשן של המשתמש | אין שליטה בבר אילן בכלל |
| **קובץ ההרצה מסומן GUI** (`tools/set_gui_subsystem.py`) | אחרת נפתח חלון קונסול שחור בכל כניסה | חלון שחור בכל הפעלה של Windows |
| **`logLine` בודק `GetStdHandle` לפני כתיבה ל-stderr** | בתוכנת GUI אין stderr, והכתיבה נכשלת *באיחור*, כשגיאה שלא נתפסה | השירות מת שנייה אחרי שעלה (נמדד) |
| **`runZonedGuarded` ב-`main`** | שירות רקע אסור שימות בשקט | קריסה בלי עקבות |
| **טווח פורטים קבוע, 39700–39709** | אפס הגדרות למשתמש. 39625 תפוס אצל כלי המחקר (`MD/tools/hidden_manager.py`) | — |
| **הנעילה היא הפורט עצמו** | פשוט יותר מ-mutex. `/health` מבחין בין "כבר רץ" (קוד 3), משתמש אחר ותוכנה אחרת (ממשיכים לפורט הבא) | — |
| **בדיקת session לכל בקשה** (`peer_session.dart`) | 127.0.0.1 משותף לכל משתמשי Windows שמחוברים למחשב | משתמש ב' היה פותח ספרים על המסך של משתמש א' |
| **פתיחה ובנייה אינן רצות יחד** | שתיהן מפעילות את חלון "עיון" של אותו מופע | פתיחה בזמן בנייה משבשת את הסריקה |
| **יומן ב-`FILE_APPEND_DATA`** | seek ו-write אינם אטומיים בין איזולטים | נמדד: 3,016 מתוך 6,000 שורות שרדו |
| **מתקין שהורץ כמנהל מפעיל דרך `explorer.exe`** | אחרת ההרשאה עוברת לשירות ומשם לבר אילן | בר אילן מוגבה, ששירות רגיל לא יכול לגשת אליו |
| **בלי token** | אוצריא (Dart HttpClient) לא שולחת `Origin`/`Sec-Fetch-*`, ודפדפן תמיד שולח. יחד עם בדיקת `Host` ו-`Content-Type` זה חוסם דפים | משתמש היה צריך לצמד תוסף ושירות |
| **בנייה לא קשורה לחיבור, ו-`mode: attach`** | `fetchStream` נחתך אחרי 120 שניות, ובנייה אורכת חמש עד שש דקות. חיבור מחדש **לא** מתחיל בנייה | בנייה נוספת בכל חזרה ללשונית |
| **קטלוג קיים שמיש בזמן בנייה מחדש** | הבנייה כותבת ל-`.building` ומחליפה רק אחרי אימות | החיפוש חסום 6 דקות |
| **הקטלוג ב-`%LOCALAPPDATA%`, לא בספריית אוצריא** | המתקין של אוצריא והעברת ספרייה מוחקים את מה שבתוכה | מזהי הספרים אובדים. ב-#1572 זה הצריך מנגנון גיבוי |
| **`bringToFront` דרך `AttachThreadInput`** | Windows מתיר החלפת חזית רק לתהליך שקיבל את הקלט האחרון, והשירות אינו כזה | בר אילן מהבהב בשורת המשימות במקום לעלות |
| **מכנה ההתקדמות בבנייה ראשונה מטבלת מהדורות** (`knownNodeCounts`) | חלוקה ל"חלק X מתוך 20" אינה אחידה | אחוז מטעה |
| **אוצריא נמצאת לפי `InstallLocation`, לפני מטפל `otzaria://`** | אצל מפתחים המטפל מצביע על בנייה מקומית | התוסף נמסר לבנייה הלא נכונה |

---

## 4. זרימות

### פתיחת ספר

```mermaid
sequenceDiagram
  participant U as משתמש
  participant P as תוסף
  participant O as אוצריא
  participant H as שירות
  participant R as בר אילן
  U->>P: "פתיחה בבר אילן"
  P->>O: network.fetchStream POST /book/open {key}
  O->>H: HTTP
  H->>H: הפניות מהקטלוג (open_ref + alt_refs)
  H->>R: עיון → הקלדת הפניה → בחירה → אימות כותרת
  H->>R: bringToFront (AttachThreadInput)
  H-->>O: {ok, window, broughtToFront}
  O-->>P: chunks
  P->>O: ui.showSuccess
```

**פתיחה אחת בכל רגע:**
- בשירות: פתיחה שנייה מקבלת `busy`.
- בתוסף: הכפתורים האחרים כבויים בזמן פתיחה.

### בנייה

1. **התחלה:** `POST /catalog/build {mode:start}` מחזיר זרם NDJSON עם `start`, אחריו `progress` שוב ושוב, `heartbeat` כל 10 שניות, ובסוף `done` או `error`.
2. **חסם 120 שניות:** הזרם נחתך, והתוסף מתחבר מחדש ב-`attach` וממשיך מאותו מקום.
3. **הלשונית מוקפאת:** אוצריא מקפיאה לשונית שעזבו (`plugin.suspended`). הבנייה ממשיכה בשירות, וב-`plugin.resumed` התוסף מבצע `refresh` ואז `attach`.

---

## 5. דיבוג

### היומן

- **מיקום:** `%LOCALAPPDATA%\OtzariaResponsa\helper.log`.
- **סיבוב:** ב-2MB, ל-`helper.log.1`.
- **תוכן:**
  - כל בקשה: שיטה, נתיב, סטטוס, זמן;
  - פתיחות: המפתח, הכותרת וההפניה שהצליחה;
  - כשלים עם ההפניות שנוסו;
  - בנייה: סיום עם ספירות;
  - שגיאות שלא נתפסו (`uncaught:`);
  - הודעות האבחון של המנוע, כמו "מופעים חונים".
- **נתיב אחר:** משתנה הסביבה `OTZARIA_RESPONSA_LOG` קובע לאן היומן נכתב.

### קריאה ידנית לשירות

עברית בשורת הפקודה נשברת בקידוד, ולכן **את הגוף שולחים מקובץ UTF-8**:

```powershell
$H = 'http://127.0.0.1:39700'
curl.exe -s "$H/health"
curl.exe -s "$H/status"
'{"q":"אבני נזר","limit":5}' | Out-File -Encoding utf8NoBOM q.json   # PowerShell 7
curl.exe -s -X POST -H "Content-Type: application/json" --data-binary "@q.json" "$H/catalog/search"
```

- **בקשה מדפדפן נדחית ב-403.** זה מכוון.
- **מה בטוח לקרוא:** `/health`, `/status` ו-`/catalog/search` בטוחים. `/book/open` ו-`/catalog/build` מפעילים את בר אילן על המסך.

### הרצת השירות מהקוד

```powershell
cd helper
dart run bin/responsa_helper.dart --port=39800 --data-dir=C:\temp\rp
```

כך אפשר להריץ עותק פיתוח לצד השירות המותקן.

### תקלות נפוצות

| תסמין | סיבה | בדיקה |
|---|---|---|
| **השירות יוצא מיד עם קוד 4** | תוכנה אחרת על 39700 | `netstat -ano \| findstr :39700` |
| **`running:false` כשבר אילן פתוח** | המופע "חונה" (x=-32000) או שייך להתקנה אחרת | ביומן: "מופעים חונים מחוץ למסך" |
| **בנייה נכשלת ב-`elevated`** | בר אילן כמנהל מערכת, והשירות לא | פתיחת בר אילן בלי הרשאות מנהל |
| **פתיחות מתחילות להיכשל אחרי שימוש ארוך** | תקרת כ-22 חלונות MDI | `windowLimit` ביומן |
| **קליקים בבדיקה אוטומטית "נוחתים" במקום הקודם** | `SetCursorPos` לא מזיז את המצביע בתוך WebView של Flutter | תנועה ב-`MOUSEEVENTF_MOVE\|ABSOLUTE` |

---

## 6. בדיקות

| רמה | פקודה | מה נבדק |
|---|---|---|
| **שירות** | `cd helper && dart test` | 248 בדיקות: המנוע, החיפוש, HTTP מקצה לקצה מול `FakeBackend`, אבטחה, session, בנייה ו-attach, ויומן מקבילי |
| **תוסף** | `node --test plugin/test/*.test.js` | 73 בדיקות: domain, service (גילוי פורט, הודעות המארח, fetchStream מדומה), app (בקר מול View מדומה), ומראה של בדיקת העיצוב |
| **החנות** | הוולידטור הרשמי (`installer/build.ps1` או CI) | אותן בדיקות שהחנות מריצה, כולל עיצוב |
| **חזותי** | `node tools/preview/screenshots.mjs` | כל מסך, בהיר וכהה, ב-Edge headless |
| **חי** | `dart test --run-skipped test/live_*` | מול בר אילן אמיתי: בנייה, פתיחת מדגם, פתיחת הכול |

**מדדים שנמדדו חי על CD25 (28.9.2026):**
- 1,251,889 צמתים הניבו 8,402 ספרים;
- 78 תוצאות לחיפוש מהרש"א;
- פתיחה ב-2.9 שניות;
- הבאה לחזית הצליחה;
- התקנה, עדכון והסרה של המתקין;
- התוסף באוצריא 0.9.97.

---

## 7. שחרור גרסה

1. **גרסה:** מעלים יחד, **לאותו מספר**, את `plugin/manifest.json` (`version`) ואת `HelperService.serverVersion`. `build.ps1` נכשל אם הם שונים.
2. **שינוי בפרוטוקול:** אם הוא שובר תאימות, מעלים את `apiVersion` בשני הצדדים (`HelperService.apiVersion` ו-`API_VERSION` בתוסף). תוסף ישן מול שירות חדש מציג "צריך לעדכן".
3. **תג:** `git tag v0.1.1 && git push --tags`. ה-CI בונה ומפרסם GitHub Release עם המתקין וקובץ התוסף.
4. **פרסום בחנות אוצריא:** **עדיין לא מחובר ב-CI** (`publish: false`). כשיוחלט לפרסם: `Otzaria/otzaria-plugin-validator@v1` עם סודות `OTZARIA_*`, כמו במרקר. `app-version` בתהליך שווה ל-`minAppVersion`, וה-CI בודק זאת.

---

## 8. מגבלות ידועות

- **המתקין לא חתום.** SmartScreen מציג אזהרה בהורדה הראשונה. חתימת קוד תסיר אותה.
- **חתימת קוד:** לא לשכוח לחתום **אחרי** `set_gui_subsystem.py`, כי תיקון הכותרת שובר חתימה.
- **מתקין שקט (`/VERYSILENT`)** מעדכן את השירות אבל לא מוסר את התוסף לאוצריא. זה מכוון: בפריסה שקטה אין משתמש שיאשר את חלון ההתקנה.
- **מהדורות שנבדקו חי:** CD25 ו-CD29. ההתאמה לשאר המהדורות מבנית, ולא נבדקה מקצה לקצה.
- **מסך הספרייה של אוצריא:** הספרים לא מופיעים באיתור הספר ובעיון, רק בלשונית התוסף. לשם כך נדרש שינוי קטן ביישום עצמו (Otzaria/otzaria#1593).
