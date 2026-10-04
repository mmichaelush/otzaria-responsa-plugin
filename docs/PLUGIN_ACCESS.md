# רשימת ספרי בר אילן לתוספים אחרים

למפתחי תוספים לאוצריא (למשל "קטלוג הספרים") שרוצים להציג את ספרי בר אילן שבמחשב המשתמש, או לפתוח אותם בבר אילן.

אין צורך ב-API חדש ואין צורך לגעת בקבצים של התוסף: הרשימה כבר מוגשת מ"שירות בר אילן לאוצריא", השירות המקומי שהתוסף שלנו משתמש בו. כל תוסף עם ההרשאה לשירותים מקומיים יכול לקרוא אותה באותה דרך. קובץ ה-SQLite של השירות אינו נגיש לתוסף (אין לתוסף גישה לקבצים שרירותיים), וגם אין בו צורך.

## מה מקבלים

לכל ספר:

| שדה | דוגמה | הערה |
|---|---|---|
| `key` | `"3232"` | מזהה הספר ברשימה: מספר שהשירות נותן, לא מזהה של בר אילן. נשמר גם אחרי קריאה מחדש, כשהספר זוהה בוודאות |
| `title` | `"מהרש\"א חידושי אגדות"` | |
| `author` | `"ר' שמואל אליעזר איידליש"` | לא תמיד קיים |
| `pubPlace`, `pubDate`, `edition` | `"ישראל"`, `"תש\"מ"` | מקום ושנת הדפסה, מהדורה. לא תמיד קיימים |
| `contextPath` | `"מפרשים ופוסקים על הבבלי והירושלמי/אחרונים על הבבלי/מהרש\"א"` | המיקום בעץ של בר אילן, `/` בין הרמות, בלי הספר עצמו |
| `otzariaCategory` | `"תלמוד בבלי/אחרונים"` | הקטגוריה המקבילה באוצריא, כשיש |

ב-CD25 יש כ-8,400 ספרים. זו רשימת **קטלוג** בלבד. השירות אינו קורא ואינו מגיש את תוכן הספרים.

## מה צריך אצל המשתמש

- פרויקט השו"ת של בר אילן, בכל מהדורה;
- "שירות בר אילן לאוצריא" (מותקן עם התוסף "בר אילן");
- רשימת הספרים נקראה פעם אחת בתוסף "בר אילן". לפני כן כל בקשה עונה `catalogMissing`.

## המניפסט של התוסף שלכם

```json
"permissions": ["network.localhost"],
"network": { "enabled": true, "allowlist": ["127.0.0.1"] }
```

## הקוד

