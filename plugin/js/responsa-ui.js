// בניית ה-DOM של המסך הראשי. כל טקסט נכנס דרך textContent בלבד (לעולם לא
// innerHTML), כך ששמות ספרים מהקטלוג לא יכולים להזריק דבר לדף. אין כאן
// קריאות ל-SDK או החלטות: כל פונקציה מקבלת מודל ופעולות ומחזירה אלמנט.
//
// לכל כפתור יש `data-focus-key`, כדי שהתצוגה תחזיר אליו את הפוקוס אחרי שהוא
// נבנה מחדש; לכל שדה שמתעדכן בזמן בנייה יש `data-role`, כדי לעדכן אותו במקום.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const t = (text, vars) => I18n.t(text, vars);

  /** `el('p', {class: 'x'}, 'טקסט', child)` */
  function el(tag, attributes, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (name === 'class') node.className = value;
      else if (name === 'dataset') Object.assign(node.dataset, value);
      else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value === true ? '' : String(value));
    }
    append(node, children);
    return node;
  }

  /** רשימות מקוננות נפרשות: כך פונקציה יכולה להחזיר כמה שורות. */
  function append(node, children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(
        typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child,
      );
    }
  }

  function button(kind, label, onClick, options) {
    const opts = options || {};
    return el(
      'button',
      {
        type: 'button',
        class: 'button button-' + kind,
        onclick: onClick,
        disabled: opts.disabled || opts.busy,
        'aria-busy': opts.busy ? 'true' : null,
        dataset: opts.key ? { focusKey: opts.key } : undefined,
      },
      opts.busy ? el('span', { class: 'spinner', 'aria-hidden': 'true' }) : null,
      !opts.busy && opts.icon ? icon(opts.icon) : null,
      opts.busy && opts.busyLabel ? opts.busyLabel : label,
    );
  }

  function iconButton(iconName, label, onClick, options) {
    const opts = options || {};
    return el(
      'button',
      {
        type: 'button',
        class: 'icon-button' + (opts.className ? ' ' + opts.className : ''),
        'aria-label': label,
        title: label,
        'aria-expanded': opts.expanded === undefined ? null : String(Boolean(opts.expanded)),
        'aria-controls': opts.controls || null,
        onclick: onClick,
        dataset: opts.key ? { focusKey: opts.key } : undefined,
      },
      icon(iconName),
    );
  }

  function retryButton(model, actions) {
    return button('text', t('בדיקה חוזרת'), actions.retry, {
      key: 'retry',
      busy: model.checking,
      busyLabel: t('בודק…'),
    });
  }

  /** "קוד לתמיכה: timeout" — מה שצריך לצטט בפנייה, בלי להטריד את השאר. */
  function errorCodeLine(model) {
    return model.errorCode ? t('קוד לתמיכה: {code}', { code: model.errorCode }) : null;
  }

  function stateCard({ iconName, title, text, steps, actions, footnote, error, code }) {
    return el(
      'section',
      { class: 'state-card' + (error ? ' is-error' : '') },
      el('div', { class: 'state-icon' }, icon(iconName, 'icon-lg')),
      el('h2', { class: 'state-title', 'data-role': 'title' }, title),
      ...(Array.isArray(text) ? text : [text])
        .filter(Boolean)
        .map((line) => el('p', { class: 'state-text' }, line)),
      steps && steps.length
        ? el('ol', { class: 'state-steps' }, steps.map((s) => el('li', {}, s)))
        : null,
      actions && actions.length ? el('div', { class: 'state-actions' }, actions) : null,
      footnote ? el('p', { class: 'state-footnote' }, footnote) : null,
      code ? el('p', { class: 'state-code', dir: 'auto' }, code) : null,
    );
  }

  // ------------------------------------------------------------- מסכים

  function loadingView() {
    return el(
      'div',
      { class: 'page-spinner' },
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('span', { class: 'visually-hidden', 'data-role': 'title' }, t('מתחבר לשירות בר אילן…')),
    );
  }

  function unsupportedView() {
    return stateCard({
      iconName: 'warning_24_regular',
      title: t('התוסף פועל רק ב-Windows'),
      text: t('פרויקט השו"ת של בר אילן הוא תוכנה ל-Windows, ולכן גם התוסף פועל רק שם.'),
    });
  }

  function permissionDeniedView(model, actions) {
    return stateCard({
      iconName: 'settings_24_regular',
      title: t('התוסף צריך הרשאה'),
      text: t(
        'כדי לדבר עם הרכיב שמחבר את אוצריא לבר אילן, התוסף צריך את ההרשאה "גישה לשירותים מקומיים". היא לא פותחת גישה לאינטרנט.',
      ),
      steps: [
        t('באוצריא פתחו את ההגדרות, ואז "כלים".'),
        t('בחרו ב"בר אילן".'),
        t('הדליקו את "גישה לשירותים מקומיים".'),
      ],
      actions: [retryButton(model, actions)],
    });
  }

  function serviceMissingView(model, actions) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: t('צריך להתקין רכיב קטן, פעם אחת'),
      text: t(
        'כדי שאוצריא תוכל לעבוד עם תוכנת בר אילן, יש להתקין במחשב את "שירות בר אילן לאוצריא". ההתקנה לוקחת פחות מדקה ואינה דורשת הרשאות מנהל.',
      ),
      steps: [
        t('לחצו על "הורדת המתקין".'),
        t('פתחו את הקובץ שירד, לחצו "הבא" ובסוף "סיום".'),
        t('חזרו לכאן. המסך יתעדכן מעצמו.'),
      ],
      actions: [
        button('filled', t('הורדת המתקין'), actions.download, {
          key: 'download',
          icon: 'arrow_download_24_regular',
        }),
        retryButton(model, actions),
      ],
      footnote: [
        t('כבר התקנתם? ייתכן שהשירות לא פועל כרגע. הפעלה מחדש של המחשב תפעיל אותו.'),
        model.online === false
          ? t('אין כרגע חיבור לאינטרנט. אפשר להוריד את המתקין במחשב אחר, מדף ההורדות של התוסף ב-GitHub, ולהעביר אותו בדיסק און קי.')
          : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }

  function serviceErrorView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: t('השירות לא מגיב כרגע'),
      text: [model.message, t('אם זה חוזר, הפעלה מחדש של המחשב בדרך כלל פותרת את זה.')],
      actions: [retryButton(model, actions)],
      code: errorCodeLine(model),
    });
  }

  function outdatedView(model, actions, what) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: what === 'plugin' ? t('צריך לעדכן את התוסף') : t('צריך לעדכן את שירות בר אילן'),
      text: t('גרסת השירות שבמחשב וגרסת התוסף אינן מתאימות זו לזו. המתקין החדש מעדכן את שניהם.'),
      actions: [
        button('filled', t('הורדת הגרסה החדשה'), actions.download, {
          key: 'download',
          icon: 'arrow_download_24_regular',
        }),
        retryButton(model, actions),
      ],
    });
  }

  function portTakenView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: t('תוכנה אחרת תופסת את החיבור של השירות'),
      text: t(
        'תוכנה אחרת במחשב משתמשת בחיבור שהשירות צריך, ולכן השירות לא יכול לפעול. הפעלה מחדש של המחשב בדרך כלל פותרת זאת.',
      ),
      actions: [retryButton(model, actions)],
    });
  }

  function notInstalledView(model, actions) {
    return stateCard({
      iconName: 'library_24_regular',
      title: t('בר אילן לא נמצא במחשב'),
      text: t(
        'התוסף עובד עם תוכנת פרויקט השו"ת של בר אילן, ולא מצא אותה במחשב הזה. אחרי שתותקן, המסך יתעדכן מעצמו.',
      ),
      actions: [retryButton(model, actions)],
    });
  }

  function needsCatalogView(model, actions) {
    const version = model.status && model.status.version;
    return stateCard({
      iconName: 'library_24_regular',
      title: t('הכנה חד-פעמית'),
      text: [
        t('כדי להציג כאן את ספרי בר אילן, התוסף צריך לקרוא פעם אחת את רשימת הספרים מהתוכנה. זה לוקח כחמש דקות.'),
        t('בזמן הזה בר אילן ייפתח ויעבוד לבד. אל תלחצו בו ואל תסגרו אותו עד הסיום; אפשר להמשיך לעבוד באוצריא.'),
      ],
      actions: [button('filled', t('התחלה'), actions.startBuild, { key: 'start-build' })],
      footnote: version ? t('נמצא במחשב: פרויקט השו"ת, מהדורה {version}.', { version }) : null,
    });
  }

  function buildFailedView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: t('קריאת רשימת הספרים לא הושלמה'),
      text: [model.message, t('שום דבר לא נמחק. אפשר לנסות שוב.')],
      actions: [button('filled', t('ניסיון נוסף'), actions.startBuild, { key: 'start-build' })],
      code: errorCodeLine(model),
    });
  }

  // ------------------------------------------------------------- התקדמות

  /** סרגל ושורות התקדמות, עם `data-role` כדי ש-[updateProgress] יעדכן במקום. */
  function progressBlock() {
    return [
      el(
        'div',
        {
          class: 'progress',
          role: 'progressbar',
          'aria-label': t('התקדמות קריאת רשימת הספרים'),
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'data-role': 'track',
        },
        el('div', { class: 'progress-bar', 'data-role': 'bar' }),
      ),
      el(
        'div',
        { class: 'progress-lines' },
        el('span', { 'data-role': 'detail' }),
        el(
          'span',
          {},
          el('span', { class: 'progress-percent', 'data-role': 'percent' }),
          el('span', { 'data-role': 'remaining' }),
        ),
      ),
    ];
  }

  /** מעדכן במקום את כל שדות ההתקדמות שבתוך [container]. */
  function updateProgress(container, model) {
    const progress = Domain.buildProgress(model.progress, model.elapsedMs);
    const part = (role) => container.querySelector('[data-role="' + role + '"]');
    const set = (role, text) => {
      const node = part(role);
      if (node && node.textContent !== text) node.textContent = text;
    };
    set('label', progress.label);
    set('detail', progress.detail);
    set('percent', progress.percent === null ? '' : progress.percent + '%');
    set('remaining', progress.remaining ? ' · ' + progress.remaining : '');
    const track = part('track');
    const bar = part('bar');
    if (track && bar) {
      track.classList.toggle('is-indeterminate', progress.fraction === null);
      if (progress.fraction === null) {
        track.removeAttribute('aria-valuenow');
        bar.style.removeProperty('width');
      } else {
        track.setAttribute('aria-valuenow', String(progress.percent));
        bar.style.width = progress.percent + '%';
      }
    }
    const cancel = container.querySelector('[data-focus-key="cancel-build"]');
    if (cancel) setBusy(cancel, model.cancelling, t('מבטל…'), t('ביטול'));
  }

  /** מחליף מצב "עסוק" בכפתור קיים בלי לבנות אותו מחדש (והפוקוס נשאר). */
  function setBusy(node, busy, busyLabel, label) {
    const want = String(Boolean(busy));
    if (node.dataset.busy === want) return;
    node.dataset.busy = want;
    const refocus = !busy && node.dataset.refocus === 'true';
    if (busy && node.ownerDocument.activeElement === node) node.dataset.refocus = 'true';
    node.disabled = Boolean(busy);
    node.setAttribute('aria-busy', want);
    node.replaceChildren(
      ...(busy ? [el('span', { class: 'spinner', 'aria-hidden': 'true' })] : []),
      busy ? busyLabel : label,
    );
    if (refocus) {
      delete node.dataset.refocus;
      node.focus();
    }
  }

  function buildingView(model, actions) {
    const card = el(
      'section',
      { class: 'state-card' },
      el('div', { class: 'state-icon' }, icon('library_24_regular', 'icon-lg')),
      el('h2', { class: 'state-title', 'data-role': 'label' }),
      el(
        'p',
        { class: 'state-text' },
        t('בר אילן פתוח ועובד כרגע לבד. אל תלחצו בו ואל תסגרו אותו. אפשר להמשיך לעבוד באוצריא, וגם לסגור את הלשונית הזו: הקריאה תמשיך.'),
      ),
      progressBlock(),
      el(
        'div',
        { class: 'state-actions' },
        button('outlined', t('ביטול'), actions.cancelBuild, { key: 'cancel-build' }),
      ),
    );
    updateProgress(card, model);
    return card;
  }

  /** בנייה מחדש ברקע, מעל החיפוש. */
  function rebuildBanner(model, actions) {
    const banner = el(
      'section',
      { class: 'rebuild-banner' },
      el(
        'div',
        { class: 'rebuild-banner-row' },
        el(
          'span',
          { class: 'rebuild-banner-text' },
          t('קורא מחדש את רשימת הספרים. בינתיים החיפוש עובד על הרשימה הקיימת, ופתיחת ספרים תתאפשר בסיום.'),
        ),
        button('text', t('ביטול'), actions.cancelBuild, { key: 'cancel-build' }),
      ),
      progressBlock(),
    );
    updateProgress(banner, model);
    return banner;
  }

  // ------------------------------------------------------------- חיפוש

  /** תווית שדה החיפוש: בתוך קטגוריה החיפוש מצומצם אליה. */
  function searchLabel(model) {
    const name = canBrowse(model) ? Domain.scopeName(model.browse.path) : '';
    return name ? t('חיפוש בתוך "{name}"', { name: isolate(name) }) : t('חיפוש ספר או מחבר בבר אילן');
  }

  /** שם עברי בתוך משפט באנגלית (ולהפך): FSI…PDI שומרים על סדר המילים. */
  function isolate(text) {
    return '\u2068' + text + '\u2069';
  }

  function canBrowse(model) {
    return Domain.serviceCan(model.health, 'browse');
  }

  function readyView(model, actions) {
    const label = searchLabel(model);
    const input = el('input', {
      class: 'search-input',
      type: 'search',
      dir: 'auto',
      placeholder: label,
      'aria-label': label,
      autocomplete: 'off',
      spellcheck: 'false',
      dataset: { focusKey: 'search' },
    });
    input.value = model.query;
    input.addEventListener('input', () => actions.search(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') actions.search(input.value, { now: true });
      if (event.key === 'Escape' && input.value) {
        event.stopPropagation();
        input.value = '';
        actions.search('', { now: true });
      }
    });

    return el(
      'div',
      {},
      el('div', { class: 'banner-host' }, model.buildActive ? rebuildBanner(model, actions) : null),
      el('div', { class: 'notice-host' }, noticeView(model, actions)),
      el(
        'label',
        { class: 'search-bar' },
        icon('search_24_regular'),
        input,
        el('span', {
          class: 'spinner',
          'aria-hidden': 'true',
          hidden: !model.searching,
          'data-role': 'search-spinner',
        }),
      ),
      el('div', { class: 'activity-host' }, activityView(model)),
      el('div', { class: 'results-host' }, resultsBlock(model, actions)),
    );
  }

  /** "פותח…"/"מחפש…" כשפעולה מהספרייה או מתפריט הלחיצה הימנית הגיעה לדף. */
  function activityView(model) {
    const activity = model.activity;
    if (!activity) return null;
    const text =
      activity.kind === 'searching'
        ? t('מחפש בבר אילן: "{title}"…', { title: activity.title })
        : t('פותח בבר אילן: "{title}"…', { title: activity.title || t('הספר') });
    return el(
      'div',
      { class: 'activity', role: 'status' },
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('span', { class: 'activity-text' }, text),
    );
  }

  /** הערה מעל החיפוש, או `null`. בזמן בנייה מחדש אין מה להמליץ. */
  function noticeView(model, actions) {
    if (model.buildActive) return null;
    const service = Domain.serviceNotice(model.health);
    if (service) {
      return el(
        'div',
        { class: 'notice', dataset: { kind: service.kind } },
        icon('arrow_download_24_regular'),
        el('span', { class: 'notice-text' }, service.text),
        button('text', t('הורדת הגרסה החדשה'), actions.download, { key: 'notice-download' }),
      );
    }
    const notice = Domain.catalogNotice(model.status);
    if (!notice) return permissionNotice(model, actions);
    return el(
      'div',
      { class: 'notice', dataset: { kind: notice.kind } },
      icon('warning_24_regular'),
      el('span', { class: 'notice-text' }, notice.text),
      button('text', t('קריאה מחדש'), actions.rebuild, { key: 'notice-rebuild' }),
    );
  }

  /**
   * ההרשאה "הוספת רכיבים לתוכנה" כבויה: בלעדיה אין לחיצה ימנית ואין ספרים
   * בחיפוש הספרייה, ואוצריא מציעה אותה כבויה. המשתמש יכול לסגור את ההערה.
   */
  function permissionNotice(model, actions) {
    if (!Domain.lacksStartupPermission(model.permissions) || model.settings.startupNotice) {
      return null;
    }
    const text = Domain.hostSupportsLibrary(model.permissions)
      ? t('"חיפוש בבר אילן" בלחיצה ימנית, וספרי בר אילן בחיפוש הספרייה, דורשים הרשאה אחת שכבויה עכשיו.')
      : t('"חיפוש בבר אילן" בלחיצה ימנית דורש הרשאה אחת שכבויה עכשיו.');
    return el(
      'div',
      { class: 'notice', dataset: { kind: 'startupPermission' } },
      icon('info_24_regular'),
      el('span', { class: 'notice-text' }, text + ' ' + Domain.startupPermissionHint()),
      button('text', t('לא להציג שוב'), actions.dismissStartupNotice, {
        key: 'dismiss-startup-notice',
      }),
    );
  }

  function resultsBlock(model, actions) {
    if (!model.query.trim() && canBrowse(model)) return browseView(model, actions);
    if (!model.query.trim()) {
      return el(
        'div',
        { class: 'empty' },
        icon('document_search_24_regular'),
        el(
          'p',
          {},
          t('אפשר לחפש לפי שם הספר, שם המחבר, או שניהם יחד. למשל: אבני נזר, מהרש"א, רא"ש יבמות.'),
        ),
      );
    }
    if (model.searchError) {
      return el('div', { class: 'empty' }, icon('warning_24_regular'), el('p', {}, model.searchError));
    }
    if (model.results === null) return null;
    if (model.results.length === 0) {
      return el(
        'div',
        { class: 'empty' },
        icon('search_info_24_regular'),
        el('p', {}, t('לא נמצאו ספרים. אפשר לנסות מילה אחרת, או רק חלק מהשם.')),
        canBrowse(model) && model.browse.path
          ? button('tonal', t('חיפוש בכל הספרים'), actions.searchEverywhere, { key: 'search-everywhere' })
          : null,
      );
    }
    const scope = canBrowse(model) ? Domain.scopeName(model.browse.path) : '';
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'results-header' },
        el(
          'span',
          {},
          scope
            ? t('{found} בתוך "{name}"', { found: Domain.foundLabel(model.total), name: isolate(scope) })
            : Domain.foundLabel(model.total),
        ),
        scope
          ? button('text', t('חיפוש בכל הספרים'), actions.searchEverywhere, { key: 'search-everywhere' })
          : null,
      ),
      el(
        'ul',
        { class: 'results', 'aria-label': t('תוצאות החיפוש') },
        model.results.map((book) => resultItem(book, model, actions)),
      ),
      model.results.length < model.total
        ? el(
            'div',
            { class: 'load-more' },
            button('text', t('עוד תוצאות'), actions.loadMore, {
              key: 'load-more',
              busy: model.loadingMore,
              busyLabel: t('טוען…'),
            }),
          )
        : null,
    );
  }

  /** הסמל של בר אילן מההתקנה שבמחשב: "הספר הזה ייפתח בבר אילן". */
  function responsaIcon(model) {
    if (!model.responsaIcon) return null;
    return el('img', { class: 'responsa-icon', src: model.responsaIcon, alt: '', 'aria-hidden': 'true' });
  }

  // ------------------------------------------------------------- עיון

  /**
   * עיון בעץ של בר אילן: שורת הנתיב, תתי-הקטגוריות (עם מספר הספרים) והספרים
   * שבקטגוריה. הקטגוריה היא גם תחום החיפוש שבשדה למעלה.
   */
  function browseView(model, actions) {
    const browse = model.browse;
    const level = browse.level && browse.level.path === browse.path ? browse.level : null;
    const name = Domain.scopeName(browse.path);
    const crumbs = Domain.breadcrumbs(browse.path);
    return el(
      'section',
      { class: 'browse', 'aria-labelledby': 'browse-heading' },
      browse.path
        ? el(
            'nav',
            { class: 'breadcrumbs', 'aria-label': t('מיקום בעץ של בר אילן') },
            el(
              'ol',
              {},
              crumbs.map((crumb, index) =>
                el(
                  'li',
                  {},
                  index > 0 ? icon('chevron_left_24_regular', 'breadcrumb-separator') : null,
                  index === crumbs.length - 1
                    ? el('span', { class: 'breadcrumb', 'aria-current': 'location' }, el('bdi', {}, crumb.name))
                    : el(
                        'button',
                        {
                          type: 'button',
                          class: 'breadcrumb',
                          onclick: () => actions.browseTo(crumb.path),
                          dataset: { focusKey: 'crumb-' + index },
                        },
                        index === 0 ? icon('home_24_regular') : null,
                        el('bdi', {}, crumb.name),
                      ),
                ),
              ),
            ),
          )
        : null,
      el(
        'div',
        { class: 'browse-title' },
        el(
          'h2',
          { class: 'browse-heading', id: 'browse-heading', tabindex: '-1' },
          el('bdi', {}, name || t('הספרייה של בר אילן')),
        ),
        browse.loading ? el('span', { class: 'spinner', 'aria-hidden': 'true' }) : null,
      ),
      browse.path
        ? null
        : el(
            'p',
            { class: 'browse-hint' },
            t('בוחרים קטגוריה, או מחפשים לפי שם הספר, שם המחבר, או שניהם יחד. למשל: אבני נזר, מהרש"א, רא"ש יבמות.'),
          ),
      browse.error
        ? el(
            'div',
            { class: 'empty' },
            icon('warning_24_regular'),
            el('p', {}, browse.error),
            button('tonal', t('ניסיון נוסף'), () => actions.browseTo(browse.path), { key: 'browse-retry' }),
          )
        : null,
      level ? browseLevel(level, model, actions) : null,
    );
  }

  function browseLevel(level, model, actions) {
    const categories = level.categories || [];
    const books = level.books || [];
    return [
      categories.length
        ? el(
            'ul',
            { class: 'browse-list', 'aria-label': t('קטגוריות') },
            categories.map((category, index) =>
              el(
                'li',
                {},
                el(
                  'button',
                  {
                    type: 'button',
                    class: 'browse-row',
                    onclick: () => actions.browseTo(category.path),
                    dataset: { focusKey: 'category-' + index },
                  },
                  icon('folder_24_regular', 'browse-row-icon'),
                  el('span', { class: 'browse-row-name' }, el('bdi', {}, category.name)),
                  el('span', { class: 'browse-row-count' }, Domain.booksLabel(category.bookCount)),
                  icon('chevron_left_24_regular', 'browse-row-chevron'),
                ),
              ),
            ),
          )
        : null,
      books.length
        ? el(
            'div',
            {},
            el('div', { class: 'results-header' }, el('span', {}, Domain.booksLabel(books.length))),
            el(
              'ul',
              { class: 'results', 'aria-label': t('ספרים בקטגוריה') },
              books.map((book) => resultItem(book, model, actions)),
            ),
          )
        : null,
    ];
  }

  function resultItem(book, model, actions) {
    const meta = Domain.bookMeta(book);
    const context = Domain.bookContext(book);
    const opening = model.openingKey === book.key;
    const expanded = model.expandedKey === book.key;
    const detailsId = 'details-' + book.key;
    return el(
      'li',
      { class: 'result' + (expanded ? ' is-expanded' : '') },
      el(
        'div',
        { class: 'result-row' },
        el(
          'div',
          { class: 'result-body' },
          // שמות מהקטלוג בעברית, גם כשהדף באנגלית: הכיוון לפי הטקסט עצמו.
          el('h3', { class: 'result-title' }, responsaIcon(model), el('bdi', {}, book.title)),
          meta ? el('div', { class: 'result-meta' }, el('bdi', {}, meta)) : null,
          context
            ? el('div', { class: 'result-context', title: context, dir: 'auto' }, context)
            : null,
        ),
        el(
          'div',
          { class: 'result-actions' },
          iconButton('book_information_24_regular', t('פרטי הספר'), () => actions.toggleDetails(book.key), {
            key: 'details-' + book.key,
            className: 'details-toggle',
            expanded,
            controls: expanded ? detailsId : null,
          }),
          button('tonal', t('פתיחה בבר אילן'), () => actions.open(book), {
            key: 'open-' + book.key,
            icon: 'open_24_regular',
            busy: opening,
            busyLabel: t('פותח…'),
            // בזמן קריאת הרשימה בר אילן תפוס; השירות היה מחזיר "עסוק".
            disabled: model.buildActive || (model.openingKey !== null && !opening),
          }),
        ),
      ),
      expanded ? bookDetailsView(book, detailsId) : null,
    );
  }

  /** הפרטים המלאים שבקטלוג, מתחת לשורה. */
  function bookDetailsView(book, id) {
    return el(
      'dl',
      { class: 'result-details', id, 'aria-label': t('פרטי הספר') },
      Domain.bookDetails(book).map(({ label, value }) => [
        el('dt', {}, label),
        // <bdi> מבודד את כיוון הערך (שם עברי בממשק באנגלית, או מספר בעברית),
        // והשורה עצמה נשארת מיושרת לצד של התווית.
        el('dd', {}, el('bdi', {}, value)),
      ]),
    );
  }

  /** המסך המלא לפי `model.screen`. */
  function screenView(model, actions) {
    const S = Domain.Screen;
    switch (model.screen) {
      case S.unsupported:
        return unsupportedView();
      case S.permissionDenied:
        return permissionDeniedView(model, actions);
      case S.serviceMissing:
        return serviceMissingView(model, actions);
      case S.serviceError:
        return serviceErrorView(model, actions);
      case S.serviceOutdated:
        return outdatedView(model, actions, 'service');
      case S.pluginOutdated:
        return outdatedView(model, actions, 'plugin');
      case S.portTaken:
        return portTakenView(model, actions);
      case S.notInstalled:
        return notInstalledView(model, actions);
      case S.needsCatalog:
        return needsCatalogView(model, actions);
      case S.building:
        return buildingView(model, actions);
      case S.buildFailed:
        return buildFailedView(model, actions);
      case S.ready:
        return readyView(model, actions);
      default:
        return loadingView();
    }
  }

  const api = {
    el,
    button,
    iconButton,
    setBusy,
    screenView,
    readyView,
    resultsBlock,
    searchLabel,
    noticeView,
    activityView,
    rebuildBanner,
    updateProgress,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
