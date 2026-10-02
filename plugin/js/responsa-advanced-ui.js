// דיאלוג החיפוש המתקדם (מסך מלא, כמו העזרה): כל האפשרויות של "חיפוש מתקדם"
// בבר אילן בצורה גרפית — מילים וחלופות, צורות, מרחקים, תחום ואפשרויות —
// ותצוגה של השאילתה כפי שתישלח. כמו responsa-panels.js: מודל ופעולות
// נכנסים, אלמנט יוצא, וטקסט רק דרך textContent.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Advanced = root.ResponsaAdvanced;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button, iconButton } = root.ResponsaUi;
  const { segmented, switchRow } = root.ResponsaPanels;
  const t = (text, vars) => I18n.t(text, vars);

  function heading(title, subtitle) {
    return [
      el('h3', { class: 'advanced-heading' }, title),
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
      placeholder: alternative ? t('מילה חלופית') : t('מילה'),
      'aria-label': alternative
        ? t('מילה {n}, חלופה {k}', { n: term, k: alternative + 1 })
        : t('מילה {n}', { n: term }),
      autocomplete: 'off',
      spellcheck: 'false',
      dataset: { focusKey: 'adv-word-' + index + '-' + alternative },
    });
    input.value = value;
    input.addEventListener('input', () => actions.advancedWord(index, alternative, input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') actions.runAdvanced();
    });
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
      { class: 'term-card' + (invalid ? ' is-error' : '') },
      el(
        'div',
        { class: 'term-header' },
        el('span', { class: 'term-number' }, t('מילה {n}', { n: index + 1 })),
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

  function builder(state, actions) {
    const query = state.query;
    const items = [];
    query.terms.forEach((term, index) => {
      if (index > 0 && !query.anyOrder) items.push(gapRow(actions, query.gaps[index - 1], index - 1));
      items.push(termCard(state, actions, term, index));
    });
    return [
      el('ol', { class: 'term-list' }, items),
      button('tonal', t('הוספת מילה'), actions.advancedAddTerm, {
        icon: 'add_24_regular',
        key: 'adv-add-term',
        disabled: query.terms.length >= Advanced.MAX_TERMS,
      }),
      el(
        'div',
        { class: 'settings-card advanced-card' },
        switchRow({
          iconName: 'apps_list_24_regular',
          title: t('המילים בכל סדר, ולא בהכרח צמודות'),
          subtitle: t('כל המילים יופיעו, עד מרחק מסוים זו מזו'),
          checked: query.anyOrder,
          onToggle: (anyOrder) => actions.advancedSet({ anyOrder }),
          key: 'adv-any-order',
        }),
        query.anyOrder
          ? el(
              'div',
              { class: 'settings-row' },
              numberField(t('בטווח של עד'), query.within, (within) => actions.advancedSet({ within }), 'adv-within', t('מילים')),
            )
          : null,
      ),
    ];
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
    ];
  }

  function wordsSection(state, actions) {
    const query = state.query;
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('מה לחפש')),
      segmented(
        t('איך לכתוב את החיפוש'),
        [
          { value: 'builder', label: t('בונה החיפוש') },
          { value: 'manual', label: t('כתיבה בתחביר של בר אילן') },
        ],
        query.manual ? 'manual' : 'builder',
        (mode) => actions.advancedSet({ manual: mode === 'manual' }),
        'adv-mode-',
      ),
      query.manual ? manualEditor(state, actions) : builder(state, actions),
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

  function scopeSection(state, actions) {
    const scope = state.query.scope;
    const hints = {
      [Advanced.Scope.all]: t('כמו "חיפוש בכל המאגרים" בבר אילן.'),
      [Advanced.Scope.current]: t('הספרים שכבר נבחרו בבר אילן, ב"המאגרים המשתתפים".'),
      [Advanced.Scope.pick]: t('הבחירה נשמרת גם בבר אילן, ותקפה גם לחיפושים הבאים בו.'),
    };
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('איפה לחפש')),
      segmented(
        t('איפה לחפש'),
        [
          { value: Advanced.Scope.all, label: t('כל הספרים') },
          { value: Advanced.Scope.pick, label: t('קטגוריות וספרים שאבחר') },
          { value: Advanced.Scope.current, label: t('הבחירה שבבר אילן') },
        ],
        scope.mode,
        (mode) => actions.advancedScopeMode(mode),
        'adv-scope-',
      ),
      el('p', { class: 'advanced-hint' }, hints[scope.mode]),
      scope.mode === Advanced.Scope.pick ? [scopeChips(state, actions), picker(state, actions)] : null,
    );
  }

  // ------------------------------------------------------ אפשרויות ותצוגה

  function optionsSection(state, actions) {
    const options = state.query.options;
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('אפשרויות')),
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
        switchRow({
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

  function previewSection(state, actions) {
    const text = Advanced.buildQuery(state.query);
    return el(
      'section',
      { class: 'advanced-section' },
      heading(t('השאילתה שתישלח לבר אילן')),
      el(
        'div',
        { class: 'query-preview' },
        el(
          'code',
          { class: 'query-text' + (text ? '' : ' is-empty'), dir: 'rtl', 'data-role': 'adv-preview' },
          text ? Advanced.displayQuery(text) : t('השאילתה תופיע כאן'),
        ),
        iconButton('copy_24_regular', t('העתקת השאילתה'), actions.copyAdvancedQuery, { key: 'adv-copy' }),
      ),
      el(
        'p',
        { class: 'advanced-error', role: 'alert', 'data-role': 'adv-problem', hidden: !state.problem },
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
        el('p', { class: 'advanced-subheading' }, t('דוגמאות מהעזרה של בר אילן. לחיצה טוענת אותן לבונה:')),
        el(
          'ul',
          { class: 'example-list' },
          Advanced.EXAMPLES.map((example) =>
            el(
              'li',
              {},
              button('text', t(example.label), () => actions.advancedExample(example.id), {
                key: 'adv-example-' + example.id,
              }),
            ),
          ),
        ),
      ),
    );
  }

  function footer(model, state, actions) {
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
        Domain.serviceCan(model.health, 'showResponsa')
          ? button('tonal', t('פתיחת בר אילן'), actions.showResponsa, {
              icon: 'open_24_regular',
              key: 'adv-show',
              busy: model.showing,
              busyLabel: t('פותח…'),
            })
          : null,
        button('filled', t('חיפוש בבר אילן'), actions.runAdvanced, {
          icon: 'search_24_regular',
          key: 'adv-run',
          busy: state.running,
          busyLabel: t('מחפש…'),
        }),
      ),
    );
  }

  function advancedDialog(model, actions) {
    const state = model.advanced;
    const supported = Domain.serviceCan(model.health, 'advancedSearch');
    const body = supported
      ? [
          el(
            'p',
            { class: 'help-lead' },
            t('כל האפשרויות של "חיפוש מתקדם" בבר אילן, בלי לזכור סימנים. החיפוש רץ בבר אילן, והתוצאות נפתחות בו.'),
          ),
          wordsSection(state, actions),
          scopeSection(state, actions),
          optionsSection(state, actions),
          previewSection(state, actions),
          guideSection(actions),
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
      { class: 'dialog-content' },
      el(
        'header',
        { class: 'sheet-header' },
        el('h2', { class: 'sheet-title', id: 'advanced-title' }, t('חיפוש מתקדם בבר אילן')),
        iconButton('dismiss_24_regular', t('סגירה'), actions.closeSheet, { className: 'sheet-close', key: 'close-advanced' }),
      ),
      el(
        'div',
        { class: 'dialog-body advanced-body', dataset: { focusKey: 'advanced-panel' } },
        body,
      ),
      supported ? footer(model, state, actions) : null,
    );
  }

  const api = { advancedDialog };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaAdvancedUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
