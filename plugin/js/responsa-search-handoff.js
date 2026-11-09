// העברת חיפוש בין אוצריא לתוסף, בשני שינויים של אוצריא (Otzaria/otzaria#2583):
// - #3067, מאוצריא 0.9.98.1: `reader.openSearchTab` מקבל ב-`settings` גם היקף
//   (`facets`...), שלילה ו-`anyOrder`, ולכן חיפוש שחוזר לאוצריא אינו מאבד אותם
//   ([scopeSettings]);
// - #3068, מאוצריא 0.9.98.3: `resultsAction` בשורת `searchDialogItems` מציג
//   בטאב החיפוש של אוצריא כפתור שמעביר את אותו חיפוש לתוסף, אחרי שהמשתמש ראה
//   את התוצאות (גם במסך "אין תוצאות"), במקום לחפש פעמיים כדי לספור.
//   הוולידטור דורש מהמניפסט `minAppVersion` 0.9.98.3 לפחות.
//
// הכפתור וההגשה של השורה המסומנת מגיעים כאותו אירוע (`search.requested` עם
// `itemId` ו-`request` זהים), ולכן אי אפשר להבדיל ביניהם. מזה נגזר ש-"חיפוש
// גם באוצריא" אינו חל על חיפוש מהדיאלוג (הכפתור כבר מגיע ממסך תוצאות של
// אוצריא), ושחיפוש שחזר עכשיו לאוצריא ("חיפוש באוצריא קודם") ושב ומגיע הוא
// לחיצה על הכפתור (`App._otzariaFirstSearch`).
(function (root) {
  'use strict';

  /** #3068: כפתור בתוצאות של אוצריא; המניפסט מצהיר עליו. */
  const RESULTS_ACTION_ENABLED = true;

  const MIN_APP_VERSION = '0.9.98.3';
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
   * שוב ל-`reader.openSearchTab`: ההיקף, השלילה והמילים בכל סדר. `{}` כשהבקשה
   * היא על כל הספרייה, בלי שלילה ובלי סדר חופשי.
   */
  function scopeSettings(request) {
    if (!request || typeof request !== 'object') return {};
    const settings = {};
    for (const key of SCOPE_LISTS) {
      const value = request[key];
      if (!Array.isArray(value) || !value.length) continue;
      // `['/']` הוא "כל הספרייה": ברירת המחדל, ואין סיבה לשלוח אותה.
      if (key === 'facets' && value.every((facet) => facet === '/')) continue;
      settings[key] = value;
    }
    if (request.baseBooksOnly === true) settings.baseBooksOnly = true;
    if (request.anyOrder === true) settings.anyOrder = true;
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
