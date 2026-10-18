// כפתור "בבר אילן" בתוך שדות החיפוש של אוצריא (`searchFieldActions`, מאוצריא
// 0.9.99): מה שהוקלד בשדה עובר לבר אילן — חיפוש בטקסט, איתור מקום, או ספר.
//
// TODO(otzaria-0.9.99): כבוי עד שתצא אוצריא 0.9.99 (לא Preview). להפעלה:
//   1. ENABLED = true כאן.
//   2. במניפסט: "minAppVersion": "0.9.99", ההרשאה PERMISSION, ובתוך
//      contributes.startup — "searchFieldActions": [CONTRIBUTION].
//   3. בדיקת התאימות ב-test/field-actions.test.js תיכשל עד ששלושתם יתאימו.
//   4. משתמשי 0.9.98 לא יוכלו להתקין את הגרסה הזו, ולכן רק אחרי שרוב
//      המשתמשים עברו. הפרטים ב-docs/ARCHITECTURE.md ("אחרי אוצריא 0.9.99").
//
// התיעוד: docs/plugin-sdk/API_REFERENCE.md של אוצריא (ענף dev), "כפתורים
// בשדות החיפוש". לחיצה פותחת את הלשונית (אין לתוסף מנוע רקע) ומוסרת אליה
// `search.fieldAction.invoked`; התוסף אינו כותב לשדה, ולכן הסשן נסגר מיד.
(function (root) {
  'use strict';

  /** TODO(otzaria-0.9.99): להדליק אחרי שאוצריא 0.9.99 יוצאת. */
  const ENABLED = false;

  const MIN_APP_VERSION = '0.9.99';
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

  /** מחבר את האירוע ל-[app]. `false` כשהתכונה כבויה (עד 0.9.99). */
  function register(on, app) {
    if (!ENABLED) return false;
    on('search.fieldAction.invoked', (event) => app.fieldActionInvoked(event));
    return true;
  }

  const api = { ENABLED, MIN_APP_VERSION, PERMISSION, ACTION_ID, CONTRIBUTION, requestFor, register };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaFieldActions = api;
})(typeof self !== 'undefined' ? self : globalThis);
