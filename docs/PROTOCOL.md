# פרוטוקול השירות המקומי — גרסת API 1

החוזה בין התוסף (`plugin/`) לבין השירות המקומי (`helper/`). התוסף פונה לשירות דרך `network.fetchStream` של אוצריא, ואין ערוץ אחר.

## 1. ערוץ

- **כתובת:** `http://127.0.0.1:39625`. הפורט קבוע, ואין הגדרה שהמשתמש צריך לשנות.
- **הפורט תפוס על ידי תוכנה אחרת:** `/health` לא מחזיר `"service": "otzaria-responsa"`. במקרה כזה התוסף מציג "הפורט תפוס", ולא "השירות לא מותקן".
- **תבנית:** בקשות ותשובות ב-JSON עם קידוד UTF-8. פעולה ארוכה מחזירה NDJSON: שורת JSON אחת לכל אירוע.
- **בינארי:** אין. `fetchStream` מפענח כל תשובה כטקסט UTF-8, ולכן קובץ בינארי (למשל סמל) עובר ב-base64 בתוך JSON.
- **זמן קצוב:** `fetchStream` נחתך אחרי 120 שניות לכל היותר. לכן:
  - הזרמה ארוכה שולחת `heartbeat` כל 10 שניות;
  - בנייה **אינה** קשורה לחיבור: ניתוק אינו מבטל אותה, וחיבור חדש ל-`/catalog/build` מצטרף לבנייה שרצה.

## 2. אבטחה

השירות פתוח רק לאוצריא. הכללים נאכפים בכל בקשה, **לפני** הניתוב:

| כלל | למה |
|---|---|
| האזנה ל-`127.0.0.1` בלבד | אין גישה מהרשת |
| `Host` חייב להיות `127.0.0.1:39625` או `localhost:39625`, אחרת 403 | מונע DNS rebinding |
| בקשה עם `Origin`, `Sec-Fetch-Site` או `Sec-Fetch-Mode` נדחית ב-403 | הדפדפן תמיד שולח אותן, ואוצריא (לקוח Dart) אינה שולחת |
| `POST` מחייב `Content-Type: application/json`, אחרת 415 | טופס HTML אינו יכול לשלוח JSON בלי preflight |
| אין כותרות CORS לעולם, ו-`OPTIONS` מחזיר 405 | preflight לא עובר |

בזכות זה המשתמש לא צריך token, צימוד (pairing) או שום הגדרה.

## 3. שגיאות

- **צורה:** כל כשל מוחזר עם סטטוס HTTP מתאים וגוף `{"error": {"code", "message", "details"?}}`.
- **`message`:** בעברית ומוכנה להצגה למשתמש.
- **`code`:** קובע את ההתנהגות. אסור להסיק שום דבר מתוכן ה-`message`.

| code | HTTP | מתי |
|---|---|---|
| `notInstalled` | 409 | לא נמצאה התקנה של בר אילן |
| `notRunning` | 409 | בר אילן לא פעיל ולא הצליח לעלות (`responsaNotRunning`) |
| `elevated` | 409 | בר אילן רץ כמנהל מערכת, והשירות לא |
| `notResponding` | 504 | בר אילן לא עונה (`timeout`) |
| `dialogNotFound` | 502 | חלון העיון לא נמצא (`citationDialogNotFound`, `resultsNotCleared`) |
| `referenceNotFound` | 404 | אף הפניה לא נפתחה (`referenceNotParsed`) |
| `wrongBook` | 409 | נפתח ספר אחר, והוא נסגר (`openedWrongBook`) |
| `windowLimit` | 409 | הגעה לתקרת החלונות של בר אילן (`mdiWindowLimitReached`) |
| `busy` | 409 | פתיחה אחרת רצה, או מופע שני של השירות |
| `cancelled` | 409 | הפעולה בוטלה |
| `catalogMissing` | 404 | הקטלוג טרם נבנה |
| `unknownBook` | 404 | המפתח לא קיים בקטלוג |
| `badRequest` | 400 | פרמטרים שגויים |
| `forbidden` | 403 | הפרת כלל אבטחה |
| `internal` | 500 | כשל לא צפוי. ה-`message` כולל את הסיבה |

## 4. נקודות קצה

### `GET /health`
מהיר, ואינו נוגע בבר אילן.

```json
{ "ok": true, "service": "otzaria-responsa", "apiVersion": 1,
  "serverVersion": "0.1.0", "capabilities": ["catalog", "open", "icon"] }
```

`capabilities` מאפשר לתוסף ישן לעבוד מול שירות חדש, ולהפך: יכולת שלא הוצהרה אינה נקראת.

### `GET /status`
מצב ההתקנה, המופע, הקטלוג והבנייה. אינו מפעיל את בר אילן.

