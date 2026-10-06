// הלשוניות "הגדרות" ו"עזרה", ומסך הפתיחה (הדיאלוג היחיד בתוסף). כמו
// responsa-ui.js: מודל ופעולות נכנסים, אלמנט יוצא, וטקסט רק דרך textContent.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button, iconButton } = root.ResponsaUi;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /** קיצור המקלדת שבמניפסט, לתצוגה. */
  const SEARCH_SHORTCUT = 'Ctrl+Alt+B';

  const HelpTab = Object.freeze({
    guide: 'guide',
    troubleshoot: 'troubleshoot',
    status: 'status',
    about: 'about',
  });

  function has(model, permission) {
    return Array.isArray(model.permissions) && model.permissions.includes(permission);
  }

  function header(titleId, title, onClose, closeKey) {
    return el(
      'header',
      { class: 'sheet-header' },
      el('h2', { class: 'sheet-title', id: titleId }, title),
      iconButton('dismiss_24_regular', t('סגירה'), onClose, {
        className: 'sheet-close',
        key: closeKey,
      }),
    );
  }

  /** כותרת של לשונית: שם והסבר קצר. */
  function pageHeader(titleId, title, lead) {
    return el(
      'header',
      { class: 'page-header' },
      el('h2', { class: 'page-title', id: titleId }, title),
      lead ? el('p', { class: 'page-lead' }, lead) : null,
    );
  }

  function section(title, subtitle, ...rows) {
    return el(
      'section',
      { class: 'settings-section' },
      el('h3', { class: 'settings-heading' }, title),
      subtitle ? el('p', { class: 'settings-subheading' }, subtitle) : null,
      el('div', { class: 'settings-card' }, rows),
    );
  }

  /**
   * שורה שכולה מתג: לחיצה בכל מקום בה מחליפה (כמו באוצריא). מתג כבוי מסומן
   * ב-aria-disabled ולא ב-disabled, כדי שקורא מסך יגיע להסבר איך להפעיל.
   */
  function switchRow({ iconName, title, subtitle, checked, disabled, onToggle, key, note }) {
    return el(
      'button',
      {
        type: 'button',
        class: 'settings-row settings-switch-row',
        role: 'switch',
        'aria-checked': checked ? 'true' : 'false',
        'aria-disabled': disabled ? 'true' : null,
        onclick: () => {
          if (!disabled) onToggle(!checked);
        },
        dataset: { focusKey: key },
      },
      icon(iconName, 'settings-row-icon'),
      el(
        'span',
        { class: 'settings-row-texts' },
        el('span', { class: 'settings-row-title' }, title),
        subtitle ? el('span', { class: 'settings-row-subtitle' }, subtitle) : null,
        note ? el('span', { class: 'settings-row-note' }, note) : null,
      ),
      el('span', { class: 'switch', 'aria-hidden': 'true' }, el('span', { class: 'switch-thumb' })),
    );
  }

  function infoRow(iconName, title, subtitle, trailing) {
    return el(
      'div',
      { class: 'settings-row' },
      icon(iconName, 'settings-row-icon'),
      el(
        'span',
        { class: 'settings-row-texts' },
        el('span', { class: 'settings-row-title' }, title),
        subtitle ? el('span', { class: 'settings-row-subtitle' }, subtitle) : null,
      ),
      trailing || null,
    );
  }

  /**
   * קבוצת בחירה אחת (radiogroup): עצירת Tab אחת, וחצים בין האפשרויות.
   * בחירה בחצים מגיעה עם `{ viaKeyboard: true }`, והפוקוס עובר לאפשרות
   * שנבחרה אחרי שהלשונית נבנתה מחדש. [group] ו-[item] — המחלקות של הקבוצה
   * ושל כל אפשרות; [dataOf] מוסיף data לכל אפשרות.
   */
  function radioGroup(group, item, label, options, value, onSelect, keyPrefix, dataOf) {
    const onKeydown = (event) => {
      const rtl = document.documentElement.dir !== 'ltr';
      const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[
        event.key
      ];
      if (!step) return;
      event.preventDefault();
      // מהאפשרות שבפוקוס ולא מ-[value]: הקבוצה נבנית מחדש רק אחרי השמירה,
      // ושתי לחיצות מהירות היו מחשבות את אותה "הבאה".
      const focused = event.target.closest('[role="radio"]');
      const current = focused ? focused.dataset.focusKey.slice(keyPrefix.length) : String(value);
      const index = options.findIndex((option) => String(option.value) === current);
      const next = options[(index + step + options.length) % options.length].value;
      Promise.resolve(onSelect(next, { viaKeyboard: true })).then(() => {
        // אחרי הבנייה מחדש: האפשרות שנבחרה בפועל (גם כשהשמירה נכשלה).
        const target = document.querySelector(
          '[data-focus-key^="' + CSS.escape(keyPrefix) + '"][aria-checked="true"]',
        );
        if (target) target.focus();
      });
    };
    return el(
      'div',
      { ...group, role: 'radiogroup', 'aria-label': label, onkeydown: onKeydown },
      options.map((option) =>
        el(
          'button',
          {
            type: 'button',
            ...item,
            role: 'radio',
            'aria-checked': option.value === value ? 'true' : 'false',
            tabindex: option.value === value ? '0' : '-1',
            onclick: () => onSelect(option.value),
            dataset: { focusKey: keyPrefix + option.value, ...(dataOf ? dataOf(option) : {}) },
          },
          option.value === value ? icon('checkmark_24_regular', 'segment-check') : null,
          option.label,
        ),
      ),
    );
  }

  /** בקר מקטעים של M3: הנבחר ברקע משני ועם סימון (כמו SegmentedControl של אוצריא). */
  function segmented(label, options, value, onSelect, keyPrefix) {
    return radioGroup({ class: 'segmented' }, { class: 'segment' }, label, options, value, onSelect, keyPrefix);
  }

  /** אריחים שנשברים לשורות, לבחירה מרשימה ארוכה (גופן). */
  function optionGrid(label, options, value, onSelect, keyPrefix, dataOf) {
    return radioGroup(
      { class: 'option-grid' },
      { class: 'option-tile' },
      label,
      options,
      value,
      onSelect,
      keyPrefix,
      dataOf,
    );
  }

  /** שורת הגדרה שהפקד שלה מתחתיה (בחירה מכמה אפשרויות). */
  function stackedRow(iconName, title, subtitle, control) {
    return el(
      'div',
      { class: 'settings-row settings-row-stacked' },
      el(
        'span',
        { class: 'settings-row-heading' },
        icon(iconName, 'settings-row-icon'),
        el(
          'span',
          { class: 'settings-row-texts' },
          el('span', { class: 'settings-row-title' }, title),
          subtitle ? el('span', { class: 'settings-row-subtitle' }, subtitle) : null,
        ),
      ),
      control,
    );
  }

  // ---------------------------------------------------------- הגדרות

  /**
   * גם באוצריא שעדיין אינה תומכת בזה: ההגדרה נשמרת עכשיו, וחלה ברגע
   * שאוצריא תתמוך (המניפסט בודק את אותו מפתח ב-`when`).
   */
  function librarySearchRow(model, actions) {
    if (!Domain.hostSupportsLibrary(model.permissions)) {
      return switchRow({
        iconName: 'library_24_regular',
        title: t('ספרי בר אילן בחיפוש הספרייה'),
        subtitle: t('ספרי בר אילן יופיעו בתוצאות "איתור ספר או מחבר" במסך הספרייה של אוצריא, ולחיצה עליהם תפתח אותם בבר אילן.'),
        note: t('בגרסה הזו של אוצריא עדיין אין אפשרות כזו (היא מתוכננת לגרסה 0.9.98). אפשר לבחור כבר עכשיו, והבחירה תחול כשהיא תגיע.'),
        checked: model.settings.libraryBooks,
        key: 'setting-library',
        onToggle: (value) => actions.setSetting('libraryBooks', value),
      });
    }
    const blocked = Domain.lacksStartupPermission(model.permissions);
    return switchRow({
      iconName: 'library_24_regular',
      title: t('ספרי בר אילן בחיפוש הספרייה'),
      subtitle: t('ספרי בר אילן יופיעו בתוצאות "איתור ספר או מחבר" במסך הספרייה של אוצריא, ולחיצה עליהם תפתח אותם בבר אילן.'),
      note: blocked ? Domain.startupPermissionHint() : null,
      checked: !blocked && model.settings.libraryBooks,
      disabled: blocked,
      key: 'setting-library',
      onToggle: (value) => actions.setSetting('libraryBooks', value),
    });
  }

  function contextMenuRow(model, actions) {
    const blocked = Domain.lacksStartupPermission(model.permissions);
    const allowed = has(model, 'reader.context_menu') && !blocked;
    return switchRow({
      iconName: 'search_24_regular',
      title: t('בר אילן בלחיצה ימנית'),
      subtitle: t('בספר פתוח מסמנים מילה ולוחצים לחיצה ימנית: "חיפוש בבר אילן" מחפש את הטקסט המסומן, ו"איתור המקום בבר אילן" פותח בבר אילן את המקום של השורה המסומנת.'),
      note: allowed
        ? has(model, 'app.shortcuts')
          ? t('קיצור מקלדת: {shortcut}. אפשר לשנות אותו בהגדרות אוצריא ← קיצורי מקשים.', {
              shortcut: SEARCH_SHORTCUT,
            })
          : t('כדי שגם הקיצור {shortcut} יעבוד: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "קיצורי מקלדת".', {
              shortcut: SEARCH_SHORTCUT,
            })
        : blocked
          ? Domain.startupPermissionHint()
          : t('כדי להפעיל: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "פריטים בתפריט הטקסט".'),
      checked: allowed && model.settings.contextMenu,
      disabled: !allowed,
      key: 'setting-context-menu',
      onToggle: (value) => actions.setSetting('contextMenu', value),
    });
  }

  function searchDialogRow(model, actions) {
    const blocked = Domain.lacksStartupPermission(model.permissions);
    const allowed = has(model, 'search.dialog') && !blocked;
    return switchRow({
      iconName: 'search_info_24_regular',
      title: t('בר אילן בדיאלוג החיפוש'),
      subtitle: t('בדיאלוג החיפוש של אוצריא, תחת "אפשרויות נוספות", תופיע התיבה "חיפוש בבר אילן במקום באוצריא". כשהיא מסומנת, החיפוש נשלח לבר אילן במקום לאוצריא, ולשונית התוסף נפתחת.'),
      note: allowed
        ? null
        : blocked
          ? Domain.startupPermissionHint()
          : t('כדי להפעיל: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "רכיבים בחלון החיפוש".'),
      checked: allowed && model.settings.searchDialog,
      disabled: !allowed,
      key: 'setting-search-dialog',
      onToggle: (value) => actions.setSetting('searchDialog', value),
    });
  }

  /** השירות שולח את ההגדרה לבר אילן רק מגרסה שמכירה אותה (`autoStart`). */
  function autoStartRow(model, actions) {
    const supported = Domain.serviceCan(model.health, 'autoStart');
    return switchRow({
      iconName: 'open_24_regular',
      title: t('הפעלת בר אילן כשהוא סגור'),
      subtitle: t('לפני פתיחת ספר, חיפוש או איתור מקום, התוסף מפעיל את בר אילן אם הוא סגור. כשהמתג כבוי, פותחים את בר אילן בעצמכם קודם. חל גם על הלחיצה הימנית ועל מסך הספרייה.'),
      note:
        supported || !model.health
          ? null
          : t('שירות בר אילן שבמחשב ישן ואינו מכיר את ההגדרה הזו, ולכן בר אילן תמיד מופעל. כדאי להוריד את הגרסה החדשה.'),
      checked: model.settings.autoStart,
      disabled: Boolean(model.health) && !supported,
      key: 'setting-auto-start',
      onToggle: (value) => actions.setSetting('autoStart', value),
    });
  }

  function catalogRows(model, actions) {
    const status = model.status || {};
    const catalog = status.catalog || {};
    const facts = [
      catalog.exists
        ? t('{count} ספרים ברשימה', { count: Domain.formatCount(catalog.bookCount || 0) })
        : t('הרשימה עוד לא נקראה'),
      Domain.formatBuiltAt(catalog.builtAt)
        ? t('נקראה ב-{date}', { date: Domain.formatBuiltAt(catalog.builtAt) })
        : null,
      status.version ? t('מהדורת בר אילן: {version}', { version: status.version }) : null,
    ].filter(Boolean);
    return [
      infoRow('document_bullet_list_24_regular', t('רשימת הספרים'), facts.join(' · ')),
      infoRow(
        'arrow_sync_24_regular',
        t('קריאת הרשימה מחדש'),
        t('כשהותקנה מהדורה חדשה של בר אילן, או כשספר מסוים לא נפתח. לוקח כמה דקות, והרשימה הקיימת נשארת בשימוש עד שהחדשה מוכנה.'),
        button('tonal', t('קריאה מחדש'), actions.rebuild, {
          key: 'settings-rebuild',
          disabled:
            !model.status || !status.installed || model.buildActive || model.openingKey !== null,
        }),
      ),
    ];
  }

  /** השמות שאוצריא מציגה לגופנים שלה (AppFonts). */
  const FONT_LABELS = Object.freeze({
    '': N('כמו באוצריא'),
    TaameyDavidCLM: N('דוד'),
    FrankRuhlCLM: N('פרנק-רוהל'),
    TaameyAshkenaz: N('טעמי אשכנז'),
    KeterYG: N('כתר'),
    Shofar: N('שופר'),
    NotoSerifHebrew: N('נוטו'),
    Tinos: N('טינוס'),
    Rubik: N('רוביק'),
  });

  /** גופן, גודל תצוגה ושפה. כל שם גופן מוצג בגופן עצמו. */
  function displayRows(model, actions) {
    const Settings = root.ResponsaSettings;
    const fonts = Settings.FONTS.map((value) => ({ value, label: t(FONT_LABELS[value]) }));
    const scales = Settings.SCALES.map((value) => ({ value, label: Math.round(value * 100) + '%' }));
    const languages = [
      { value: 'auto', label: t('כמו באוצריא') },
      { value: 'he', label: 'עברית' },
      { value: 'en', label: 'English' },
    ];
    return [
      stackedRow(
        'text_font_24_regular',
        t('גופן'),
        t('הגופן של התוסף. "כמו באוצריא" הוא גופן הממשק שנבחר בהגדרות אוצריא.'),
        optionGrid(
          t('גופן'),
          fonts,
          model.settings.font,
          (value) => actions.setSetting('font', value),
          'font-',
          (option) => ({ font: option.value || 'host' }),
        ),
      ),
      stackedRow(
        'text_font_size_24_regular',
        t('גודל תצוגה'),
        t('מגדיל או מקטין את כל מה שבלשונית: טקסט, כפתורים ורשימות.'),
        segmented(t('גודל תצוגה'), scales, model.settings.scale, (value) => actions.setSetting('scale', value), 'scale-'),
      ),
      stackedRow(
        'translate_24_regular',
        t('שפת התוסף'),
        null,
        segmented(t('שפת התוסף'), languages, model.settings.language, actions.setLanguage, 'language-'),
      ),
    ];
  }

  function shortcutRows(model, actions) {
    if (!has(model, 'ui.create_shortcut')) return [];
    const windows = model.platform === 'windows';
    return [
      infoRow(
        'desktop_24_regular',
        t('קיצור דרך בשולחן העבודה'),
        t('לחיצה כפולה עליו פותחת את אוצריא ישר בלשונית בר אילן.'),
        button('tonal', t('יצירה'), () => actions.createShortcut('desktop'), {
          key: 'shortcut-desktop',
        }),
      ),
      windows
        ? infoRow(
            'apps_list_24_regular',
            t('תפריט התחל'),
            t('מוסיף את "בר אילן באוצריא" לתפריט התחל של Windows.'),
            button('tonal', t('הוספה'), () => actions.createShortcut('startMenu'), {
              key: 'shortcut-start',
            }),
          )
        : null,
    ].filter(Boolean);
  }

  function settingsPage(model, actions) {
    const shortcuts = shortcutRows(model, actions);
    return el(
      'div',
      {},
      pageHeader('settings-title', t('הגדרות')),
      el(
        'div',
        { class: 'page-body' },
        section(
          t('שילוב באוצריא'),
          t('דרכים להגיע לבר אילן מתוך אוצריא עצמה, גם כשהלשונית "בר אילן" סגורה.'),
          librarySearchRow(model, actions),
          contextMenuRow(model, actions),
          searchDialogRow(model, actions),
        ),
        section(t('בר אילן'), null, autoStartRow(model, actions)),
        section(t('תצוגה ושפה'), null, displayRows(model, actions)),
        section(t('רשימת הספרים'), null, catalogRows(model, actions)),
        shortcuts.length ? section(t('קיצורי דרך'), null, shortcuts) : null,
      ),
    );
  }

  // ------------------------------------------------------------ עזרה

  function guideTab(model, actions) {
    const library = Domain.hostSupportsLibrary(model.permissions);
    const topic = (iconName, title, steps, tip) =>
      el(
        'article',
        { class: 'help-topic' },
        el('h3', { class: 'help-topic-title' }, icon(iconName), title),
        el('ol', { class: 'help-steps' }, steps.map((step) => el('li', {}, step))),
        tip ? el('p', { class: 'help-tip' }, tip) : null,
      );
    return el(
      'div',
      { class: 'help-guide' },
      el(
        'p',
        { class: 'help-lead' },
        t('התוסף מחבר את אוצריא לתוכנת פרויקט השו"ת של בר אילן המותקנת במחשב: מוצאים ספר באוצריא, והוא נפתח בבר אילן. התוכנה צריכה להיות מותקנת; היא לא חייבת להיות פתוחה.'),
      ),
      topic(
        'arrow_download_24_regular',
        t('התקנה והכנה, פעם אחת'),
        [
          t('מתקינים את "שירות בר אילן לאוצריא": בלשונית "ספרים" יש כפתור "הורדת המתקין". המתקין מוסיף לאוצריא גם את התוסף, ואינו דורש הרשאות מנהל.'),
          t('בהגדרות אוצריא ← כלים ← בר אילן מדליקים את "הוספת רכיבים לתוכנה", בשביל החיפוש בלחיצה ימנית וספרי בר אילן במסך הספרייה.'),
          t('בלשונית "ספרים" לוחצים "התחלה", והתוסף קורא את רשימת הספרים (כמה דקות).'),
        ],
        t('התוסף עובד גם בלי אינטרנט: הכול קורה במחשב שלכם.'),
      ),
      topic('search_24_regular', t('ספרים: חיפוש ספר ופתיחתו'), [
        t('בלשונית "ספרים" מקלידים שם ספר, שם מחבר, או שניהם יחד.'),
        t('לוחצים על "פתיחה בבר אילן" ליד הספר. בר אילן נפתח (או עולה לחזית) עם הספר, תוך שניות ספורות.'),
        t('"פרטי הספר" מציג את המחבר, מקום ושנת ההדפסה, המהדורה ומיקום הספר בבר אילן.'),
        t('"פתיחה במקום מסוים" עובר ל"איתור מקום" עם שם הספר, ונשאר רק לכתוב את המקום.'),
      ]),
      Domain.serviceCan(model.health, 'browse')
        ? topic(
            'folder_24_regular',
            t('עיון בקטגוריות'),
            [
              t('כשתיבת החיפוש ריקה, הלשונית מציגה את הקטגוריות של בר אילן, ולצד כל אחת מספר הספרים שבה.'),
              t('לוחצים על קטגוריה כדי להיכנס אליה. השורה שמעל השם מראה איפה אתם בעץ, ולחיצה על כל רמה בה חוזרת אליה.'),
              t('חיפוש בתוך קטגוריה מחפש רק בה ובמה שתחתיה. "חיפוש בכל הספרים" יוצא ממנה.'),
            ],
            t('הלשונית נפתחת בקטגוריה האחרונה שבה הייתם.'),
          )
        : null,
      Domain.serviceCan(model.health, 'advancedSearch')
        ? topic(
            'database_search_24_regular',
            t('חיפוש בטקסט'),
            [
              t('בלשונית "חיפוש בטקסט" כותבים מילים ולוחצים "חיפוש בבר אילן". המילים יחופשו צמודות, כמו בחלון החיפוש של בר אילן.'),
              t('"חיפוש מתקדם": מילה בכל שדה, ולכל אחת בוחרים איך לחפש אותה (עם אותיות שימוש, בכתיב מלא או חסר, כל השורש ועוד). "או מילה אחרת" מוסיף מילים חלופיות, ובין מילה למילה בוחרים מרחק.'),
              t('ב"איפה לחפש" אפשר לבחור קטגוריות וספרים. "מה יחופש" מסביר במילים בדיוק מה יחופש.'),
            ],
            t('מי שמכיר את התחביר של בר אילן יכול לכתוב את השאילתה בעצמו ("כתיבה בתחביר של בר אילן").'),
          )
        : null,
      Domain.serviceCan(model.health, 'locate')
        ? topic(
            'document_search_24_regular',
            t('איתור מקום'),
            [
              t('בלשונית "איתור מקום" כותבים שם ספר ומקום בו, למשל "בראשית ב ג" או "ברכות דף ב עמוד א".'),
              t('לוחצים "פתיחה בבר אילן", והספר נפתח ישר במקום הזה.'),
              t('כשבר אילן מוצא כמה מקורות, למשל החומש ומפרשיו, בוחרים את המקור מהרשימה.'),
            ],
            t('המקומות האחרונים נשמרים, ולחיצה עליהם פותחת אותם שוב.'),
          )
        : null,
      library
        ? topic(
            'library_24_regular',
            t('ספרי בר אילן במסך הספרייה'),
            [
              t('במסך הספרייה של אוצריא מקלידים בתיבה "איתור ספר או מחבר".'),
              t('ספרי בר אילן מופיעים בין התוצאות, עם שורה "בר אילן" מתחת לשם.'),
              t('לחיצה על ספר כזה פותחת אותו בבר אילן.'),
            ],
            t('אפשר לכבות זאת בלשונית "הגדרות".'),
          )
        : null,
      topic(
        'text_quote_24_regular',
        t('חיפוש טקסט מתוך ספר פתוח'),
        [
          t('בספר פתוח באוצריא מסמנים מילה או משפט.'),
          t('לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן" — או לוחצים {shortcut}.', {
            shortcut: SEARCH_SHORTCUT,
          }),
          t('בר אילן מחפש את הטקסט בכל ספריו ומציג את התוצאות בחלון שלו.'),
        ],
        t('ניקוד, טעמים ופיסוק מוסרים לפני החיפוש; נשלחות עד עשר מילים.'),
      ),
      topic(
        'arrow_sync_24_regular',
        t('קריאת רשימת הספרים'),
        [
          t('בפעם הראשונה התוסף קורא את רשימת הספרים מבר אילן — כמה דקות, פעם אחת.'),
          t('בזמן הקריאה בר אילן עובד לבד: אל תלחצו בו ואל תסגרו אותו. אפשר להמשיך לעבוד באוצריא.'),
          t('אחרי התקנת מהדורה חדשה של בר אילן: לשונית "הגדרות" ← "קריאה מחדש".'),
        ],
      ),
      topic('settings_24_regular', t('הגדרות'), [
        t('בלשונית "הגדרות" מדליקים או מכבים את החיפוש בלחיצה ימנית ואת ספרי בר אילן במסך הספרייה, בוחרים גופן, גודל תצוגה ושפה (עברית או English), קוראים מחדש את רשימת הספרים ויוצרים קיצור דרך.'),
      ]),
      el(
        'div',
        { class: 'help-actions' },
        button('text', t('המדריך המלא באתר'), () => actions.openLink('guide'), {
          key: 'guide-online',
          icon: 'open_24_regular',
        }),
      ),
    );
  }

  // ------------------------------------------------------------ הבהרה

  /**
   * אותה הבהרה במסך הפתיחה וב"אודות". כך נקבע בפורום אוצריא
   * (Domain.Links.forum): בפתיחה הראשונה מזהירים שהתוסף נועד למי שרכש רישיון.
   */
  function clarification(actions) {
    return el(
      'aside',
      { class: 'clarification', 'aria-labelledby': 'clarification-title' },
      el(
        'h3',
        { class: 'clarification-title', id: 'clarification-title' },
        icon('shield_checkmark_24_regular'),
        t('הבהרה חשובה'),
      ),
      el(
        'p',
        { class: 'clarification-text' },
        t('התוסף נועד לסייע למי שרכש כדין רישיון לתוכנת פרויקט השו"ת של אוניברסיטת בר אילן. הוא עובד רק עם התוכנה שמותקנת אצלכם, ואינו מעתיק, שומר או שולח את תוכן הספרים: הוא רק מבקש מבר אילן לפתוח ספר או לחפש, כפי שהייתם עושים בעצמכם.'),
      ),
      el(
        'p',
        { class: 'clarification-text clarification-warning' },
        t('אין להשתמש בו עם עותק שאינו מורשה. "שארית ישראל לא יעשו עוולה" (צפניה ג, יג).'),
      ),
      el(
        'p',
        { class: 'clarification-text' },
        t('התוסף אינו מוצר רשמי של אוניברסיטת בר אילן ואינו קשור אליה. כל הזכויות על התוכנה ועל התוכן שבה שמורות לבעליהן.'),
      ),
      button('text', t('פרטים והבהרות בפורום אוצריא'), () => actions.openLink('forum'), {
        key: 'clarification-forum',
        icon: 'open_24_regular',
      }),
    );
  }

  // ------------------------------------------------------------ פתיחה

  const CHECK_ICONS = Object.freeze({
    done: 'checkmark_circle_24_regular',
    missing: 'dismiss_circle_24_regular',
    unknown: 'circle_24_regular',
  });

  /** מסך הפתיחה: מה התוסף עושה, מה צריך כדי להתחיל (ומה כבר מוכן), והבהרה. */
  function welcomeDialog(model, actions) {
    const library = Domain.hostSupportsLibrary(model.permissions);
    const feature = (iconName, text) =>
      el('li', { class: 'welcome-feature' }, icon(iconName, 'welcome-feature-icon'), el('span', {}, text));
    const stateLabel = {
      done: t('מוכן'),
      missing: t('חסר'),
      unknown: t('עוד לא ידוע'),
    };
    return el(
      'div',
      { class: 'dialog-content' },
      header('welcome-title', t('ברוכים הבאים לבר אילן באוצריא'), actions.finishWelcome, 'close-welcome'),
      el(
        'div',
        // מפתח פוקוס: רענון שמעדכן את הרשימה בונה את הלוח מחדש, והפוקוס נשאר כאן.
        { class: 'dialog-body welcome-body', tabindex: '0', dataset: { focusKey: 'welcome-body' } },
        // ההבהרה ראשונה, לפני כל הסבר: כך נקבע בפורום אוצריא.
        clarification(actions),
        el(
          'p',
          { class: 'help-lead' },
          t('התוסף מחבר את אוצריא לתוכנת פרויקט השו"ת של בר אילן שמותקנת במחשב שלכם, ועובד גם בלי אינטרנט.'),
        ),
        el(
          'ul',
          { class: 'welcome-features' },
          feature('search_24_regular', t('מחפשים ספר או מחבר, ופותחים אותו בבר אילן בלחיצה.')),
          feature('database_search_24_regular', t('מחפשים בטקסט של כל הספרים, או פותחים מקום מדויק — למשל "בראשית ב ג".')),
          feature('text_quote_24_regular', t('מסמנים מילה או משפט בספר באוצריא, לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן".')),
          library
            ? feature('library_24_regular', t('ספרי בר אילן מופיעים גם בחיפוש של מסך הספרייה באוצריא.'))
            : null,
        ),
        el('h3', { class: 'welcome-heading' }, t('מה צריך כדי להתחיל')),
        el(
          'ul',
          { class: 'checklist' },
          Domain.setupChecklist(model).map((item) =>
            el(
              'li',
              { class: 'checklist-item', dataset: { state: item.state } },
              icon(CHECK_ICONS[item.state], 'checklist-icon'),
              el('span', { class: 'checklist-label' }, item.label),
              el('span', { class: 'checklist-state' }, stateLabel[item.state]),
            ),
          ),
        ),
        el(
          'p',
          { class: 'help-tip' },
          t('מה שחסר מוסבר בלשונית עצמה, צעד אחר צעד. אפשר לחזור למסך הזה מ"עזרה" ← "אודות ודיווח" ← "מסך הפתיחה".'),
        ),
        el(
          'div',
          { class: 'help-actions welcome-actions' },
          button('filled', t('הבנתי, בואו נתחיל'), actions.finishWelcome, { key: 'welcome-start' }),
          button('text', t('איך משתמשים'), () => actions.openHelp(HelpTab.guide), {
            key: 'welcome-guide',
            icon: 'book_24_regular',
          }),
        ),
      ),
    );
  }

  const TROUBLESHOOTING = [
    {
      q: N('כתוב שצריך להתקין רכיב'),
      a: N('התוסף צריך את "שירות בר אילן לאוצריא", שמחבר בין שתי התוכנות. לוחצים "הורדת המתקין", פותחים את הקובץ ולוחצים "הבא" עד הסוף. אין צורך בהרשאות מנהל. אם הרכיב כבר מותקן — הפעלה מחדש של המחשב מפעילה אותו.'),
    },
    {
      q: N('כתוב שבר אילן לא נמצא במחשב'),
      a: N('התוסף מחפש את פרויקט השו"ת במקומות ההתקנה הרגילים. אם הוא מותקן, פותחים אותו פעם אחת ואז לוחצים "בדיקה חוזרת".'),
    },
    {
      q: N('ספר לא נפתח, או שנפתח ספר אחר'),
      a: N('ייתכן שחלון בבר אילן ממתין לתשובה — עוברים לבר אילן וסוגרים אותו. אם זה חוזר בספר מסוים, קוראים את רשימת הספרים מחדש: לשונית "הגדרות" ← "קריאה מחדש".'),
    },
    {
      q: N('בר אילן שואל "האם ברצונך לחפש בכל המאגרים?"'),
      a: N('זו שאלה של בר אילן עצמו: החיפוש לא מצא תוצאות במאגרים שנבחרו בו. עונים עליה בחלון של בר אילן.'),
    },
    {
      q: N('בר אילן כותב "נמצאו מעל 32000 תוצאות"'),
      a: N('החיפוש כללי מדי לבר אילן. מסמנים קטע ארוך או מדויק יותר ומחפשים שוב.'),
    },
    {
      q: N('חלון בר אילן לא עולה לחזית'),
      a: N('Windows לפעמים משאיר את חלון בר אילן מאחור, והוא מהבהב בשורת המשימות. לוחצים עליו בשורת המשימות.'),
    },
    {
      q: N('אין "חיפוש בבר אילן" בתפריט של לחיצה ימנית'),
      a: N('צריך לסמן טקסט לפני הלחיצה הימנית, והמתג בלשונית "הגדרות" צריך להיות דלוק. הפריט מופיע אחרי שלשונית "בר אילן" נפתחה פעם אחת והתחברה לשירות. אם המתג לא זמין: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו את ההרשאות "הוספת רכיבים לתוכנה" ו"פריטים בתפריט הטקסט".'),
    },
    {
      q: N('בלחיצה ימנית כתוב ש"שירות בר אילן אינו פועל"'),
      a: N('השירות לא ענה במחשב. פותחים את לשונית "בר אילן": היא בודקת מה חסר ומציעה מה לעשות. אחרי התקנה חדשה של השירות, פתיחה אחת של הלשונית מחברת אותו שוב.'),
    },
    {
      q: N('האם התוסף רץ ברקע?'),
      a: N('לא. החיפוש בלחיצה ימנית והפתיחה ממסך הספרייה עוברים ישר מאוצריא לשירות, בלי להעיר את התוסף. מה שפועל תמיד הוא "שירות בר אילן לאוצריא": תהליך קטן (כ-16MB) שממתין לבקשות ואינו צורך מעבד בינתיים.'),
    },
    {
      q: N('ספרי בר אילן לא מופיעים בחיפוש הספרייה'),
      library: true,
      a: N('המתג בלשונית "הגדרות" צריך להיות דלוק, ורשימת הספרים צריכה להיקרא לפחות פעם אחת. מקלידים לפחות שלוש אותיות.'),
    },
    {
      q: N('"איתור מקום" לא מוצא את המקום'),
      a: N('כותבים את שם הספר כמו בבר אילן, בכתיב מלא, ואחריו את המקום: "בראשית ב ג", "ברכות דף ב עמוד א", "שולחן ערוך אורח חיים סימן א". אפשר לבדוק את שם הספר בלשונית "ספרים".'),
    },
    {
      q: N('כתוב שבבר אילן פתוחים חלונות רבים מדי'),
      a: N('בר אילן מפסיק לפתוח חלונות חדשים כשפתוחים בו כ-22. סוגרים בו כמה חלונות ומנסים שוב.'),
    },
    {
      q: N('בר אילן הופעל "כמנהל" ולא מגיב לתוסף'),
      a: N('כש-Windows מריץ את בר אילן בהרשאות מנהל, תוכנות רגילות לא יכולות לשלוט בו. סוגרים אותו ופותחים שוב כרגיל.'),
    },
  ];

  function troubleshootTab(model) {
    const library = Domain.hostSupportsLibrary(model.permissions);
    return el(
      'div',
      { class: 'help-faq' },
      TROUBLESHOOTING.filter((item) => library || !item.library).map((item) =>
        el(
          'details',
          { class: 'faq-item' },
          el('summary', { class: 'faq-question' }, t(item.q)),
          el('p', { class: 'faq-answer' }, t(item.a)),
        ),
      ),
    );
  }

  /**
   * שורות מצב המערכת, לתצוגה ולהעתקה. `forReport` משמיט את מיקום ההתקנה:
   * הנתיב עשוי לכלול את שם המשתמש ב-Windows, והדיווח מבטיח "בלי נתיבים".
   */
  function statusFacts(model, options) {
    const forReport = Boolean(options && options.forReport);
    const status = model.status || {};
    const catalog = status.catalog || {};
    const health = model.health || {};
    const yesNo = (value) => (value ? t('כן') : t('לא'));
    const onOff = (value) => (value ? t('דלוק') : t('כבוי'));
    const startup = !Domain.lacksStartupPermission(model.permissions);
    return [
      [t('גרסת אוצריא'), model.appVersion || t('לא ידוע')],
      [t('גרסת התוסף'), model.pluginVersion || t('לא ידוע')],
      [t('גרסת השירות'), health.serverVersion || t('לא פועל')],
      [
        t('בר אילן'),
        !model.status
          ? t('לא ידוע')
          : status.installed
            ? t('מותקן') + (status.version ? ' · ' + t('מהדורה {version}', { version: status.version }) : '')
            : t('לא נמצא'),
      ],
      forReport ? null : [t('מיקום ההתקנה'), status.installPath || '—', 'ltr'],
      [t('בר אילן פתוח עכשיו'), model.status ? yesNo(status.running) : t('לא ידוע')],
      [
        t('רשימת הספרים'),
        catalog.exists
          ? Domain.booksLabel(catalog.bookCount || 0) +
            (Domain.formatBuiltAt(catalog.builtAt) ? ' · ' + Domain.formatBuiltAt(catalog.builtAt) : '')
          : t('עוד לא נקראה'),
      ],
      Domain.hostSupportsLibrary(model.permissions)
        ? [t('חיפוש הספרייה'), onOff(startup && model.settings.libraryBooks)]
        : null,
      [t('לחיצה ימנית'), onOff(startup && model.settings.contextMenu)],
      [t('דיאלוג החיפוש'), onOff(startup && model.settings.searchDialog)],
      [t('הפעלת בר אילן כשהוא סגור'), onOff(model.settings.autoStart)],
      [t('הוספת רכיבים לתוכנה'), yesNo(startup)],
      [t('פורט השירות'), model.servicePort ? String(model.servicePort) : '—', 'ltr'],
    ].filter(Boolean);
  }

  function statusText(model, options) {
    return statusFacts(model, options)
      .map(([label, value]) => label + ': ' + value)
      .join('\n');
  }

  function statusTab(model, actions) {
    return el(
      'div',
      { class: 'help-status' },
      el(
        'dl',
        { class: 'facts' },
        statusFacts(model).map(([label, value, dir]) => [
          el('dt', {}, label),
          // <bdi>: נתיב או גרסה נקראים משמאל לימין, אבל השורה מיושרת לתווית.
          el('dd', {}, dir ? el('bdi', { dir }, value) : value),
        ]),
      ),
      el(
        'div',
        { class: 'help-actions' },
        button('tonal', t('העתקת הפרטים'), actions.copyStatus, {
          key: 'copy-status',
          icon: 'copy_24_regular',
        }),
        button('text', t('בדיקה חוזרת'), actions.retry, {
          key: 'status-retry',
          busy: model.checking,
          busyLabel: t('בודק…'),
        }),
      ),
      logView(model),
    );
  }

  /**
   * הפעולות האחרונות, מהחדשה לישנה. הודעות ברמת debug (כל בקשה לשירות)
   * נכנסות רק להעתקה ולדיווח, כדי שהרשימה כאן תישאר קריאה.
   */
  function logView(model) {
    const entries = (model.log || []).slice().reverse();
    return el(
      'section',
      { class: 'log-card', 'aria-labelledby': 'log-title' },
      el('h3', { class: 'log-title', id: 'log-title' }, icon('history_24_regular'), t('פעולות אחרונות')),
      entries.length
        ? el(
            'ol',
            {
              class: 'log-list',
              tabindex: '0',
              'aria-label': t('פעולות אחרונות'),
              dataset: { focusKey: 'log-list' },
            },
            entries.map((entry) =>
              el(
                'li',
                { class: 'log-line', dataset: { level: entry.level } },
                el('time', { class: 'log-time', dir: 'ltr' }, root.ResponsaLog.clock(entry.time)),
                el('span', { class: 'log-message' }, el('bdi', {}, entry.message)),
                entry.detail ? el('span', { class: 'log-detail' }, el('bdi', {}, entry.detail)) : null,
              ),
            ),
          )
        : el('p', { class: 'help-tip' }, t('עוד לא נרשמו פעולות.')),
      el(
        'p',
        { class: 'help-tip' },
        t('"העתקת הפרטים" מעתיקה גם את יומן הפעולות ואת יומן השירות, כדי לצרף אותם לפנייה.'),
      ),
    );
  }

  /** קישור חיצוני כשורה: אייקון, שם והסבר קצר. */
  function linkRow(iconName, title, subtitle, onClick, key) {
    return el(
      'button',
      { type: 'button', class: 'link-row', onclick: onClick, dataset: { focusKey: key } },
      icon(iconName, 'link-row-icon'),
      el(
        'span',
        { class: 'link-row-texts' },
        el('span', { class: 'link-row-title' }, title),
        subtitle ? el('span', { class: 'link-row-subtitle' }, subtitle) : null,
      ),
      icon('open_24_regular', 'link-row-trailing'),
    );
  }

  function linksCard(model, actions) {
    return el(
      'section',
      { class: 'links-card', 'aria-label': t('קישורים') },
      model.online === false
        ? el(
            'p',
            { class: 'offline-note' },
            icon('wifi_off_24_regular'),
            t('אין כרגע חיבור לאינטרנט, ולכן הקישורים לא ייפתחו. כל ההדרכה זמינה כאן, בכרטיסייה "איך משתמשים".'),
          )
        : null,
      linkRow('book_24_regular', t('מדריך למשתמש'), t('המדריך המלא, עם תמונות'), () => actions.openLink('guide'), 'link-guide'),
      linkRow('building_shop_24_regular', t('התוסף בחנות התוספים של אוצריא'), t('עדכונים ודירוג'), () => actions.openLink('store'), 'link-store'),
      linkRow('code_24_regular', t('דף התוסף ב-GitHub'), t('קוד המקור, שינויים בכל גרסה, ומדריך למפתחים'), () => actions.openLink('homepage'), 'link-home'),
      linkRow('bug_24_regular', t('דיווח או הצעה ב-GitHub'), t('למי שיש חשבון GitHub; אפשר גם לדווח כאן למטה'), () => actions.openLink('issues'), 'link-issues'),
      linkRow('arrow_download_24_regular', t('הורדת הגרסה האחרונה'), t('המתקין של השירות ושל התוסף יחד'), () => actions.openLink('setup'), 'link-download'),
    );
  }

  function aboutTab(model, actions) {
    const report = model.report;
    const details = el('textarea', {
      class: 'report-text',
      dir: 'auto',
      rows: '5',
      // מה שמעבר לזה לא היה נשלח; התיבה אינה מקבלת אותו מלכתחילה.
      maxlength: String(Domain.MAX_REPORT_TEXT),
      'aria-label': t('תיאור הבעיה'),
      placeholder: t('מה ניסיתם לעשות, ומה קרה במקום?'),
      dataset: { focusKey: 'report-text' },
    });
    details.value = report.text;
    details.addEventListener('input', () => actions.editReport(details.value));
    return el(
      'div',
      { class: 'help-about' },
      el(
        'section',
        { class: 'about-card' },
        el('h3', { class: 'about-name' }, t('בר אילן באוצריא')),
        el(
          'p',
          { class: 'about-text' },
          t('חיפוש ספרי פרויקט השו"ת של בר אילן המותקן במחשב, ופתיחתם בבר אילן — מתוך אוצריא.'),
        ),
        el(
          'p',
          { class: 'about-meta' },
          t('גרסה {version} · מאת מיכאלוש', { version: model.pluginVersion || '—' }),
        ),
        el(
          'div',
          { class: 'help-actions' },
          button('text', t('מסך הפתיחה'), actions.openWelcome, {
            key: 'about-welcome',
            icon: 'hand_wave_24_regular',
          }),
        ),
      ),
      clarification(actions),
      linksCard(model, actions),
      el(
        'section',
        { class: 'report-card' },
        el('h3', { class: 'report-title' }, t('פנייה במייל')),
        el(
          'p',
          { class: 'report-hint' },
          t('לשאלות, להצעות ולדיווחים אפשר לכתוב גם ישירות למפתח:'),
        ),
        el(
          'p',
          { class: 'contact-email' },
          el('span', { class: 'contact-address', dir: 'ltr' }, Domain.SUPPORT_EMAIL),
          iconButton('copy_24_regular', t('העתקת הכתובת'), actions.copyEmail, { key: 'copy-email' }),
        ),
        has(model, 'feedback.send_email')
          ? el(
              'div',
              { class: 'help-actions' },
              button('text', t('כתיבת מייל'), actions.writeEmail, { key: 'write-email', icon: 'mail_24_regular' }),
            )
          : null,
      ),
      el(
        'section',
        { class: 'report-card' },
        el('h3', { class: 'report-title' }, t('דיווח על בעיה')),
        el(
          'p',
          { class: 'report-hint' },
          t('הדיווח נשלח למפתח דרך אוצריא, יחד עם פרטי המערכת, יומן הפעולות האחרונות (כולל חיפושים וספרים שנפתחו) ויומן השירות (מהדורות בר אילן שנמצאו ומיקומן). שם המשתמש מושמט מכל נתיב. לפני השליחה אוצריא מבקשת אישור.'),
        ),
        details,
        el(
          'div',
          { class: 'help-actions' },
          button('filled', t('שליחת דיווח'), actions.sendReport, {
            key: 'send-report',
            icon: 'send_24_regular',
            busy: report.sending,
            busyLabel: t('שולח…'),
            disabled: report.text.trim().length < 10,
          }),
          el(
            'span',
            { class: 'report-length', hidden: report.text.trim().length >= 10 },
            t('לפחות עשרה תווים'),
          ),
        ),
      ),
    );
  }

  function helpPage(model, actions) {
    const tabs = [
      { id: HelpTab.guide, label: t('איך משתמשים'), iconName: 'book_24_regular' },
      { id: HelpTab.troubleshoot, label: t('פתרון בעיות'), iconName: 'wrench_24_regular' },
      { id: HelpTab.status, label: t('מצב המערכת'), iconName: 'pulse_24_regular' },
      { id: HelpTab.about, label: t('אודות ודיווח'), iconName: 'info_24_regular' },
    ];
    const current = model.helpTab;
    const body =
      current === HelpTab.troubleshoot
        ? troubleshootTab(model)
        : current === HelpTab.status
          ? statusTab(model, actions)
          : current === HelpTab.about
            ? aboutTab(model, actions)
            : guideTab(model, actions);
    return el(
      'div',
      {},
      pageHeader('help-title', t('עזרה ותמיכה')),
      el(
        'div',
        { class: 'tabs secondary-tabs', role: 'tablist', 'aria-label': t('נושאי העזרה') },
        tabs.map((tab) =>
          el(
            'button',
            {
              type: 'button',
              class: 'tab',
              role: 'tab',
              id: 'help-tab-' + tab.id,
              'aria-selected': tab.id === current ? 'true' : 'false',
              'aria-controls': 'help-panel',
              tabindex: tab.id === current ? '0' : '-1',
              // בחלון צר מוצג רק האייקון, ואז זה השם היחיד של הכרטיסייה.
              title: tab.label,
              onclick: () => actions.openHelp(tab.id),
              dataset: { focusKey: 'help-tab-' + tab.id, tab: tab.id },
            },
            icon(tab.iconName),
            el('span', { class: 'tab-label' }, tab.label),
          ),
        ),
      ),
      el(
        'div',
        {
          class: 'page-body help-panel',
          id: 'help-panel',
          role: 'tabpanel',
          'aria-labelledby': 'help-tab-' + current,
          tabindex: '0',
          dataset: { focusKey: 'help-panel' },
        },
        body,
      ),
    );
  }

  const api = {
    HelpTab,
    SEARCH_SHORTCUT,
    segmented,
    switchRow,
    settingsPage,
    helpPage,
    welcomeDialog,
    statusFacts,
    statusText,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaPanels = api;
})(typeof self !== 'undefined' ? self : globalThis);
