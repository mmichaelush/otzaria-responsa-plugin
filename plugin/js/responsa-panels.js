// לוח ההגדרות (נפתח מהצד, כמו "הגדרות תצוגת הספרים" באוצריא) ודיאלוג העזרה
// והתמיכה. כמו responsa-ui.js: מודל ופעולות נכנסים, אלמנט יוצא, וטקסט רק
// דרך textContent.
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
   * בקר מקטעים של M3 (שפה): הנבחר ברקע משני ועם סימון. כמו radiogroup:
   * עצירת Tab אחת, וחצים בין האפשרויות.
   */
  function segmented(label, options, value, onSelect, keyPrefix) {
    const onKeydown = (event) => {
      const rtl = document.documentElement.dir !== 'ltr';
      const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, ArrowDown: 1, ArrowUp: -1 }[
        event.key
      ];
      if (!step) return;
      event.preventDefault();
      const index = options.findIndex((option) => option.value === value);
      onSelect(options[(index + step + options.length) % options.length].value);
    };
    return el(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': label, onkeydown: onKeydown },
      options.map((option) =>
        el(
          'button',
          {
            type: 'button',
            class: 'segment',
            role: 'radio',
            'aria-checked': option.value === value ? 'true' : 'false',
            tabindex: option.value === value ? '0' : '-1',
            onclick: () => onSelect(option.value),
            dataset: { focusKey: keyPrefix + option.value },
          },
          option.value === value ? icon('checkmark_24_regular', 'segment-check') : null,
          option.label,
        ),
      ),
    );
  }

  // ---------------------------------------------------------- הגדרות

  /** בלי תמיכה של אוצריא אין מה להציג: מתג שלא יכול לעבוד רק מבלבל. */
  function librarySearchRow(model, actions) {
    if (!Domain.hostSupportsLibrary(model.permissions)) return null;
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
      title: t('"חיפוש בבר אילן" בלחיצה ימנית'),
      subtitle: t('בספר פתוח: מסמנים מילה או משפט, לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן". בר אילן נפתח עם תוצאות החיפוש.'),
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
        t('כשהותקנה מהדורה חדשה של בר אילן, או כשספר מסוים לא נפתח. לוקח כחמש דקות, והרשימה הקיימת נשארת בשימוש עד שהחדשה מוכנה.'),
        button('tonal', t('קריאה מחדש'), actions.rebuild, {
          key: 'settings-rebuild',
          disabled:
            !model.status || !status.installed || model.buildActive || model.openingKey !== null,
        }),
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

  function backgroundRow(model) {
    const granted = has(model, 'app.run_on_startup');
    return infoRow(
      granted ? 'checkmark_circle_24_regular' : 'info_24_regular',
      granted ? t('עבודה ברקע: פעילה') : t('עבודה ברקע: כבויה'),
      granted
        ? t('חיפוש בלחיצה ימנית פועל בלי לעבור ללשונית התוסף.')
        : t('בלי ההרשאה "הפעלה ברקע לפי אירוע", חיפוש בלחיצה ימנית מעביר ללשונית התוסף. להפעלה: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "הפעלה ברקע לפי אירוע".'),
    );
  }

  function settingsSheet(model, actions) {
    const languages = [
      { value: 'auto', label: t('כמו באוצריא') },
      { value: 'he', label: 'עברית' },
      { value: 'en', label: 'English' },
    ];
    const shortcuts = shortcutRows(model, actions);
    return el(
      'div',
      { class: 'sheet-content' },
      header('settings-title', t('הגדרות בר אילן'), actions.closeSheet, 'close-sheet'),
      el(
        'div',
        { class: 'sheet-body' },
        section(
          t('שילוב באוצריא'),
          t('איפה עוד אפשר להגיע לספרי בר אילן, מלבד הלשונית הזו'),
          librarySearchRow(model, actions),
          contextMenuRow(model, actions),
          backgroundRow(model),
        ),
        section(
          t('שפה'),
          null,
          el(
            'div',
            { class: 'settings-row settings-row-stacked' },
            el(
              'span',
              { class: 'settings-row-texts' },
              el('span', { class: 'settings-row-title' }, t('שפת התוסף')),
            ),
            segmented(t('שפת התוסף'), languages, model.settings.language, actions.setLanguage, 'language-'),
          ),
        ),
        section(t('רשימת הספרים'), null, catalogRows(model, actions)),
        shortcuts.length ? section(t('קיצורי דרך'), null, shortcuts) : null,
        el(
          'div',
          { class: 'sheet-footer' },
          button('text', t('עזרה ותמיכה'), () => actions.openHelp(HelpTab.guide), {
            key: 'settings-help',
            icon: 'question_circle_24_regular',
          }),
        ),
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
          t('מתקינים את "שירות בר אילן לאוצריא": בלשונית הזו יש כפתור "הורדת המתקין". המתקין מוסיף לאוצריא גם את התוסף, ואינו דורש הרשאות מנהל.'),
          t('בהגדרות אוצריא ← כלים ← בר אילן מדליקים את "הוספת רכיבים לתוכנה" (בשביל החיפוש בלחיצה ימנית). מומלץ להדליק גם את "הפעלה ברקע לפי אירוע", כדי שהחיפוש לא יעביר אתכם ללשונית התוסף.'),
          t('בלשונית "בר אילן" לוחצים "התחלה", והתוסף קורא את רשימת הספרים (כחמש דקות).'),
        ],
        t('התוסף עובד גם בלי אינטרנט: הכול קורה במחשב שלכם.'),
      ),
      topic('search_24_regular', t('חיפוש ספר ופתיחתו'), [
        t('בלשונית "בר אילן" מקלידים שם ספר, שם מחבר, או שניהם יחד.'),
        t('לוחצים על "פתיחה בבר אילן" ליד הספר.'),
        t('בר אילן נפתח (או עולה לחזית) עם הספר, תוך שניות ספורות.'),
        t('הכפתור "פרטי הספר" שליד כל ספר מציג את המחבר, מקום ושנת ההדפסה, המהדורה ומיקום הספר בבר אילן.'),
      ]),
      library
        ? topic(
            'library_24_regular',
            t('ספרי בר אילן במסך הספרייה'),
            [
              t('במסך הספרייה של אוצריא מקלידים בתיבה "איתור ספר או מחבר".'),
              t('ספרי בר אילן מופיעים בין התוצאות, עם שורה "בר אילן" מתחת לשם.'),
              t('לחיצה על ספר כזה פותחת אותו בבר אילן.'),
            ],
            t('אפשר לכבות זאת בהגדרות התוסף.'),
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
          t('בפעם הראשונה התוסף קורא את רשימת הספרים מבר אילן — כחמש דקות, פעם אחת.'),
          t('בזמן הקריאה בר אילן עובד לבד: אל תלחצו בו ואל תסגרו אותו. אפשר להמשיך לעבוד באוצריא.'),
          t('אחרי התקנת מהדורה חדשה של בר אילן: הגדרות התוסף ← "קריאה מחדש".'),
        ],
      ),
      topic('settings_24_regular', t('הגדרות התוסף'), [
        t('כפתור ההגדרות שבראש הלשונית פותח את לוח ההגדרות מהצד.'),
        t('שם מדליקים או מכבים את החיפוש בלחיצה ימנית ואת ספרי בר אילן במסך הספרייה, בוחרים שפה (עברית או English), קוראים מחדש את רשימת הספרים ויוצרים קיצור דרך.'),
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
          t('מה שחסר מוסבר בלשונית עצמה, צעד אחר צעד. אפשר לחזור למסך הזה מ"עזרה ותמיכה" (סימן השאלה) ← "אודות ודיווח" ← "מסך הפתיחה".'),
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
      a: N('ייתכן שחלון בבר אילן ממתין לתשובה — עוברים לבר אילן וסוגרים אותו. אם זה חוזר בספר מסוים, קוראים את רשימת הספרים מחדש: הגדרות התוסף ← "קריאה מחדש".'),
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
      a: N('צריך לסמן טקסט לפני הלחיצה הימנית, והמתג בהגדרות התוסף צריך להיות דלוק. אם המתג לא זמין: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו את ההרשאות "הוספת רכיבים לתוכנה" ו"פריטים בתפריט הטקסט".'),
    },
    {
      q: N('בלחיצה ימנית נפתחת לשונית התוסף'),
      a: N('כך זה עובד כשההרשאה "הפעלה ברקע לפי אירוע" כבויה. כדי שהחיפוש יעבוד בלי לעזוב את הספר: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו את ההרשאה.'),
    },
    {
      q: N('ספרי בר אילן לא מופיעים בחיפוש הספרייה'),
      library: true,
      a: N('המתג בהגדרות התוסף צריך להיות דלוק, ורשימת הספרים צריכה להיקרא לפחות פעם אחת. מקלידים לפחות שלוש אותיות.'),
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
      [t('הוספת רכיבים לתוכנה'), yesNo(startup)],
      [t('עבודה ברקע'), yesNo(has(model, 'app.run_on_startup'))],
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
          el('dd', { dir: dir || null }, value),
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
                el('span', { class: 'log-message', dir: 'auto' }, entry.message),
                entry.detail ? el('span', { class: 'log-detail', dir: 'auto' }, entry.detail) : null,
              ),
            ),
          )
        : el('p', { class: 'help-tip' }, t('עוד לא נרשמו פעולות.')),
      el(
        'p',
        { class: 'help-tip' },
        t('"העתקת הפרטים" מעתיקה גם את יומן הפעולות, כדי לצרף אותו לפנייה.'),
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
      linkRow('arrow_download_24_regular', t('הורדת הגרסה האחרונה'), t('המתקין של השירות ושל התוסף יחד'), () => actions.openLink('releases'), 'link-download'),
    );
  }

  function aboutTab(model, actions) {
    const report = model.report;
    const details = el('textarea', {
      class: 'report-text',
      dir: 'auto',
      rows: '5',
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
        el('h3', { class: 'report-title' }, t('דיווח על בעיה')),
        el(
          'p',
          { class: 'report-hint' },
          t('הדיווח נשלח למפתח דרך אוצריא, יחד עם פרטי המערכת ויומן הפעולות האחרונות (בלי תוכן אישי ובלי נתיבים). לפני השליחה אוצריא מבקשת אישור.'),
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

  function helpDialog(model, actions) {
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
      { class: 'dialog-content' },
      header('help-title', t('עזרה ותמיכה'), actions.closeSheet, 'close-help'),
      el(
        'div',
        { class: 'tabs', role: 'tablist', 'aria-label': t('נושאי העזרה') },
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
          class: 'dialog-body',
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
    settingsSheet,
    helpDialog,
    welcomeDialog,
    statusFacts,
    statusText,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaPanels = api;
})(typeof self !== 'undefined' ? self : globalThis);
