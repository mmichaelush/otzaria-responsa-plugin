// לשונית "חיפוש בטקסט", עם כל האפשרויות של חלונות החיפוש של בר אילן:
// - חיפוש רגיל ("חיפוש קל"): שדה אחד, ואיך לחפש את המילים — כמו בבר אילן,
//   בדיוק כפי שנכתבו, או עם תוספות;
// - חיפוש מתקדם ("חיפוש מתקדם" ו"חיפוש טבלאי"): מילה או ביטוי בכל שדה,
//   חלופות, צורות, מרחקים, ואיפה המילים צריכות להופיע (משפט, פסקה, מסמך);
// - ניסוח חופשי: שאלה או משפט.
// לכל אופן הסבר קצר ודוגמאות שנטענות בלחיצה, ובכולם מוסבר במילים מה יחופש.
// כמו responsa-panels.js: מודל ופעולות נכנסים, אלמנט יוצא, וטקסט רק דרך
// textContent.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Advanced = root.ResponsaAdvanced;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button, iconButton, onEnter } = root.ResponsaUi;
  const { segmented, choices, switchRow } = root.ResponsaPanels;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /** כותרת של שלב: מספר, שם והסבר קצר. */
  function heading(title, subtitle, step) {
    return [
      el(
        'h3',
        { class: 'advanced-heading' },
        step ? el('span', { class: 'step-number', 'aria-hidden': 'true' }, String(step)) : null,
        title,
      ),
      subtitle ? el('p', { class: 'advanced-subheading' }, subtitle) : null,
    ];
  }

  /** שדה מספר קטן (מרחק, טווח), עם תווית לפניו ואחריו. */
  function numberField(label, value, onChange, key, unit) {
    const input = el('input', {
      class: 'number-input',
      type: 'number',
      min: '1',
      max: String(Advanced.MAX_DISTANCE),
      inputmode: 'numeric',
      'aria-label': label + ' (' + unit + ')',
      dataset: { focusKey: key },
    });
    input.value = String(value);
    input.addEventListener('change', () => onChange(input.value));
    return el(
      'label',
      { class: 'field field-inline' },
      el('span', { class: 'field-label' }, label),
      input,
      el('span', { class: 'field-label' }, unit),
    );
  }

  function select(label, options, value, onChange, key) {
    const node = el('select', { class: 'select', 'aria-label': label, dataset: { focusKey: key } });
    for (const option of options) {
      if (option.group) {
        node.appendChild(
          el(
            'optgroup',
            { label: option.group },
            option.options.map((item) => el('option', { value: item.value, selected: item.value === value }, item.label)),
          ),
        );
      } else {
        node.appendChild(el('option', { value: option.value, selected: option.value === value }, option.label));
      }
    }
    node.addEventListener('change', () => onChange(node.value));
    return node;
  }

  /** הצורות לפי הקבוצות שלהן, כמו המאפיינים בחלון של בר אילן. */
  function formOptions() {
    const groups = [];
    for (const form of Advanced.FORMS) {
      let group = groups.find((entry) => entry.key === form.group);
      if (!group) {
        group = { key: form.group, group: t(form.group), options: [] };
        groups.push(group);
      }
      group.options.push({ value: form.id, label: t(form.label) });
    }
    return groups;
  }

  function checkbox(label, checked, onToggle, key, hint) {
    const input = el('input', {
      class: 'checkbox',
      type: 'checkbox',
      checked,
      dataset: { focusKey: key },
    });
    input.addEventListener('change', () => onToggle(input.checked));
    return el(
      'label',
      { class: 'checkbox-row' },
      input,
      el(
        'span',
        { class: 'checkbox-texts' },
        el('span', { class: 'checkbox-label' }, label),
        hint ? el('span', { class: 'checkbox-hint' }, hint) : null,
      ),
    );
  }

  // ------------------------------------------------------ מילים

  function wordInput(state, actions, index, alternative, value) {
    const term = index + 1;
    const input = el('input', {
      class: 'term-input',
      type: 'text',
      dir: 'rtl',
      placeholder: alternative ? t('מילה או ביטוי חלופי') : t('מילה או ביטוי'),
      'aria-label': alternative
        ? t('מילה {n}, חלופה {k}', { n: term, k: alternative + 1 })
        : t('מילה {n}', { n: term }),
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: String(Advanced.MAX_WORD_LENGTH),
      dataset: { focusKey: 'adv-word-' + index + '-' + alternative },
    });
    input.value = value;
    input.addEventListener('input', () => actions.advancedWord(index, alternative, input.value));
    onEnter(input, () => actions.runAdvanced());
    return input;
  }

  function termCard(state, actions, term, index) {
    const query = state.query;
    const invalid = state.problem && state.problem.term === index;
    const words = term.words.map((word, alternative) => [
      alternative ? el('span', { class: 'term-or' }, t('או')) : null,
      el(
        'span',
        { class: 'term-word' },
        wordInput(state, actions, index, alternative, word),
        term.words.length > 1
          ? iconButton(
              'dismiss_24_regular',
              t('הסרת "{word}"', { word: word || t('מילה חלופית') }),
              () => actions.advancedRemoveAlternative(index, alternative),
              { key: 'adv-remove-alt-' + index + '-' + alternative, className: 'term-word-remove' },
            )
          : null,
      ),
    ]);
    const single = (Advanced.FORM_BY_ID[term.form] || {}).single;
    return el(
      'li',
      { class: 'term-card' + (invalid ? ' is-error' : '') + (term.exclude ? ' is-excluded' : '') },
      el(
        'div',
        { class: 'term-header' },
        el('span', { class: 'term-number' }, term.exclude ? t('בלי המילה') : t('מילה {n}', { n: index + 1 })),
        query.terms.length > 1
          ? iconButton('delete_24_regular', t('הסרת מילה {n}', { n: index + 1 }), () => actions.advancedRemoveTerm(index), {
              key: 'adv-remove-' + index,
            })
          : null,
      ),
      el(
        'div',
        { class: 'term-words' },
        words,
        !single && term.words.length < Advanced.MAX_ALTERNATIVES
          ? button('text', t('או מילה אחרת'), () => actions.advancedAddAlternative(index), {
              icon: 'add_24_regular',
              key: 'adv-alt-' + index,
            })
          : null,
      ),
      el(
        'div',
        { class: 'term-options' },
        el(
          'label',
          { class: 'field' },
          el('span', { class: 'field-label' }, t('איך לחפש את המילה')),
          select(t('איך לחפש את המילה'), formOptions(), term.form, (form) => actions.advancedTerm(index, { form }), 'adv-form-' + index),
        ),
        checkbox(
          t('בלי המילה הזו'),
          term.exclude,
          (exclude) => actions.advancedTerm(index, { exclude }),
          'adv-exclude-' + index,
          t('מקורות שבהם היא מופיעה לא יוצגו'),
        ),
      ),
    );
  }

  function gapRow(actions, gap, index) {
    const kinds = [
      { value: 'adjacent', label: t('מיד אחריה') },
      { value: 'after', label: t('עד כמה מילים אחריה') },
      { value: 'around', label: t('עד כמה מילים לפניה או אחריה') },
    ];
    return el(
      'li',
      { class: 'gap-row' },
      el(
        'label',
        { class: 'field field-inline' },
        el('span', { class: 'field-label' }, t('המילה הבאה:')),
        select(t('המרחק עד המילה הבאה'), kinds, gap.kind, (kind) => actions.advancedGap(index, { kind }), 'adv-gap-' + index),
      ),
      gap.kind === 'adjacent'
        ? null
        : numberField(t('עד'), gap.distance, (distance) => actions.advancedGap(index, { distance }), 'adv-gap-distance-' + index, t('מילים')),
    );
  }

  /**
   * איפה המילים צריכות להופיע זו ביחס לזו, כמו "מרחקים" בחיפוש הטבלאי של בר
   * אילן. בסדר שבשדות — המרחקים שביניהם; בכל אחד מהטווחים — בכל סדר.
   */
  function spanSection(state, actions) {
    const query = state.query;
    const Span = Advanced.Span;
    const options = [
      { value: Span.chain, label: t('בסדר שכתבתי'), hint: t('ובין מילה למילה — המרחק שבחרתם (צמודות, או עד כמה מילים)') },
      { value: Span.words, label: t('בכל סדר, קרובות זו לזו'), hint: t('כל המילים, בטווח של מספר מילים שבוחרים') },
      { value: Span.sentence, label: t('באותו משפט'), hint: t('בכל סדר ובכל מרחק, אבל באותו משפט') },
      { value: Span.paragraph, label: t('באותה פסקה'), hint: t('הלכה, סעיף או דיבור המתחיל') },
      { value: Span.document, label: t('באותו מסמך'), hint: t('פרק, סימן או תשובה') },
    ];
    return el(
      'div',
      { class: 'advanced-span' },
      el('p', { class: 'advanced-subheading' }, t('איפה המילים צריכות להופיע:')),
      choices(t('איפה המילים צריכות להופיע'), options, query.span, (span) => actions.advancedSet({ span }), 'adv-span-'),
      query.span === Span.words
        ? el(
            'div',
            { class: 'settings-row advanced-within' },
            numberField(t('כל המילים בטווח של עד'), query.within, (within) => actions.advancedSet({ within }), 'adv-within', t('מילים')),
          )
        : null,
    );
  }

  function builder(state, actions) {
    const query = state.query;
    const chain = query.span === Advanced.Span.chain;
    const items = [];
    query.terms.forEach((term, index) => {
      if (index > 0 && chain) items.push(gapRow(actions, query.gaps[index - 1], index - 1));
      items.push(termCard(state, actions, term, index));
    });
    return [
      examples(Advanced.EXAMPLES, actions, 4),
      el('ol', { class: 'term-list' }, items),
      el(
        'div',
        { class: 'builder-actions' },
        button('tonal', t('הוספת מילה'), actions.advancedAddTerm, {
          icon: 'add_24_regular',
          key: 'adv-add-term',
          disabled: query.terms.length >= Advanced.MAX_TERMS,
        }),
        button('text', t('כתיבה בתחביר של בר אילן'), () => actions.advancedMode(Advanced.Mode.manual), {
          icon: 'code_24_regular',
          key: 'adv-to-manual',
        }),
      ),
      query.terms.length > 1 ? spanSection(state, actions) : null,
    ];
  }

  /**
   * "נסו:" ואחריו דוגמאות שנטענות בלחיצה. מעבר ל-[shown] — מאחורי "עוד
   * דוגמאות", כדי שבחלון צר הן לא ידחקו את השדות למטה.
   */
  function examples(list, actions, shown) {
    const chip = (example) =>
      el(
        'li',
        {},
        button('outlined', t(example.label), () => actions.advancedExample(example.id), {
          key: 'adv-example-' + example.id,
        }),
      );
    const visible = list.slice(0, shown || list.length);
    const more = list.slice(visible.length);
    return el(
      'div',
      { class: 'example-chips' },
      el('span', { class: 'example-chips-label' }, t('נסו:')),
      el('ul', { class: 'example-chips-list' }, visible.map(chip)),
      more.length
        ? el(
            'details',
            { class: 'example-more' },
            el('summary', { class: 'example-more-toggle' }, t('עוד {count} דוגמאות', { count: more.length })),
            el('ul', { class: 'example-chips-list' }, more.map(chip)),
          )
        : null,
    );
  }

  function manualEditor(state, actions) {
    const input = el('textarea', {
      class: 'manual-input',
      dir: 'rtl',
      rows: '3',
      maxlength: String(Advanced.MAX_QUERY_LENGTH),
      placeholder: t('למשל: נר [1:4] שבת'),
      'aria-label': t('השאילתה בתחביר של בר אילן'),
      spellcheck: 'false',
      dataset: { focusKey: 'adv-manual' },
    });
    input.value = state.query.manualText;
    input.addEventListener('input', () => actions.advancedSet({ manualText: input.value }, { light: true }));
    return [
      input,
      el('p', { class: 'advanced-hint' }, t('הסימנים מוסברים למטה, ב"סימני החיפוש של בר אילן".')),
      button('text', t('חזרה לבונה החיפוש'), () => actions.advancedMode(Advanced.Mode.builder), {
        icon: 'arrow_right_24_regular',
        key: 'adv-to-builder',
      }),
    ];
  }

  /**
   * איך "חיפוש קל" של בר אילן יחפש את המילים: כמו שהמשתמש הגדיר בבר אילן,
   * "ללא תוספות", או "עם תוספות" — ואילו. ההגדרות שבבר אילן חוזרות למצבן
   * אחרי החיפוש.
   */
  function easySection(state, actions) {
    const easy = state.query.easy;
    const Easy = Advanced.Easy;
    const set = (patch) => actions.advancedSet({ easy: { ...easy, ...patch } });
    const options = [
      { value: Easy.mine, label: t('כמו שהגדרתי בבר אילן'), hint: t('לפי מה שסימנתם בחלון "חיפוש קל" של בר אילן') },
      { value: Easy.exact, label: t('בדיוק כפי שנכתבו'), hint: t('המילים צמודות, בלי אותיות נוספות') },
      { value: Easy.additions, label: t('עם תוספות'), hint: t('בוחרים מה עוד יימצא') },
    ];
    return el(
      'div',
      { class: 'advanced-easy' },
      el('p', { class: 'advanced-subheading' }, t('איך לחפש את המילים:')),
      choices(t('איך לחפש את המילים'), options, easy.how, (how) => set({ how }), 'adv-easy-'),
      easy.how === Easy.additions
        ? el(
            'div',
            { class: 'settings-card advanced-card easy-additions' },
            checkbox(
              t('אותיות שימוש לפני המילה הראשונה'),
              easy.prefixes,
              (prefixes) => set({ prefixes }),
              'adv-easy-prefixes',
              t('ו, ה, ב, כ, ל, מ, ש: "נר חנוכה" ימצא גם "בנר חנוכה"'),
            ),
            checkbox(
              t('עד שתי מילים בין המילים'),
              easy.distance,
              (distance) => set({ distance }),
              'adv-easy-distance',
              t('"נר חנוכה" ימצא גם "נר ראשון של חנוכה"'),
            ),
            checkbox(
              t('כתיב מלא או חסר'),
              easy.spelling,
              (spelling) => set({ spelling }),
              'adv-easy-spelling',
              t('"חנוכה" ימצא גם "חנכה"'),
            ),
          )
        : null,
    );
  }

  /** חיפוש רגיל: שדה אחד, כמו בחלון החיפוש של בר אילן. */
  function simpleEditor(state, actions, easy) {
    const input = el('input', {
      class: 'search-input simple-input',
      type: 'search',
      dir: 'rtl',
      placeholder: t('מילים לחיפוש, למשל: נר שבת'),
      'aria-label': t('מילים לחיפוש בבר אילן'),
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: String(Advanced.MAX_QUERY_LENGTH),
      dataset: { focusKey: 'adv-simple' },
    });
    input.value = state.query.simpleText;
    input.addEventListener('input', () => actions.advancedSet({ simpleText: input.value }, { light: true }));
    onEnter(input, () => actions.runAdvanced());
    return [
      el('label', { class: 'search-bar' }, icon('search_24_regular'), input),
      easy
        ? null
        : el(
            'p',
            { class: 'advanced-hint' },
            t('המילים יחופשו צמודות, בסדר שנכתבו. לחיפוש מילים רחוקות, צורות אחרות של מילה או מילים חלופיות — "חיפוש מתקדם".'),
          ),
      examples(Advanced.SIMPLE_EXAMPLES, actions),
      easy && easy.options ? easySection(state, actions) : null,
    ];
  }

  /** ניסוח חופשי: שאלה או משפט, ל"חיפוש בניסוח חופשי" של בר אילן. */
  function freeEditor(state, actions) {
    const input = el('textarea', {
      class: 'manual-input',
      dir: 'rtl',
      rows: '2',
      maxlength: String(Advanced.MAX_QUERY_LENGTH),
      placeholder: t('למשל: האם מותר לנסוע באופניים בשבת'),
      'aria-label': t('שאלה או משפט לחיפוש בבר אילן'),
      spellcheck: 'false',
      dataset: { focusKey: 'adv-free' },
    });
    input.value = state.query.freeText;
    input.addEventListener('input', () => actions.advancedSet({ freeText: input.value }, { light: true }));
    onEnter(input, () => actions.runAdvanced());
    return [input, examples(Advanced.FREE_EXAMPLES, actions)];
  }

  /** מה כל סוג חיפוש עושה, ומתי הוא מתאים. */
  const MODE_INTROS = Object.freeze({
    simple: [
      'search_24_regular',
      N('הכי פשוט: כותבים מילים, ובר אילן מחפש אותן כמו ב"חיפוש קל" שלו. מתאים לרוב החיפושים — ביטוי, שם, או כמה מילים שמופיעות יחד.'),
    ],
    builder: [
      'apps_list_24_regular',
      N('כשצריך לדייק: לכל מילה בוחרים צורות (עם אותיות שימוש, כתיב מלא או חסר, כל השורש), מוסיפים מילים חלופיות, וקובעים איפה המילים צריכות להופיע — צמודות, קרובות, או באותו משפט, פסקה או מסמך.'),
    ],
    free: [
      'text_quote_24_regular',
      N('כשלא יודעים באילו מילים המקור משתמש: כותבים שאלה או נושא במילים שלכם, ובר אילן מחפש מקורות שעוסקים בזה. המקורות הרלוונטיים בדרך כלל בראש הרשימה.'),
    ],
  });

  function modeIntro(mode) {
    const [iconName, text] = MODE_INTROS[mode === Advanced.Mode.manual ? 'builder' : mode];
    return el('p', { class: 'mode-intro' }, icon(iconName, 'mode-intro-icon'), el('span', {}, t(text)));
  }

  function wordsSection(state, actions, easy) {
    const query = state.query;
    const Mode = Advanced.Mode;
    return el(
      'section',
      { class: 'advanced-section' },
      heading(
        t('מה לחפש'),
        query.mode === Mode.builder
          ? t('מילה או ביטוי בכל שדה. לכל מילה בוחרים איך לחפש אותה, ואפשר להוסיף לה מילים חלופיות ("או").')
          : null,
        query.mode === Mode.simple || query.mode === Mode.free ? null : 1,
      ),
      query.mode === Mode.simple
        ? simpleEditor(state, actions, easy)
        : query.mode === Mode.free
          ? freeEditor(state, actions)
          : query.mode === Mode.manual
            ? manualEditor(state, actions)
            : builder(state, actions),
    );
  }

  // ------------------------------------------------------ תחום

  function scopeChips(state, actions) {
    const items = state.query.scope.items;
    if (!items.length) return el('p', { class: 'advanced-hint' }, t('עוד לא נבחר דבר. בוחרים ברשימה שלמטה.'));
    return el(
      'ul',
      { class: 'scope-chips', 'aria-label': t('נבחרו לחיפוש') },
      items.map((item) =>
        el(
          'li',
          { class: 'scope-chip' },
          icon(item.type === 'category' ? 'folder_24_regular' : 'book_24_regular'),
          el('span', { class: 'scope-chip-name', title: (item.path || '').replace(/\//g, ', ') }, item.name),
          iconButton('dismiss_24_regular', t('הסרת "{name}" מהחיפוש', { name: item.name }), () => actions.advancedToggleScope(item), {
            key: 'adv-chip-' + (item.key || item.path),
          }),
        ),
      ),
    );
  }

  function pickerRow(state, actions, item, label, count, onOpen) {
    const included = Advanced.scopeIncludes(state.query, item);
    const direct = state.query.scope.items.some(
      (existing) => existing.type === item.type && (item.type === 'book' ? existing.key === item.key : existing.path === item.path),
    );
    const input = el('input', {
      class: 'checkbox',
      type: 'checkbox',
      checked: included,
      // נבחר דרך קטגוריה שמעליו: מבטלים שם, לא כאן.
      disabled: included && !direct,
      'aria-label': label,
      dataset: { focusKey: 'adv-pick-' + (item.key || item.path) },
    });
    input.addEventListener('change', () => actions.advancedToggleScope(item));
    return el(
      'li',
      { class: 'picker-row' },
      input,
      icon(item.type === 'category' ? 'folder_24_regular' : 'book_24_regular', 'picker-row-icon'),
      el('span', { class: 'picker-row-name' }, label),
      count === null ? null : el('span', { class: 'picker-row-count' }, Domain.formatCount(count)),
      onOpen
        ? iconButton('chevron_left_24_regular', t('פתיחת "{name}"', { name: label }), onOpen, {
            key: 'adv-open-' + item.path,
            className: 'picker-row-open',
          })
        : null,
    );
  }

  function picker(state, actions) {
    const view = state.picker;
    const crumbs = Domain.breadcrumbs(view.path);
    const level = view.level;
    let body;
    if (view.error) {
      body = el(
        'div',
        { class: 'picker-message' },
        el('p', {}, view.error),
        button('text', t('ניסיון נוסף'), () => actions.advancedBrowse(view.path), { key: 'adv-picker-retry' }),
      );
    } else if (!level || view.loading) {
      body = el('div', { class: 'picker-message' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), t('טוען…'));
    } else {
      body = el(
        'ul',
        { class: 'picker-list' },
        level.categories.map((category) =>
          pickerRow(
            state,
            actions,
            { type: 'category', path: category.path, name: category.name },
            category.name,
            category.bookCount,
            () => actions.advancedBrowse(category.path),
          ),
        ),
        level.books.map((book) =>
          pickerRow(
            state,
            actions,
            { type: 'book', key: book.key, name: book.title, path: book.contextPath || '' },
            book.title,
            null,
            null,
          ),
        ),
      );
    }
    return el(
      'div',
      { class: 'scope-picker' },
      el(
        'nav',
        { class: 'breadcrumbs', 'aria-label': t('מיקום ברשימה') },
        el(
          'ol',
          {},
          crumbs.map((crumb, i) =>
            el(
              'li',
              {},
              i ? el('span', { class: 'breadcrumb-separator', 'aria-hidden': 'true' }, '‹') : null,
              el(
                'button',
                {
                  type: 'button',
                  class: 'breadcrumb',
                  'aria-current': i === crumbs.length - 1 ? 'location' : null,
                  onclick: () => actions.advancedBrowse(crumb.path),
                  dataset: { focusKey: 'adv-crumb-' + crumb.path },
                },
                crumb.name,
              ),
            ),
          ),
        ),
      ),
      body,
    );
  }

  function scopeSection(state, actions, step, catalogReady) {
    const scope = state.query.scope;
    const hints = {
      [Advanced.Scope.all]: t('כמו "חיפוש בכל המאגרים" בבר אילן.'),
      [Advanced.Scope.current]: t('הספרים שכבר נבחרו בבר אילן, ב"המאגרים המשתתפים".'),
      [Advanced.Scope.pick]: t('הבחירה נשמרת גם בבר אילן, ותקפה גם לחיפושים הבאים בו.'),
    };
    // בחירת קטגוריות נשענת על רשימת הספרים; בלעדיה רק כל הספרים או הבחירה
    // שכבר בבר אילן.
    const modes = [
      { value: Advanced.Scope.all, label: t('כל הספרים') },
      catalogReady ? { value: Advanced.Scope.pick, label: t('קטגוריות וספרים שאבחר') } : null,
      { value: Advanced.Scope.current, label: t('הבחירה שבבר אילן') },
    ].filter(Boolean);
    const mode = Advanced.withAvailableScope(state.query, catalogReady).scope.mode;
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('איפה לחפש'), null, step),
      segmented(t('איפה לחפש'), modes, mode, (value) => actions.advancedScopeMode(value), 'adv-scope-'),
      el('p', { class: 'advanced-hint' }, hints[mode]),
      mode === Advanced.Scope.pick ? [scopeChips(state, actions), picker(state, actions)] : null,
    );
  }

  // ------------------------------------------------------ אפשרויות ותצוגה

  function optionsSection(state, actions, step) {
    const options = state.query.options;
    const simple = state.query.mode === Advanced.Mode.simple;
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('אפשרויות'), null, step),
      el(
        'div',
        { class: 'settings-card advanced-card' },
        switchRow({
          iconName: 'text_quote_24_regular',
          title: t('כולל ראשי תיבות'),
          subtitle: t('למשל "צער בעלי חיים" ימצא גם "צעב"ח"'),
          checked: options.abbreviations,
          onToggle: (abbreviations) => actions.advancedSet({ options: { ...options, abbreviations } }),
          key: 'adv-abbreviations',
        }),
        simple
          ? null
          : switchRow({
              iconName: 'document_bullet_list_24_regular',
              title: t('לבחור צורות לפני התוצאות'),
              subtitle: t('בר אילן יפתח את "ניהול הצורות", ושם בוחרים אילו צורות של המילים ייכללו'),
              checked: options.showForms,
              onToggle: (showForms) => actions.advancedSet({ options: { ...options, showForms } }),
              key: 'adv-forms',
            }),
      ),
    );
  }

  /** "רק ב: שו"ת, רמב"ם" — המקום, במשפט ההסבר. */
  function scopeLabel(query, catalogReady) {
    const scope = query.scope;
    if (scope.mode === Advanced.Scope.current) return t('בספרים שכבר נבחרו בבר אילן.');
    if (scope.mode === Advanced.Scope.pick && catalogReady && scope.items.length) {
      const names = scope.items.slice(0, 3).map((item) => item.name);
      const more = scope.items.length - names.length;
      return more > 0
        ? t('רק ב: {names}, ועוד {count}.', { names: names.join(', '), count: more })
        : t('רק ב: {names}.', { names: names.join(', ') });
    }
    return t('בכל הספרים.');
  }

  /**
   * "מה יחופש": ההסבר במילים, לפני הכול. מי שמכיר את התחביר רואה גם את
   * השאילתה כפי שתישלח.
   */
  /** שורות "מה יחופש". גם לעדכון במקום בזמן הקלדה (`View.updateAdvanced`). */
  function summaryLines(model) {
    const query = model.advanced.query;
    const text = Advanced.buildQuery(query);
    const lines = text
      ? Advanced.describe(query, scopeLabel(query, Domain.catalogReady(model.status)), {
          easy: Domain.serviceCan(model.health, 'easySearch'),
          easyOptions: Domain.serviceCan(model.health, 'easyOptions'),
        })
      : [];
    return el(
      'div',
      { class: 'summary-lines', 'data-role': 'adv-summary' },
      lines.length
        ? lines.map((line) => el('p', { class: 'summary-line' }, line))
        : el(
            'p',
            { class: 'summary-line is-empty' },
            query.mode === Advanced.Mode.free
              ? t('כותבים שאלה או משפט, וכאן יוסבר מה יחופש.')
              : t('כותבים מילים, וכאן יוסבר מה יחופש.'),
          ),
    );
  }

  function summaryCard(model, actions) {
    const state = model.advanced;
    const query = state.query;
    const text = Advanced.buildQuery(query);
    // ניסוח חופשי אינו שאילתה בתחביר של בר אילן.
    const advanced = query.mode === Advanced.Mode.builder || query.mode === Advanced.Mode.manual;
    return el(
      'section',
      // לא אזור חי: הוא משתנה בכל הקשה, וקורא מסך היה חוזר עליו שוב ושוב.
      { class: 'summary-card' },
      el('h3', { class: 'summary-title' }, icon('info_24_regular'), t('מה יחופש')),
      summaryLines(model),
      advanced
        ? el(
            'div',
            { class: 'query-preview' },
            el('span', { class: 'query-label' }, t('בתחביר של בר אילן:')),
            el(
              'code',
              { class: 'query-text' + (text ? '' : ' is-empty'), dir: 'rtl', 'data-role': 'adv-preview' },
              text ? Advanced.displayQuery(text) : t('השאילתה תופיע כאן'),
            ),
            iconButton('copy_24_regular', t('העתקת השאילתה'), actions.copyAdvancedQuery, { key: 'adv-copy' }),
          )
        : null,
      el(
        'p',
        // מוכרז דרך האזור הקבוע (`announce`) ברגע הבדיקה, פעם אחת.
        { class: 'advanced-error', 'data-role': 'adv-problem', hidden: !state.problem },
        state.problem ? state.problem.message : '',
      ),
    );
  }

  function guideSection(actions) {
    return el(
      'details',
      { class: 'faq-item advanced-guide' },
      el('summary', { class: 'faq-question' }, t('סימני החיפוש של בר אילן ודוגמאות')),
      el(
        'div',
        { class: 'faq-answer' },
        el(
          'dl',
          { class: 'syntax-list' },
          Advanced.SYNTAX.map((row) => [
            el('dt', { dir: 'rtl' }, el('code', {}, Advanced.displayQuery(row.sign))),
            el('dd', {}, t(row.meaning)),
          ]),
        ),
        el(
          'p',
          { class: 'advanced-subheading' },
          t('בבר אילן עצמו נשארו: חיפוש לפי ניקוד (בחיפוש הטבלאי, "ניקוד..."), ועריכת משפחות, חיפושים שמורים ושאילתות קודמות. משפחה וחיפוש שמור שהגדרתם שם אפשר לחפש מכאן ("איך לחפש את המילה").'),
        ),
      ),
    );
  }

  /** [blocked] — השירות אינו מכיר את האופן שנבחר, ואין מה להריץ. */
  function footer(model, state, actions, blocked) {
    const status = state.status;
    return el(
      'footer',
      { class: 'advanced-footer' },
      el(
        'p',
        {
          class: 'advanced-status' + (status && status.kind === 'error' ? ' is-error' : ''),
          role: 'status',
          'data-role': 'adv-status',
          hidden: !status,
        },
        status ? status.text : '',
      ),
      el(
        'div',
        { class: 'advanced-actions' },
        button('text', t('ניקוי'), actions.advancedClear, { key: 'adv-clear', disabled: state.running }),
        button('filled', t('חיפוש בבר אילן'), actions.runAdvanced, {
          icon: 'search_24_regular',
          key: 'adv-run',
          busy: state.running,
          busyLabel: t('מחפש…'),
          disabled: blocked,
        }),
      ),
    );
  }

  /** הלשונית "חיפוש בטקסט". [catalogReady] — יש רשימת ספרים לבחירת קטגוריות. */
  function textSearchPage(model, actions) {
    const state = model.advanced;
    const Mode = Advanced.Mode;
    const supported = Domain.serviceCan(model.health, 'advancedSearch');
    const catalogReady = Domain.catalogReady(model.status);
    const mode = state.query.mode;
    const advanced = mode === Mode.builder || mode === Mode.manual;
    // חיפוש רגיל ב"חיפוש קל": אין בו ראשי תיבות. `options` — השירות מקבל את
    // ההגדרות שלו מכאן (0.6.0); בלעדיו — מה שהמשתמש בחר בבר אילן.
    const easy =
      mode === Mode.simple && Domain.serviceCan(model.health, 'easySearch')
        ? { options: Domain.serviceCan(model.health, 'easyOptions') }
        : null;
    // הסגמנט נשאר גלוי גם מול שירות ישן; רק בחירה בו מסבירה שצריך לעדכן.
    const note = Advanced.serviceNote(state.query, (name) => Domain.serviceCan(model.health, name));
    const body = supported
      ? [
          segmented(
            t('סוג החיפוש'),
            [
              { value: Mode.simple, label: t('חיפוש רגיל') },
              { value: Mode.builder, label: t('חיפוש מתקדם') },
              { value: Mode.free, label: t('ניסוח חופשי') },
            ],
            advanced ? Mode.builder : mode,
            (value, how) => actions.advancedMode(value, how),
            'adv-kind-',
          ),
          modeIntro(mode),
          note
            ? el(
                'div',
                { class: 'notice' },
                icon('warning_24_regular'),
                el('p', { class: 'notice-text' }, note),
                button('tonal', t('הורדת הגרסה החדשה'), actions.download, { key: 'adv-free-download' }),
              )
            : [
                wordsSection(state, actions, easy),
                scopeSection(state, actions, advanced ? 2 : null, catalogReady),
                // ראשי תיבות ו"ניהול הצורות" אינם חלק מניסוח חופשי.
                mode === Mode.free || easy ? null : optionsSection(state, actions, advanced ? 3 : null),
                summaryCard(model, actions),
                advanced ? guideSection(actions) : null,
              ],
        ]
      : el(
          'div',
          { class: 'notice' },
          icon('warning_24_regular'),
          el(
            'p',
            { class: 'notice-text' },
            t('שירות בר אילן שבמחשב ישן ואינו מכיר את החיפוש המתקדם. כדאי להוריד את הגרסה החדשה.'),
          ),
          button('tonal', t('הורדת הגרסה החדשה'), actions.download, { key: 'adv-download' }),
        );
    return el(
      'div',
      { class: 'text-page' },
      el(
        'header',
        { class: 'page-header' },
        el('h2', { class: 'page-title', id: 'text-title' }, t('חיפוש בטקסט')),
        el('p', { class: 'page-lead' }, t('החיפוש רץ בבר אילן, והתוצאות נפתחות בחלון שלו.')),
      ),
      el('div', { class: 'advanced-body' }, body),
      supported ? footer(model, state, actions, Boolean(note)) : null,
    );
  }

  const api = { textSearchPage, summaryLines };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaAdvancedUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
