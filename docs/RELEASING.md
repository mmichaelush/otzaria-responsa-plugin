# שחרור גרסה

למתחזקים: מה מעלים, איך מתייגים, ומה ה-CI עושה לבד.

## 1. מספר הגרסה

שלושה מקומות, **אותו מספר**:

| איפה | מה |
|---|---|
| `plugin/manifest.json` | `version` |
| `helper/lib/src/server/helper_service.dart` | `HelperService.serverVersion` |
| המתקין | לא נערך ידנית: `installer/build.ps1` קורא את הגרסה מהמניפסט ומעביר `/DAppVersion` |

- **`build.ps1` נכשל** אם השירות והמניפסט שונים, וב-CI גם אם התג אינו `v<version>`.
- **`CHANGELOG.md`:** סעיף `## X.Y.Z` בראש הקובץ, עם מה שהשתנה בתוסף ובשירות.
- **שינוי שובר בפרוטוקול:** מעלים גם את `apiVersion` בשני הצדדים (ראו `docs/PROTOCOL.md`).
- **החנות מקבלת רק גרסה גבוהה מזו שכבר בה.** תג עם אותה גרסה לא יפורסם שם.
- **`minAppVersion`:** ה-CI קורא אותו מהמניפסט ומעביר לוולידטור. אין מה לעדכן ב-workflow.
- **צילומי המסך לחנות** ב-`.github/store-screenshots.txt`, בסדר ההצגה.

## 2. תיוג

על הקומיט ב-`main` שבו הגרסה כבר עודכנה:

```sh
git tag v0.2.0
git push origin v0.2.0
```

### גרסה שתלויה ב-PR של אוצריא

גרסה שדורשת API שעוד לא יצא באוצריא (`minAppVersion` גבוה מהגרסה הרשמית האחרונה) אינה מתויגת ידנית. היא ממתינה בענף `release/X.Y.Z`, ו-`release-gate.yml` מפרסם אותה בזמן:

1. **`.github/release-gate.json` ב-`main`:** הגרסה, הענף וה-PR-ים באוצריא שהיא תלויה בהם.

   ```json
   { "version": "0.5.0", "branch": "release/0.5.0", "otzaria": "Otzaria/otzaria", "pulls": [1655, 1762] }
   ```

2. **כל שלוש שעות** (`.github/release-gate.sh`) נבדק שכל ה-PR-ים מוזגו, ושיש גרסה רשמית של אוצריא שכוללת את כולם: לא Pre-release, ולא נמוכה מ-`minAppVersion` שבענף.
3. **כשהכול מוכן:** נוצר התג `vX.Y.Z` על ראש הענף, `main` מתקדם אליו (fast-forward בלבד; אחרת אזהרה, והפרסום ממשיך), ו-`ci.yml` רץ על התג. תג שנוצר ב-`GITHUB_TOKEN` אינו מפעיל workflows בעצמו, ולכן השער מפעיל את `ci.yml` במפורש.

- **מה חסר:** ב-Summary של כל ריצה (Actions ← Release gate).
- **בדיקה ידנית:** Actions ← Release gate ← Run workflow, עם "בדיקה בלבד". אותה בדיקה מקומית: `DRY_RUN=1 GITHUB_REPOSITORY=mmichaelush/otzaria-responsa-plugin bash .github/release-gate.sh`.
- **תיקון לגרסה הממתינה** נדחף לענף שלה. השער מפרסם את הראש שלו, ו-CI רץ על כל push ל-`release/**`.
- **אחרי הפרסום** מעדכנים את `release-gate.json` לגרסה הבאה, או מרוקנים את `version`.
- **`ci.yml` זהה בכל הענפים.** `GITHUB_TOKEN` אינו רשאי לדחוף שינוי ב-workflow, ולכן `main` מתקדם רק כשאין הבדל ב-`.github/workflows`. שינוי ב-workflow נכנס קודם ל-`main`, והענף עובר rebase עליו.
- **GitHub משבית תזמון** במאגר שלא היה בו שינוי 60 יום. אז מפעילים את ה-workflow מחדש בלשונית Actions.

## 3. מה ה-CI עושה בתג

