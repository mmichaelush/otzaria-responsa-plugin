# בר אילן לאוצריא

תוסף לאוצריא שמחבר אותה לתוכנת **פרויקט השו"ת של אוניברסיטת בר אילן** שמותקנת במחשב. מתוך אוצריא אפשר:
- לחפש ספרי בר אילן לפי שם או מחבר;
- לראות לכל ספר מחבר, מקום ושנת הדפסה;
- לפתוח את הספר בבר אילן בלחיצה.

![חיפוש בתוסף](docs/images/plugin-search.png)

## התקנה

1. הורידו את **`OtzariaResponsa-Setup-….exe`** מ[דף ההורדות](https://github.com/mmichaelush/otzaria-responsa-plugin/releases/latest).
2. הריצו אותו. אין צורך בהרשאות מנהל.
3. אשרו את התקנת התוסף באוצריא.

**מדריך מלא, עם תמונות ופתרון בעיות:** [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## מה התוסף לא עושה

- **לא מעתיק תוכן.** נבנית רק רשימת ספרים (שם, מחבר ומיקום בעץ), מהתוכנה שמותקנת אצל המשתמש.
- **הספר נפתח בבר אילן**, לא בתוך אוצריא.
- **שום מידע לא יוצא מהמחשב.**

## דרישות

- Windows 10 ומעלה, 64 ביט;
- אוצריא 0.9.97 ומעלה;
- פרויקט השו"ת של בר אילן, בכל מהדורה. נבדק חי על מהדורות 25 ו-29.

## איך זה בנוי

**שני רכיבים**, באותו מבנה כמו תוסף היברובוקס:
- **התוסף** (`plugin/`) רץ בתוך אוצריא.
- **שירות מקומי קטן** (`helper/`) רץ ברקע ושולט בבר אילן.

הם מדברים ב-HTTP על `127.0.0.1:39700`.

| מסמך | למי |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | משתמשים |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | מפתחים: רכיבים, החלטות, דיבוג, בדיקות, שחרור |
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | החוזה בין התוסף לשירות |
| [AGENTS.md](AGENTS.md) | כללי עבודה ומלכודות ידועות |
| [CHANGELOG.md](CHANGELOG.md) | שינויים לפי גרסה |

## פיתוח

```powershell
# השירות
cd helper
dart pub get
dart analyze --fatal-infos
dart test
dart build cli

# התוסף
node --test plugin/test/*.test.js
node tools/preview/screenshots.mjs      # צילום כל המסכים

# המתקין המלא (דורש Inno Setup 6)
powershell -File installer/build.ps1
```

**מקור המנוע:** קוד השליטה בבר אילן הועבר מ-[Otzaria/otzaria#1572](https://github.com/Otzaria/otzaria/pull/1572) (התג `responsa-core-final` ב-`mmichaelush/otzaria`).
