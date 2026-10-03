// איתור מקום מדויק: שם ספר ומקום בו ("בראשית ב ג"), כפי שכותבים בעמוד
// "כתיבת מקורות" של בר אילן. לוגיקה טהורה; הלשונית ב-responsa-locate-ui.js.
(function (root) {
  'use strict';

  const I18n = root.ResponsaI18n;
  const t = (text, vars) => I18n.t(text, vars);

  /** כמו בשירות (`HelperService.maxReferenceLength`). */
  const MAX_LENGTH = 200;

  /** כמו בהגדרות (`MAX_LOCATE_HISTORY`). */
  const MAX_HISTORY = 8;

  const LETTER = /[א-ת]/;

  /** דוגמאות לכתיבה, כל אחת בצורה שבר אילן מזהה. */
  const EXAMPLES = Object.freeze([
    'בראשית ב ג',
    'ברכות דף ב עמוד א',
    'משנה ברכות פרק א משנה א',
    'שולחן ערוך אורח חיים סימן א',
    'רמב"ם הלכות שבת פרק א',
  ]);

  /** ניקוד נמחק, מקף הופך לרווח, ורווחים מיותרים מתאחדים — כמו בשירות. */
  function normalize(value) {
    // כמו HelperService.normalizeReference, כדי ש"אחרונים" לא יכיל כפילויות
    // שנראות זהות (סימני כיווניות מהדבקה).
    return String(value || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .replace(/[\u0591-\u05C7]/g, (char) => (char === '\u05BE' ? ' ' : ''))
      .replace(/[\u05F3\u2018\u2019\u00B4`]/g, "'")
      .replace(/[\u05F4\u201C\u201D]|''/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LENGTH);
  }

  /** `null`, או הסבר מה חסר. */
  function validate(value) {
    const ref = normalize(value);
    if (!LETTER.test(ref)) {
      return t('כתבו שם ספר ומקום בו, למשל "בראשית ב ג".');
    }
    if (!/\s/.test(ref)) {
      return t('חסר המקום בספר. כותבים אחרי שם הספר את הפרק, הדף או הסימן, למשל "{example}".', {
        example: ref + ' א',
      });
    }
    return null;
  }

  /** המקום האחרון בראש הרשימה, בלי כפילויות. */
  function remember(history, value) {
    const ref = normalize(value);
    if (!ref) return history;
    return [ref, ...history.filter((entry) => entry !== ref)].slice(0, MAX_HISTORY);
  }

  /** "פתיחה במקום מסוים" מתוך ספר ברשימה: שם הספר, ואחריו רווח להמשך. */
  function startFrom(title) {
    const name = normalize(title).replace(/\s*\([^)]*\)\s*$/, '');
    return name ? name + ' ' : '';
  }

  const api = { MAX_LENGTH, MAX_HISTORY, EXAMPLES, normalize, validate, remember, startFrom };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaLocate = api;
})(typeof self !== 'undefined' ? self : globalThis);
