// בניית ה-DOM. כל טקסט נכנס דרך textContent בלבד (לעולם לא innerHTML), כך
// ששמות ספרים מהקטלוג לא יכולים להזריק דבר לדף. אין כאן קריאות ל-SDK או
// החלטות: כל פונקציה מקבלת מודל ופעולות ומחזירה אלמנט.
//
// לכל כפתור יש `data-focus-key`, כדי שהתצוגה תחזיר אליו את הפוקוס אחרי שהוא
// נבנה מחדש; לכל שדה שמתעדכן בזמן בנייה יש `data-role`, כדי לעדכן אותו במקום.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const { icon } = root.ResponsaIcons;

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

  function append(node, children) {
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(
        typeof child === 'string' ? document.createTextNode(child) : child,
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

  function retryButton(model, actions) {
    return button('text', 'בדיקה חוזרת', actions.retry, {
      key: 'retry',
      busy: model.checking,
      busyLabel: 'בודק…',
    });
  }

  function stateCard({ iconName, title, text, steps, actions, footnote, error }) {
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
      actions && actions.length
        ? el('div', { class: 'state-actions' }, actions)
        : null,
      footnote ? el('p', { class: 'state-footnote' }, footnote) : null,
    );
  }

  // ------------------------------------------------------------- מסכים

  function loadingView() {
    return el(
      'div',
      { class: 'page-spinner' },
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('span', { class: 'visually-hidden', 'data-role': 'title' }, 'מתחבר לשירות בר אילן…'),
    );
  }

  function unsupportedView() {
    return stateCard({
      iconName: 'warning_24_regular',
      title: 'התוסף פועל רק ב-Windows',
      text: 'פרויקט השו"ת של בר אילן הוא תוכנה ל-Windows, ולכן גם התוסף פועל רק שם.',
    });
  }

  function permissionDeniedView(model, actions) {
    return stateCard({
      iconName: 'settings_24_regular',
      title: 'התוסף צריך הרשאה',
      text:
        'כדי לדבר עם הרכיב שמחבר את אוצריא לבר אילן, התוסף צריך את ההרשאה ' +
        '"גישה לשירותים מקומיים". היא לא פותחת גישה לאינטרנט.',
      steps: [
        'באוצריא פתחו את ההגדרות, ואז "ניהול תוספים".',
        'בחרו ב"בר אילן".',
        'הדליקו את "גישה לשירותים מקומיים".',
      ],
      actions: [retryButton(model, actions)],
    });
  }

  function serviceMissingView(model, actions) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: 'צריך להתקין רכיב קטן, פעם אחת',
      text:
        'כדי שאוצריא תוכל לעבוד עם תוכנת בר אילן, יש להתקין במחשב את ' +
        '"שירות בר אילן לאוצריא". ההתקנה לוקחת פחות מדקה ואינה דורשת הרשאות מנהל.',
      steps: [
        'לחצו על "הורדת המתקין".',
        'פתחו את הקובץ שירד, לחצו "הבא" ובסוף "סיום".',
        'חזרו לכאן. המסך יתעדכן מעצמו.',
      ],
      actions: [
        button('filled', 'הורדת המתקין', actions.download, {
          key: 'download',
          icon: 'arrow_download_24_regular',
        }),
        retryButton(model, actions),
      ],
      footnote:
        'כבר התקנתם? ייתכן שהשירות לא פועל כרגע. הפעלה מחדש של המחשב תפעיל אותו.',
    });
  }

  function serviceErrorView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: 'השירות לא מגיב כרגע',
      text: [
        model.message,
        'אם זה חוזר, הפעלה מחדש של המחשב בדרך כלל פותרת את זה.',
      ],
      actions: [retryButton(model, actions)],
    });
  }

  function outdatedView(model, actions, what) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: what === 'plugin' ? 'צריך לעדכן את התוסף' : 'צריך לעדכן את שירות בר אילן',
      text:
        'גרסת השירות שבמחשב וגרסת התוסף אינן מתאימות זו לזו. המתקין החדש ' +
        'מעדכן את שניהם.',
      actions: [
        button('filled', 'הורדת הגרסה החדשה', actions.download, {
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
      title: 'תוכנה אחרת תופסת את החיבור של השירות',
      text:
        'תוכנה אחרת במחשב משתמשת בחיבור שהשירות צריך, ולכן השירות לא יכול ' +
        'לפעול. הפעלה מחדש של המחשב בדרך כלל פותרת זאת.',
      actions: [retryButton(model, actions)],
    });
  }

  function notInstalledView(model, actions) {
    return stateCard({
      iconName: 'library_24_regular',
      title: 'בר אילן לא נמצא במחשב',
      text:
        'התוסף עובד עם תוכנת פרויקט השו"ת של בר אילן, ולא מצא אותה במחשב ' +
        'הזה. אחרי שתותקן, המסך יתעדכן מעצמו.',
      actions: [retryButton(model, actions)],
    });
  }

  function needsCatalogView(model, actions) {
    const version = model.status && model.status.version;
    return stateCard({
      iconName: 'library_24_regular',
      title: 'הכנה חד-פעמית',
      text: [
        'כדי להציג כאן את ספרי בר אילן, התוסף צריך לקרוא פעם אחת את רשימת ' +
          'הספרים מהתוכנה. זה לוקח כחמש דקות.',
        'בזמן הזה בר אילן ייפתח ויעבוד לבד. אין צורך לגעת בו, ואפשר להמשיך ' +
          'לעבוד באוצריא.',
      ],
      actions: [
        button('filled', 'התחלה', actions.startBuild, { key: 'start-build' }),
      ],
      footnote: version ? 'נמצא במחשב: פרויקט השו"ת, מהדורה ' + version + '.' : null,
    });
  }

  function buildFailedView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: 'קריאת רשימת הספרים לא הושלמה',
      text: [model.message, 'שום דבר לא נמחק. אפשר לנסות שוב.'],
      actions: [
        button('filled', 'ניסיון נוסף', actions.startBuild, { key: 'start-build' }),
      ],
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
          'aria-label': 'התקדמות קריאת רשימת הספרים',
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
    if (cancel) setBusy(cancel, model.cancelling, 'מבטל…', 'ביטול');
  }

  /** מחליף מצב "עסוק" בכפתור קיים בלי לבנות אותו מחדש (והפוקוס נשאר). */
  function setBusy(node, busy, busyLabel, label) {
    const want = String(Boolean(busy));
    if (node.dataset.busy === want) return;
    node.dataset.busy = want;
    node.disabled = Boolean(busy);
    node.setAttribute('aria-busy', want);
    node.replaceChildren(
      ...(busy ? [el('span', { class: 'spinner', 'aria-hidden': 'true' })] : []),
      busy ? busyLabel : label,
    );
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
        'בר אילן פתוח ועובד כרגע לבד. אין צורך לגעת בו. אפשר להמשיך לעבוד ' +
          'באוצריא, וגם לסגור את הלשונית הזו: הקריאה תמשיך.',
      ),
      progressBlock(),
      el(
        'div',
        { class: 'state-actions' },
        button('outlined', 'ביטול', actions.cancelBuild, { key: 'cancel-build' }),
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
          'קורא מחדש את רשימת הספרים. בינתיים החיפוש עובד על הרשימה הקיימת, ' +
            'ופתיחת ספרים תתאפשר בסיום.',
        ),
        button('text', 'ביטול', actions.cancelBuild, { key: 'cancel-build' }),
      ),
      progressBlock(),
    );
    updateProgress(banner, model);
    return banner;
  }

  // ------------------------------------------------------------- חיפוש

  function readyView(model, actions) {
    const input = el('input', {
      class: 'search-input',
      type: 'search',
      placeholder: 'חיפוש ספר או מחבר בבר אילן',
      'aria-label': 'חיפוש ספר או מחבר בבר אילן',
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
      el(
        'div',
        { class: 'banner-host' },
        model.buildActive ? rebuildBanner(model, actions) : null,
      ),
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
      el('div', { class: 'results-host' }, resultsBlock(model, actions)),
    );
  }

  /** הערה מעל החיפוש, או `null`. בזמן בנייה מחדש אין מה להמליץ. */
  function noticeView(model, actions) {
    if (model.buildActive) return null;
    const notice = Domain.catalogNotice(model.status);
    if (!notice) return null;
    return el(
      'div',
      { class: 'notice', dataset: { kind: notice.kind } },
      icon('warning_24_regular'),
      el('span', { class: 'notice-text' }, notice.text),
      button('text', 'בנייה מחדש', actions.rebuild, { key: 'notice-rebuild' }),
    );
  }

  function resultsBlock(model, actions) {
    if (!model.query.trim()) {
      return el(
        'div',
        { class: 'empty' },
        icon('document_search_24_regular'),
        el(
          'p',
          {},
          'אפשר לחפש לפי שם הספר, שם המחבר, או שניהם יחד. למשל: אבני נזר, ' +
            'מהרש"א, רא"ש יבמות.',
        ),
      );
    }
    if (model.searchError) {
      return el(
        'div',
        { class: 'empty' },
        icon('warning_24_regular'),
        el('p', {}, model.searchError),
      );
    }
    if (model.results === null) return null;
    if (model.results.length === 0) {
      return el(
        'div',
        { class: 'empty' },
        icon('search_info_24_regular'),
        el('p', {}, 'לא נמצאו ספרים. אפשר לנסות מילה אחרת, או רק חלק מהשם.'),
      );
    }
    return el(
      'div',
      {},
      el('div', { class: 'results-header' }, el('span', {}, Domain.foundLabel(model.total))),
      el(
        'ul',
        { class: 'results', 'aria-label': 'תוצאות החיפוש' },
        model.results.map((book) => resultItem(book, model, actions)),
      ),
      model.results.length < model.total
        ? el(
            'div',
            { class: 'load-more' },
            button('text', 'עוד תוצאות', actions.loadMore, {
              key: 'load-more',
              busy: model.loadingMore,
              busyLabel: 'טוען…',
            }),
          )
        : null,
    );
  }

  function resultItem(book, model, actions) {
    const meta = Domain.bookMeta(book);
    const context = Domain.bookContext(book);
    const opening = model.openingKey === book.key;
    return el(
      'li',
      { class: 'result' },
      el(
        'div',
        { class: 'result-body' },
        el('h3', { class: 'result-title' }, book.title),
        meta ? el('div', { class: 'result-meta' }, meta) : null,
        context ? el('div', { class: 'result-context', title: context }, context) : null,
      ),
      button('tonal', 'פתיחה בבר אילן', () => actions.open(book), {
        key: 'open-' + book.key,
        icon: 'open_24_regular',
        busy: opening,
        busyLabel: 'פותח…',
        // בזמן קריאת הרשימה בר אילן תפוס; השירות היה מחזיר "עסוק".
        disabled: model.buildActive || (model.openingKey !== null && !opening),
      }),
    );
  }

  // ------------------------------------------------------------- לוח מידע

  function infoPanel(model, actions) {
    const status = model.status;
    const catalog = (status && status.catalog) || {};
    const unknown = 'לא ידוע';
    const facts = [];
    const fact = (label, value, options) => {
      if (!value) return;
      // נתיב Windows הוא טקסט משמאל לימין; בלי dir הוא נשבר בתוך עברית.
      const dir = options && options.ltr ? 'ltr' : null;
      facts.push(el('dt', {}, label), el('dd', { dir }, value));
    };
    fact(
      'בר אילן',
      !status
        ? unknown
        : status.installed
          ? 'מותקן' + (status.version ? ', מהדורה ' + status.version : '')
          : 'לא נמצא',
    );
    fact('מיקום', status && status.installPath, { ltr: true });
    fact(
      'ספרים ברשימה',
      !status
        ? unknown
        : catalog.exists
          ? Domain.formatCount(catalog.bookCount)
          : 'עוד לא נקראה',
    );
    fact('הרשימה נקראה', Domain.formatBuiltAt(catalog.builtAt));
    fact('גרסת השירות', model.health && model.health.serverVersion);
    fact('גרסת התוסף', model.pluginVersion);

    return el(
      'div',
      {},
      el(
        'div',
        { class: 'panel-header' },
        el('h2', { class: 'panel-title', id: 'info-title' }, 'מידע וניהול'),
        el(
          'button',
          {
            type: 'button',
            class: 'icon-button',
            'aria-label': 'סגירה',
            onclick: actions.closeInfo,
            dataset: { focusKey: 'close-info' },
          },
          icon('dismiss_24_regular'),
        ),
      ),
      el(
        'section',
        { class: 'panel-section' },
        el('h3', { class: 'panel-section-title' }, 'מצב'),
        el('dl', { class: 'facts' }, facts),
      ),
      el(
        'section',
        { class: 'panel-section' },
        el('h3', { class: 'panel-section-title' }, 'רשימת הספרים'),
        el(
          'p',
          { class: 'panel-text' },
          'אם הותקנה מהדורה חדשה של בר אילן, או שספר מסוים לא נפתח, אפשר ' +
            'לקרוא מחדש את רשימת הספרים. זה לוקח כחמש דקות, והרשימה הקיימת ' +
            'נשארת בשימוש עד שהחדשה מוכנה.',
        ),
        el(
          'div',
          { class: 'panel-actions' },
          button('tonal', 'בנייה מחדש', actions.rebuild, {
            key: 'panel-rebuild',
            disabled:
              !status ||
              !status.installed ||
              model.buildActive ||
              model.openingKey !== null,
          }),
        ),
      ),
      el(
        'section',
        { class: 'panel-section' },
        el('h3', { class: 'panel-section-title' }, 'עזרה'),
        el(
          'p',
          { class: 'panel-text' },
          'מדריך שימוש מלא, ופתרון לבעיות נפוצות, נמצאים באתר התוסף.',
        ),
        el(
          'div',
          { class: 'panel-actions' },
          button('text', 'מדריך למשתמש', actions.openGuide, {
            key: 'guide',
            icon: 'book_24_regular',
          }),
        ),
      ),
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
    setBusy,
    screenView,
    readyView,
    resultsBlock,
    noticeView,
    rebuildBanner,
    updateProgress,
    infoPanel,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
