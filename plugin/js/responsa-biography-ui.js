// "ביוגרפיה" בפרטי הספר: כפתור, והמאמר של בר אילן מתחת לפרטים. כמו שאר קובצי
// ה-UI: מודל ופעולות נכנסים, אלמנט יוצא. המצב ב-responsa-biography-flow.js.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button } = root.ResponsaUi;
  const t = (text, vars) => I18n.t(text, vars);

  /** פסקאות לפי שורות חדשות, כל אחת פסקה: `textContent` בלבד, בלי HTML. */
  function paragraphs(text) {
    return text
      .split(/\n+/)
      .filter((line) => line.trim())
      .map((line) => el('p', { class: 'biography-text', dir: 'auto' }, line));
  }

  /**
   * הפוקוס עובר לכאן כשהכפתור "ביוגרפיה" נעלם (responsa-app.js): בלי זה הוא נופל
   * ל-body, וקורא מסך מתחיל מראש הדף.
   */
  const anchor = (book) => ({ tabindex: '-1', dataset: { focusKey: 'biography-body-' + book.key } });

  function body(book, state, actions) {
    if (state.loading) {
      return el(
        'p',
        { class: 'biography-status', role: 'status', ...anchor(book) },
        el('span', { class: 'spinner', 'aria-hidden': 'true' }),
        t('קורא את הביוגרפיה מבר אילן. בפעם הראשונה זה לוקח כדקה, כי בר אילן נפתחת ברקע.'),
      );
    }
    if (state.error) {
      return [
        el('p', { class: 'biography-status is-error', role: 'alert', ...anchor(book) }, state.error.message || t('קריאת הביוגרפיה נכשלה.')),
        button('text', t('ניסיון חוזר'), () => actions.showBiography(book), { key: 'biography-retry-' + book.key }),
      ];
    }
    const result = state.result;
    if (!result) return null;
    if (!result.found) {
      return [
        el('p', { class: 'biography-status', role: 'status', ...anchor(book) }, t('אין בבר אילן ביוגרפיה לספר הזה.')),
        button('text', t('סגירה'), actions.closeBiography, { key: 'biography-close-' + book.key }),
      ];
    }
    return [
      el('h4', { class: 'biography-heading', ...anchor(book) }, el('bdi', {}, result.heading || result.entry || book.title)),
      paragraphs(String(result.text || '')),
      button('text', t('סגירה'), actions.closeBiography, { key: 'biography-close-' + book.key }),
    ];
  }

  /**
   * הכפתור והמאמר של [book]; `null` כשהשירות שבמחשב אינו מכיר ביוגרפיות, או
   * כשהמשתמש כיבה אותן בהגדרות. הכפתור מוחלף בסטטוס או במאמר, ובהם "סגירה"
   * או "ניסיון חוזר".
   */
  function biographyView(book, model, actions) {
    if (model.settings && model.settings.biography === false) return null;
    if (!Domain.serviceCan(model.health, 'biography')) return null;
    const state = model.biography;
    const mine = state.key === book.key;
    const shown = mine && (state.loading || state.error || state.result);
    return el(
      'section',
      { class: 'biography', 'aria-label': t('ביוגרפיה') },
      shown
        ? null
        : button('tonal', t('ביוגרפיה'), () => actions.showBiography(book), {
            icon: 'book_information_24_regular',
            key: 'biography-' + book.key,
            // בר אילן עסוקה בקריאת הרשימה, או בקריאה אחרת.
            disabled: model.buildActive || state.loading,
          }),
      mine ? body(book, state, actions) : null,
    );
  }

  const api = { biographyView };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaBiographyUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
