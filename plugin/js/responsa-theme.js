// ערכת הצבעים והגופנים של אוצריא, כמשתני CSS (DESIGN_GUIDE.md). כל תפקיד
// צבע ב-`colorScheme` הופך ל-`--color-<kebab>`, כך שתפקיד שאוצריא תוסיף
// בעתיד יהיה זמין בלי שינוי כאן.
(function (root) {
  'use strict';

  function kebab(name) {
    return name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
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
    if (typography.uiFontFamily) {
      style.setProperty(
        '--font-ui',
        "'" + typography.uiFontFamily + "', system-ui, sans-serif",
      );
    }
    return true;
  }

  const api = { applyTheme, kebab };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaTheme = api;
})(typeof self !== 'undefined' ? self : globalThis);
