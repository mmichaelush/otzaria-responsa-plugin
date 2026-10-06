// האם מספר האזהרות של הוולידטור הרשמי מותר. מותרות רק ההמלצות להסיר הרשאת
// בסיס מוצהרת (אחת לכל הרשאה כזו במניפסט), וכל אזהרה אחרת מכשילה.
//
// המספר חייב להיות שווה בדיוק: אם הוולידטור יפסיק להמליץ על הרשאת הבסיס,
// אזהרה אחרת לא תעבור במקומה בשקט, והבדיקה תיכשל עד שיעודכן כאן.
//
// למה: אוצריא דורשת להצהיר על plugin.storage.read כשפעולה במניפסט משתמשת
// ב-$storage (Otzaria#1762), והוולידטור (v1.19.1) עדיין ממליץ להסיר אותה כי
// היא הרשאת בסיס. החנות אינה חוסמת על ההמלצה הזו.
//   node tools/validator-warnings.js plugin/manifest.json <total-warnings>
'use strict';

const path = require('node:path');

/** pluginBaselinePermissions באוצריא (plugin_valid_permissions.dart). */
const BASELINE = new Set([
  'plugin.storage.read',
  'plugin.storage.write',
  'app.info.read',
  'ui.feedback',
  'notifications.send',
  'events.subscribe:theme.changed',
]);

const [manifestPath, countText] = process.argv.slice(2);
const manifest = require(path.resolve(manifestPath));
const allowed = (manifest.permissions || []).filter((permission) => BASELINE.has(permission)).length;
const count = /^\d+$/.test(String(countText || '').trim()) ? Number(countText) : NaN;
if (!Number.isInteger(count)) {
  console.error('::error::מספר אזהרות לא תקין: ' + countText);
  process.exit(1);
}
if (count !== allowed) {
  console.error(
    count > allowed
      ? `::error::הוולידטור החזיר ${count} אזהרות, ומותרות ${allowed} (הרשאות בסיס מוצהרות). את השאר מתקנים.`
      : `::error::הוולידטור החזיר ${count} אזהרות, וצפויות ${allowed} (הרשאות בסיס מוצהרות). ייתכן שהוולידטור השתנה: בדקו ועדכנו את הכלי הזה.`,
  );
  process.exit(1);
}
console.log(`אזהרות הוולידטור: ${count} מתוך ${allowed} מותרות (הרשאות בסיס מוצהרות).`);