הבקשות עוברות ב-`Otzaria.call('network.fetchStream', …)`. `fetch()` ישיר מהדף אינו עובד: השירות דוחה כל בקשה של דפדפן ([PROTOCOL.md §2](PROTOCOL.md#2-אבטחה)).

```javascript
const SERVICE = 'otzaria-responsa';
const PORTS = Array.from({ length: 10 }, (_, i) => 39700 + i);

/**
 * בקשה אחת לשירות. כשהשירות ענה בשגיאה — זורקת `{ code, message }`; כשל
 * רשת זורק `Error` רגיל.
 */
async function call(base, method, path, body, timeoutMs = 15000) {
  const request = { url: base + path, method, timeoutMs };
  if (body !== undefined) {
    request.headers = { 'Content-Type': 'application/json' };
    request.body = JSON.stringify(body);
  }
  let status = 0;
  let text = '';
  for await (const chunk of Otzaria.call('network.fetchStream', request)) {
    if (chunk.type === 'response') status = chunk.status;
    else if (chunk.type === 'data') text += chunk.body;
  }
  const json = text ? JSON.parse(text) : {};
  if (status >= 400) throw json.error || { code: 'http' + status, message: text };
  return json;
}

/** הפורט של השירות: הראשון בטווח שעונה בשם הנכון. */
async function findService() {
  for (const port of PORTS) {
    const base = 'http://127.0.0.1:' + port;
    try {
      // פורט סגור עונה מיד; הקצבה הקצרה רק למקרה של תוכנה תקועה.
      const health = await call(base, 'GET', '/health', undefined, 2500);
      if (health.service === SERVICE && health.apiVersion === 1) return base;
    } catch (_) {
      // פורט סגור, או שירות של משתמש Windows אחר: ממשיכים.
    }
  }
  return null; // השירות אינו מותקן או אינו פועל
}

/** כל הספרים, עם כל הפרטים. */
async function loadResponsaBooks() {
  const base = await findService();
  if (!base) return null;
  // הרשימה כולה בבקשה אחת: [key, title, author, contextPath].
  const { builtAt, books } = await call(base, 'GET', '/catalog/export');
  // הפרטים המלאים, עד 200 מזהים בבקשה.
  const details = [];
  for (let i = 0; i < books.length; i += 200) {
    const keys = books.slice(i, i + 200).map((row) => row[0]);
    const { results } = await call(base, 'POST', '/catalog/books', { keys });
    details.push(...results);
  }
  return { builtAt, books: details };
}
```

שמרו את `builtAt` (כשקיים) עם הרשימה: הוא משתנה רק כשהמשתמש קורא את הרשימה מחדש, וכך אפשר לדעת מתי לרענן.

## פתיחת ספר בבר אילן

```javascript
await call(base, 'POST', '/book/open', { key: '3232', notify: true });
```

הספר נפתח בתוכנת בר אילן עצמה. עם `notify: true` התשובה כוללת גם `message` מוכן להצגה. איתור מקום מדויק (`/reference/open`) מתואר ב-[PROTOCOL.md](PROTOCOL.md).

## שגיאות

כל כשל מוחזר עם `error.code` ו-`error.message` (הודעה בעברית, מוכנה להצגה). הנפוצות:

| code | מה לעשות |
|---|---|
| `catalogMissing` | להציע למשתמש לפתוח את התוסף "בר אילן" ולקרוא את רשימת הספרים |
| `catalogUnreadable` | הרשימה פגומה. להציע לקרוא אותה מחדש בתוסף "בר אילן" |
| `unknownBook` | הספר אינו ברשימה הנוכחית (אולי נקראה מחדש). לרענן את הרשימה |
| `busy` | בר אילן עסוק (קריאת הרשימה או פתיחה אחרת), או שהרשימה מתחלפת ברגע זה. לנסות שוב בעוד כמה שניות |
| `notRunning`, `notInstalled` | בפתיחת ספר: בר אילן סגור או לא מותקן. ההודעה אומרת מה לעשות |
| `otherSession` | בחיפוש הפורט: שירות של משתמש Windows אחר. ממשיכים לפורט הבא |

הרשימה המלאה ב-[PROTOCOL.md §3](PROTOCOL.md#3-שגיאות).

## יציבות

- `/health`, `/catalog/export`, `/catalog/books` ו-`/book/open` הם חלק מהחוזה שהתוסף "בר אילן" עצמו נשען עליו. שינוי שובר מעלה את `apiVersion`, ולכן כדאי לבדוק אותו כמו בקוד שלמעלה.
- שדה חדש יכול להתווסף לספר בכל גרסה. התעלמו משדות שאינכם מכירים.

## רישיון בר אילן

הרשימה נבנית ממערכת שהמשתמש רכש, ונשארת במחשב שלו ([התוסף ותנאי הרישיון של בר אילן](../README.md#התוסף-ותנאי-הרישיון-של-בר-אילן)). תוסף שקורא אותה אחראי למה שהוא עושה בה. אנא אל תשלחו אותה אל מחוץ למחשב ואל תפרסמו אותה, והציגו את הספרים כספרי בר אילן, כדי שהמשתמש יידע שהם נפתחים בתוכנה שלו.