| job | מה |
|---|---|
| `helper`, `plugin` | בדיקות, והוולידטור הרשמי בלי פרסום |
| `installer` | `build.ps1`: השירות, קובץ התוסף (דרך הוולידטור) והמתקין |
| `release` | GitHub Release עם `OtzariaResponsa-Setup-X.Y.Z.exe` ו-`OtzariaResponsa.otzplugin` |
| `store` | פרסום בחנות אוצריא, **אחרי** ה-Release |

- **`store` מפרסם את הקובץ שב-Release:** הוא פורס אותו ומריץ עליו את הוולידטור (`publish: auto`). הוולידטור מפרסם רק מתיקייה, ולכן לא מעבירים לו את הקובץ עצמו.
- **התוצאה ב-Summary של הריצה:** עלה, ממתין לאישור, כבר קיים, נכשל, או חסרים סודות.
- **כשל בחנות לא נוגע ב-Release.** אחרי תיקון (סיסמה, למשל), מריצים שוב רק את `store` ("Re-run failed jobs").
- **ב-PR וב-push ל-`main` או ל-`release/**` אין פרסום.**

## 4. הגדרה חד-פעמית של החנות

1. **סודות:** `OTZARIA_USER` ו-`OTZARIA_PASSWORD` של חשבון החנות. ב-GitHub: Settings ← Secrets and variables ← Actions ← New repository secret. או משורת הפקודה (הערך נשאל בהקלדה):

   ```sh
   gh secret set OTZARIA_USER -R mmichaelush/otzaria-responsa-plugin
   gh secret set OTZARIA_PASSWORD -R mmichaelush/otzaria-responsa-plugin
   ```

   בלי הסודות `store` רק מאמת, ורושם ב-Summary איך להוסיף אותם.

2. **הפרסום הראשון** יוצר את התוסף בחנות, עם צילום המסך `docs/images/plugin-search.png`. הוא **ממתין לאישור מנהל** (`pending-approval=true`). עדכוני גרסה אחריו עולים מיד.

3. **אחרי הפרסום הראשון:** מגדירים את משתנה המאגר `OTZARIA_PLUGIN_ID` למזהה הרשומה בחנות. המזהה מופיע בלוג של `store` ("מזהה התוסף החדש בחנות"), ובכתובת `https://otzaria.org/plugins/<id>`. כך העדכונים הולכים לרשומה הזו, ולא תלויים בזיהוי לפי ה-id שבמניפסט.

   Settings ← Secrets and variables ← Actions ← Variables, או:

   ```sh
   gh variable set OTZARIA_PLUGIN_ID -R mmichaelush/otzaria-responsa-plugin --body <id>
   ```

## 5. איך המתקין מחליט אם להתקין את התוסף

המתקין מתקין את השירות תמיד. את התוסף הוא רק **מציע**, בתיבת סימון במסך הסיום. התיבה פותחת את `OtzariaResponsa.otzplugin` באוצריא, ואוצריא מציגה את חלון ההתקנה שלה.

- **מה נבדק:** התיקיות שבתוך `%APPDATA%\otzaria\plugins\installed\com.otzaria-responsa\`. אוצריא שומרת כל גרסה בתיקייה משלה (`.release-<hash>`, ובגרסאות ישנות `current`) ולא מסמנת איזו פעילה. מכל אחת נקרא `version` מ-`manifest.json`.

| מצב | מסך הסיום |
|---|---|
| **אחת התיקיות בגרסת המתקין** | אין תיבה. "התוסף כבר מותקן ומעודכן" |
| **יש מניפסט בגרסה אחרת** | תיבה מסומנת: "לעדכן את התוסף באוצריא לגרסה X (מומלץ)" |
| **אין מניפסט** (גם תיקייה ריקה שנשארת אחרי הסרה) | תיבה מסומנת: "להתקין את התוסף באוצריא (מומלץ)" |
| **אוצריא לא נמצאה** | אין תיבה. הודעה עם הנתיב לקובץ התוסף |

- **גרסת התוסף שווה לגרסת המתקין,** כי הם יוצאים יחד. לכן ההשוואה היא מול `AppVersion`.
- **מסך הסיום מזכיר את שתי ההרשאות** שאוצריא מציעה כבויות: הגדרות אוצריא ← כלים ← "בר אילן" ← "הוספת רכיבים לתוכנה" ו"הפעלה ברקע לפי אירוע".
- **בהתקנה שקטה** (`/VERYSILENT`) אין מסך סיום, ולכן גם אין הצעה.
