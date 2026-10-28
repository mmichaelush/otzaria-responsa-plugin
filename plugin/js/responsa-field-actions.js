// כפתור "בבר אילן" בתוך שדות החיפוש של אוצריא (`searchFieldActions`, מאוצריא
// 0.9.98.1): מה שהוקלד בשדה עובר לבר אילן — חיפוש בטקסט, איתור מקום, או ספר.
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

  /** מה שנכנס למניפסט (contributes.startup.searchFieldActions). */
  const CONTRIBUTION = Object.freeze({
    id: ACTION_ID,
    title: 'בבר אילן',
    icon: 'book_open_medium_search_24_regular',
    // `inBook` לא: חיפוש בתוך ספר פתוח של אוצריא אינו שאלה לבר אילן.
    fields: Object.freeze(['fullText', 'findRef', 'library']),
  });

  /** לאיזו לשונית מגיע כל שדה. */
  const TAB_FOR_FIELD = Object.freeze({ fullText: 'text', findRef: 'locate', library: 'books' });

  /**
   * מה לעשות בלחיצה: `{ tab, text, sessionId }`, או `null` (כפתור אחר, שדה
   * לא מוכר). טקסט מסומן בשדה — רק הוא; אחרת כל השדה.
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
    return { tab, text: (selected.trim() ? selected : full).trim(), sessionId: event.sessionId || null };
  }

  /** מחבר את האירוע ל-[app]. */
  function register(on, app) {
    on('search.fieldAction.invoked', (event) => app.fieldActionInvoked(event));
  }

  const api = { MIN_APP_VERSION, PERMISSION, ACTION_ID, CONTRIBUTION, requestFor, register };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaFieldActions = api;
})(typeof self !== 'undefined' ? self : globalThis);