```json
{
  "installed": true, "running": true, "version": 25,
  "confidence": "verified", "installPath": "C:\\ResponsaCD25",
  "catalog": { "exists": true, "bookCount": 8402, "schemaVersion": 2,
               "outdated": false, "builtAt": "2026-09-27T03:03:35",
               "matchesInstallation": true },
  "build": { "state": "idle" }
}
```

- **`confidence`:** אחד מ-`verified`, `structural`, `unknown`.
- **`build.state`:** אחד מ-`idle`, `running` (עם שדות התקדמות כמו ב-`progress`), `failed` (עם `error`).

### `POST /catalog/build` → NDJSON
- **התחלה:** מתחיל בנייה, או מצטרף לבנייה שכבר רצה. גוף הבקשה: `{}`.
- **ניתוק:** אינו עוצר את הבנייה.
- **עדכון אחרי הבנייה:** התוסף מתעדכן ב-`/status`.

```
{"type":"start"}
{"type":"progress","stage":"scanning","scanned":412000,"expected":1251889,"sectionsDone":7,"sectionsTotal":20}
{"type":"heartbeat"}
{"type":"progress","stage":"classifying","scanned":1251889}
{"type":"done","books":8402,"scanned":1251889}
```

- **כשל:** שורה `{"type":"error","code":"…","message":"…"}`, ואחריה הזרם נסגר.
- **`expected`:** מספר הצמתים מהבנייה הקודמת. בבנייה ראשונה אין אותו, ויש רק `sectionsDone`/`sectionsTotal`.

### `POST /catalog/cancel`
`{}` → `{"ok": true, "wasRunning": true}`

### `POST /catalog/search`
חיפוש בשם הספר ובנתיב שלו, שכולל את המחבר. שם המחבר הוא רכיב בנתיב, ולכן הנתיב חלק ממרחב החיפוש.

```json
{ "q": "מהרש\"א", "offset": 0, "limit": 50 }
```
```json
{ "total": 78, "results": [ { "key": "1524", "title": "…", "author": "…",
  "pubPlace": "…", "pubDate": "…", "contextPath": "…/…", "otzariaCategory": "…" } ] }
```

- **נרמול:** ההשוואה עוברת דרך `ResponsaHebrew.normalize`: ניקוד, גרשיים וכתיב.
- **מגבלות:** `limit` עד 200.
- **קטלוג חסר:** מחזיר `catalogMissing`.

### `POST /catalog/books`
`{"keys": ["1524", "7"]}` → `{"results": [ … ]}`, בסדר שהתבקש. מפתח שאינו קיים מושמט. משמש לדפדוף לפי מזהים ב-`resultsProvider`, ולהיסטוריה.

### `POST /book/open`
```json
{ "key": "1524" }
```
- **הצלחה:** `{"ok": true, "window": "רא\"ש יבמות", "usedRef": "רא\"ש יבמות"}`.
- **כשל:** אחד מקודי השגיאה בסעיף 3. ב-`details` מופיעות `triedRefs`.
- **איך נפתח ספר:**
  - השירות מביא את ההפניות מהקטלוג בעצמו, והתוסף לא שולח הפניה;
  - אם בר אילן סגור, השירות מפעיל אותו;
  - החלון שנפתח עולה לחזית.
- **פתיחה אחת בכל רגע:** פתיחה שנייה בזמן שהראשונה רצה מחזירה `busy`.

### `GET /icon`
`{"png": "<base64>"}`, או 404 אם לא נמצא.

- **מקור:** הסמל נחלץ מ-`RESPONSA.exe` שבמחשב. הוא סימן מסחרי, ולכן לא נארז בתוסף.
- **מטמון:** נשמר בתיקיית הנתונים של השירות.

## 5. מיקומים

| מה | איפה |
|---|---|
| השירות | `%LOCALAPPDATA%\Programs\OtzariaResponsa\` |
| קטלוג, סמל ויומן | `%LOCALAPPDATA%\OtzariaResponsa\` |
| הפעלה | בכניסה למשתמש (HKCU\Run), **לא** שירות Windows |

**למה לא שירות Windows:** שירות רץ ב-Session 0, ומשם הוא לא רואה את חלונות בר אילן בסשן של המשתמש ולא יכול לשלוח להם הודעות.

**שרידות:** הקטלוג מחוץ לתיקיית הספרייה של אוצריא, ולכן התקנה מלאה של אוצריא והעברת ספרייה לא מוחקות אותו.

## 6. מופע יחיד

- **mutex:** `Local\OtzariaResponsaHelper`.
- **מופע שני:** יוצא מיד עם קוד 3.
- **הפורט תפוס בלי ה-mutex:** זו תוכנה אחרת. השירות רושם זאת ביומן ויוצא עם קוד 4.

## 7. גרסאות

- **`apiVersion`:** עולה רק בשבירת תאימות.
- **תוספת לא שוברת:** שדה חדש או נקודת קצה חדשה נכנסים כ-`capability`, בלי להעלות את `apiVersion`.
- **שדות לא מוכרים:** התוסף מתעלם משדות שאינו מכיר.
