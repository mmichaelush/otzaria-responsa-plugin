// ערכת הצבעים והגופנים של אוצריא, כמשתני CSS (DESIGN_GUIDE.md). כל תפקיד
// צבע ב-`colorScheme` הופך ל-`--color-<kebab>`, כך שתפקיד שאוצריא תוסיף
// בעתיד יהיה זמין בלי שינוי כאן. מעליה — המראה שבחר המשתמש בהגדרות התוסף
// (גופן וגודל תצוגה), שגובר על גופן הממשק של אוצריא.
(function (root) {
  'use strict';

  /** גופן הממשק של אוצריא (`typography.uiFontFamily`), כשנשלח. */
  let hostFont = null;
  /** הגופן שנבחר בתוסף; '' = כמו באוצריא. */
  let chosenFont = '';

  function kebab(name) {
    return name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
  }

  /** גופנים בלי תגיות (sans). לשאר הגיבוי הוא serif, כמו ב-COOKBOOK של אוצריא. */
  const SANS = new Set(['Rubik', 'Shofar']);

  /** שם משפחה בתוך מחרוזת CSS: מרכאות ולוכסן היו שוברים את הערך. */
  function family(name, serif) {
    const clean = String(name).replace(/['"\\]/g, '');
    return "'" + clean + "', " + (serif && !SANS.has(clean) ? "'David', serif" : 'system-ui, sans-serif');
  }

  /**
   * `--font-ui` — הגופן של התוסף; `--font-host` — גופן הממשק של אוצריא, שבו
   * מוצג "כמו באוצריא" בתפריט הגופן גם כשנבחר גופן אחר.
   */
  function applyFont(doc) {
    const style = doc.documentElement.style;
    if (hostFont) style.setProperty('--font-host', family(hostFont, false));
    else style.removeProperty('--font-host');
    if (chosenFont) style.setProperty('--font-ui', family(chosenFont, true));
    else if (hostFont) style.setProperty('--font-ui', family(hostFont, false));
    else style.removeProperty('--font-ui');
  }

  /** `true` כשהערכה הוחלה. ערכה חסרה או חלקית נשארת על ברירות המחדל. */
  function applyTheme(theme, documentRef) {
    const doc = documentRef || root.document;
    if (!theme || !theme.colorScheme || !doc) return false;
    const style = doc.documentElement.style;
    for (const [role, value] of Object.entries(theme.colorScheme)) {
      if (typeof value === 'string' && value !== '') {
        style.setProperty('--color-' + kebab(role), value);
      }
    }
    doc.documentElement.dataset.mode = theme.mode === 'dark' ? 'dark' : 'light';
    const typography = theme.typography || {};
    // גופן הקריאה אינו מתאים לממשק (DESIGN_GUIDE); משתמשים רק בגופן הממשק.
    // מארח ישן אינו שולח אותו, ואז נשאר הגופן הקודם.
    if (typography.uiFontFamily) hostFont = typography.uiFontFamily;
    applyFont(doc);
    return true;
  }

  /**
   * המראה מהגדרות התוסף: `font` (שם משפחה, או '' לגופן של אוצריא) ו-`scale`
   * (מכפיל של גודל הממשק, `--ui-scale`).
   */
  function applyAppearance(appearance, documentRef) {
    const doc = documentRef || root.document;
    if (!doc) return;
    const value = appearance || {};
    chosenFont = typeof value.font === 'string' ? value.font : '';
    const scale = typeof value.scale === 'number' && value.scale > 0 ? value.scale : 1;
    doc.documentElement.style.setProperty('--ui-scale', String(scale));
    applyFont(doc);
  }

  const api = { applyTheme, applyAppearance, kebab };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaTheme = api;
})(typeof self !== 'undefined' ? self : globalThis);
