// העברת חיפוש בין אוצריא לתוסף, בשני שינויים באוצריא שעדיין לא יצאו:
// - Otzaria/otzaria#3067: `reader.openSearchTab` מקבל ב-`settings` גם היקף
//   (`facets`...) ושלילה, ולכן החיפוש שחוזר לאוצריא לא מאבד אותם;
// - Otzaria/otzaria#3068: `resultsAction` בשורת `searchDialogItems` מציג בטאב
//   החיפוש של אוצריא כפתור שמעביר את אותו חיפוש לתוסף, אחרי שהמשתמש ראה את
//   התוצאות — במקום לחפש פעמיים כדי לספור.
// שניהם כבויים, ומיועדים לאוצריא 0.9.99 (`minAppVersion`).
//
// TODO(otzaria-0.9.99): כשהשינויים מתמזגים ויוצאים בגרסה רגילה (לא Preview):
//   1. SCOPE_ENABLED = true כאן.
//   2. RESULTS_ACTION_ENABLED = true כאן, ובמניפסט: "minAppVersion": "0.9.99"
//      ו-`resultsAction` בשורה `responsa-search-dialog` (RESULTS_ACTION_TITLE).
//   3. הבדיקות ב-test/search-handoff.test.js נכשלות עד שהמתג והמניפסט תואמים.
//   4. לבדוק בחיפוש חי: מה מגיע ב-`search.requested` מהכפתור, ואם אפשר להבדיל
//      אותו משליחה עם השורה מסומנת (ראו `app.searchFromOtzaria`).
//   5. אם #3068 שונה בביקורת — להתאים את השם והתנאים כאן. משתמשי 0.9.98 לא
//      יוכלו להתקין, ולכן רק אחרי שרוב המשתמשים עברו.
// הפרטים ב-docs/ARCHITECTURE.md ("אחרי אוצריא 0.9.99").
(function (root) {
  'use strict';

  /** TODO(otzaria-0.9.99): #3067 — ההיקף והשלילה נשלחים ל-`reader.openSearchTab`. */
  const SCOPE_ENABLED = false;

  /** TODO(otzaria-0.9.99): #3068 — כפתור בתוצאות של אוצריא במקום "קודם באוצריא". */
  const RESULTS_ACTION_ENABLED = false;

  const MIN_APP_VERSION = '0.9.99';
  const SEARCH_DIALOG_ITEM_ID = 'responsa-search-dialog';
  /** הכיתוב בכפתור שבטאב החיפוש של אוצריא (עד 120 תווים). */
  const RESULTS_ACTION_TITLE = 'להמשיך בבר אילן';

  const LETTER = /[א-ת]/;
  const SCOPE_LISTS = ['facets', 'categories', 'books', 'authors', 'eras'];
  const NEGATIVE_MAPS = [
    'negativeOptions',
    'negativeWordOptions',
    'alternativeWords',
    'negativeAlternativeWords',
    'customSpacing',
    'negativeCustomSpacing',
  ];

  const filledObject = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;

  /**
   * מה מהבקשה של אוצריא (`search.requested`, בחוזה של `search.query`) נשלח
   * שוב ל-`reader.openSearchTab`: ההיקף והשלילה. `{}` כשהתכונה כבויה, או
   * כשהבקשה היא על כל הספרייה ובלי שלילה. [enabled] לבדיקות.
   */
  function scopeSettings(request, enabled = SCOPE_ENABLED) {
    if (!enabled || !request || typeof request !== 'object') return {};
    const settings = {};
    for (const key of SCOPE_LISTS) {
      const value = request[key];
      if (!Array.isArray(value) || !value.length) continue;
      // `['/']` הוא "כל הספרייה": ברירת המחדל, ואין סיבה לשלוח אותה.
      if (key === 'facets' && value.every((facet) => facet === '/')) continue;
      settings[key] = value;
    }
    if (request.baseBooksOnly === true) settings.baseBooksOnly = true;
    if (typeof request.negativeQuery === 'string' && LETTER.test(request.negativeQuery)) {
      settings.negativeQuery = request.negativeQuery;
      for (const key of NEGATIVE_MAPS) if (filledObject(request[key])) settings[key] = request[key];
    }
    if (filledObject(request.alternativeWords)) settings.alternativeWords = request.alternativeWords;
    if (filledObject(request.customSpacing)) settings.customSpacing = request.customSpacing;
    return settings;
  }

  /** שורת הדיאלוג עם `resultsAction`, כשהתכונה דלוקה; אחרת השורה כמות שהיא. */
  function searchDialogItem(item, enabled = RESULTS_ACTION_ENABLED) {
    return enabled ? { ...item, resultsAction: RESULTS_ACTION_TITLE } : item;
  }

  const api = {
    SCOPE_ENABLED,
    RESULTS_ACTION_ENABLED,
    MIN_APP_VERSION,
    SEARCH_DIALOG_ITEM_ID,
    RESULTS_ACTION_TITLE,
    scopeSettings,
    searchDialogItem,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaSearchHandoff = api;
})(typeof self !== 'undefined' ? self : globalThis);
