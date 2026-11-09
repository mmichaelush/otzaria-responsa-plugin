// כפתור "בבר אילן" בתוך שדות החיפוש של אוצריא (`searchFieldActions`, מאוצריא
// 0.9.98.1): מה שהוקלד בשדה עובר לבר אילן — חיפוש בטקסט או איתור מקום; ובשדה
// איתור הספר, כפתור שמסנן את מקור הספרים (בר אילן / אוצריא / שניהם).
//
// התיעוד: docs/plugin-sdk/API_REFERENCE.md של אוצריא, "כפתורים בשדות החיפוש".
// הכפתור נבנה מהמניפסט ואינו מפעיל את התוסף. בלי מנוע רקע (אין
// `app.run_on_startup`), לחיצה פותחת את הלשונית ומוסרת אליה
// `search.fieldAction.invoked`; התוסף אינו כותב לשדה, ולכן הסשן נסגר מיד.
(function (root) {
  'use strict';

  /** `minAppVersion` שהמניפסט חייב להצהיר כדי להשתמש בו. */
  const MIN_APP_VERSION = '0.9.98.1';
  const PERMISSION = 'search.field_actions';
  const ACTION_ID = 'bar-ilan';

  /**
   * מה שנכנס למניפסט (contributes.startup.searchFieldActions). אוצריא מרשה
   * עד שני כפתורים לתוסף, ושניהם בשימוש:
   *  1. "בבר אילן" — מעביר את מה שהוקלד לבר אילן, בחיפוש בטקסט ובאיתור מקור.
   *     `inBook` לא: חיפוש בתוך ספר פתוח של אוצריא אינו שאלה לבר אילן.
   *  2. "מקור הספרים" — בשדה איתור הספר של מסך הספרייה: מחליף מחזורית בין
   *     "הכול", "בר אילן בלבד" ו"אוצריא בלבד". אוצריא מבצעת אותו בעצמה, בלי
   *     אירוע ובלי הפעלת התוסף (`mode: providerBooksFilter`, מ-0.9.98.3).
   */
  const CONTRIBUTIONS = Object.freeze([
    Object.freeze({
      id: ACTION_ID,
      title: 'בבר אילן',
      icon: 'book_open_medium_search_24_regular',
      fields: Object.freeze(['fullText', 'findRef']),
    }),
    Object.freeze({
      id: 'source-filter',
      title: 'מקור הספרים',
      icon: 'book_open_medium_search_24_regular',
      activeIcon: 'book_open_medium_search_24_filled',
      libraryOnlyIcon: 'book_24_regular',
      mode: 'providerBooksFilter',
    }),
  ]);

  /** לאיזו לשונית מגיע כל שדה. */
  const TAB_FOR_FIELD = Object.freeze({ fullText: 'text', findRef: 'locate' });

  /**
   * מה לעשות בלחיצה: `{ tab, text, sessionId, request }`, או `null` (כפתור
   * אחר, שדה לא מוכר). טקסט מסומן בשדה — רק הוא; אחרת כל השדה.
   * `request` (אוצריא 0.9.98.3, בשדה החיפוש בטקסט בלבד) הוא מצב הדיאלוג
   * כולו, כמו ב-`search.requested`: אפשרויות המילים וההיקף עוברים איתו.
   * הוא נשלח רק כשלא נבחר חלק מהטקסט, כי אז המילים אינן אלה שבבקשה.
   */
  function requestFor(event) {
    if (!event || event.actionId !== ACTION_ID) return null;
    const tab = TAB_FOR_FIELD[event.field];
    if (!tab) return null;
    const full = typeof event.text === 'string' ? event.text : '';
    const start = event.selectionStart;
    const end = event.selectionEnd;
    const selected =
      Number.isInteger(start) && Number.isInteger(end) && end > start ? full.slice(start, end) : '';
    const request =
      !selected.trim() && event.request && typeof event.request === 'object' && typeof event.request.query === 'string'
        ? event.request
        : null;
    return { tab, text: (selected.trim() ? selected : full).trim(), sessionId: event.sessionId || null, request };
  }

  /** מחבר את האירוע ל-[app]. */
  function register(on, app) {
    on('search.fieldAction.invoked', (event) => app.fieldActionInvoked(event));
  }

  const api = { MIN_APP_VERSION, PERMISSION, ACTION_ID, CONTRIBUTIONS, requestFor, register };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaFieldActions = api;
})(typeof self !== 'undefined' ? self : globalThis);
