// לשונית "איתור מקום": כותבים שם ספר ומקום בו ("בראשית ב ג"), ובר אילן נפתח
// ישר במקום הזה. כשבר אילן מוצא כמה מקורות (למשל החומש ומפרשיו), הם מוצגים
// לבחירה. כמו responsa-panels.js: מודל ופעולות נכנסים, אלמנט יוצא.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Locate = root.ResponsaLocate;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button } = root.ResponsaUi;
  const t = (text, vars) => I18n.t(text, vars);

  function field(state, actions) {
    const input = el('input', {
      class: 'search-input locate-input',
      type: 'search',
      dir: 'rtl',
      placeholder: t('שם ספר ומקום, למשל: בראשית ב ג'),
      'aria-label': t('שם ספר ומקום בו'),
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: String(Locate.MAX_LENGTH),
      dataset: { focusKey: 'locate-input' },
    });
    input.value = state.text;
    input.addEventListener('input', () => actions.locateText(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') actions.runLocate();
    });
    return el(
      'div',
      { class: 'locate-row' },
      el('label', { class: 'search-bar' }, icon('document_search_24_regular'), input),
      button('filled', t('פתיחה בבר אילן'), actions.runLocate, {
        icon: 'open_24_regular',
        key: 'locate-run',
        busy: state.running && state.openingIndex === null,
        busyLabel: t('מחפש…'),
        disabled: state.running,
      }),
    );
  }

  /** [onPick] — דוגמה ממלאת את השדה, ומקום אחרון נפתח מיד. */
  function chips(title, values, onPick, keyPrefix, running) {
    if (!values.length) return null;
    return el(
      'div',
      { class: 'locate-chips' },
      el('span', { class: 'locate-chips-title' }, title),
      el(
        'ul',
        { class: 'chip-list' },
        values.map((value) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                type: 'button',
                class: 'chip',
                dir: 'rtl',
                disabled: running,
                onclick: () => onPick(value),
                dataset: { focusKey: keyPrefix + value },
              },
              value,
            ),
          ),
        ),
      ),
    );
  }

  /** המקורות שבר אילן מצא, לבחירה. */
  function choicesView(state, actions) {
    if (!state.choices) return null;
    return el(
      'section',
      { class: 'locate-choices', 'aria-labelledby': 'locate-choices-title' },
      el(
        'h3',
        { class: 'advanced-heading', id: 'locate-choices-title' },
        t('נמצאו {count} מקורות עבור "{ref}". בוחרים את המקור לפתיחה:', {
          count: Domain.formatCount(state.choices.length),
          ref: state.ref,
        }),
      ),
      el(
        'ol',
        { class: 'choice-list' },
        state.choices.map((choice, index) =>
          el(
            'li',
            {},
            el(
              'button',
              {
                type: 'button',
                class: 'choice-row',
                dir: 'rtl',
                disabled: state.running,
                'aria-busy': state.openingIndex === index ? 'true' : null,
                onclick: () => actions.openLocateChoice(index),
                dataset: { focusKey: 'locate-choice-' + index },
              },
              state.openingIndex === index
                ? el('span', { class: 'spinner', 'aria-hidden': 'true' })
                : icon('book_open_24_regular'),
              el('span', { class: 'choice-text' }, choice),
            ),
          ),
        ),
      ),
    );
  }

  function statusLine(state) {
    const status = state.status;
    return el(
      'p',
      {
        class: 'advanced-status' + (status && status.kind === 'error' ? ' is-error' : ''),
        role: 'status',
        'data-role': 'locate-status',
        hidden: !status,
      },
      status ? status.text : '',
    );
  }

  function locatePage(model, actions) {
    const state = model.locate;
    const supported = Domain.serviceCan(model.health, 'locate');
    const body = supported
      ? [
          field(state, actions),
          statusLine(state),
          choicesView(state, actions),
          chips(t('אחרונים:'), state.history, actions.locateRecent, 'locate-recent-', state.running),
          chips(t('דוגמאות:'), Locate.EXAMPLES, actions.locateExample, 'locate-example-', state.running),
          el(
            'details',
            { class: 'faq-item' },
            el('summary', { class: 'faq-question' }, t('איך כותבים מקום')),
            el(
              'div',
              { class: 'faq-answer' },
              el(
                'ul',
                { class: 'help-steps' },
                el('li', {}, t('שם הספר כמו בבר אילן, בכתיב מלא, ואחריו המקום: "בראשית ב ג", "ברכות דף ב עמוד א".')),
                el('li', {}, t('אפשר לכתוב גם את שם היחידה: "פרק", "דף", "סימן", "סעיף", "הלכה".')),
                el('li', {}, t('כשבר אילן מוצא כמה מקורות, למשל החומש ומפרשיו, בוחרים מהרשימה.')),
                el('li', {}, t('מהרשימה בלשונית "ספרים": "פתיחה במקום מסוים" ממלא כאן את שם הספר.')),
              ),
            ),
          ),
        ]
      : el(
          'div',
          { class: 'notice' },
          icon('warning_24_regular'),
          el(
            'p',
            { class: 'notice-text' },
            t('שירות בר אילן שבמחשב ישן ואינו מכיר את איתור המקום. כדאי להוריד את הגרסה החדשה.'),
          ),
          button('tonal', t('הורדת הגרסה החדשה'), actions.download, { key: 'locate-download' }),
        );
    return el(
      'div',
      { class: 'locate-page' },
      el(
        'header',
        { class: 'page-header' },
        el('h2', { class: 'page-title', id: 'locate-title' }, t('איתור מקום')),
        el('p', { class: 'page-lead' }, t('כותבים שם ספר ומקום בו, ובר אילן נפתח ישר במקום הזה.')),
      ),
      body,
    );
  }

  const api = { locatePage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaLocateUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
