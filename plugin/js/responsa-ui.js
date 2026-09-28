// בניית ה-DOM. כל טקסט נכנס דרך textContent בלבד (לעולם לא innerHTML), כך
// ששמות ספרים מהקטלוג לא יכולים להזריק דבר לדף. אין כאן קריאות ל-SDK או
// החלטות: כל פונקציה מקבלת מודל ופעולות ומחזירה אלמנט.
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
        disabled: opts.disabled,
        'aria-busy': opts.busy ? 'true' : null,
      },
      opts.busy ? el('span', { class: 'spinner', 'aria-hidden': 'true' }) : null,
      !opts.busy && opts.icon ? icon(opts.icon) : null,
      opts.busy && opts.busyLabel ? opts.busyLabel : label,
    );
  }

  function stateCard({ iconName, title, text, steps, actions, footnote, error }) {
    return el(
      'section',
      { class: 'state-card' + (error ? ' is-error' : ''), role: 'status' },
      el('div', { class: 'state-icon' }, icon(iconName, 'icon-lg')),
      el('h2', { class: 'state-title' }, title),
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
      { class: 'page-spinner', role: 'status' },
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('span', { class: 'visually-hidden' }, 'מתחבר לשירות בר אילן…'),
    );
  }

  function unsupportedView() {
    return stateCard({
      iconName: 'warning_24_regular',
      title: 'התוסף פועל רק ב-Windows',
      text: 'פרויקט השו"ת של בר אילן הוא תוכנה ל-Windows, ולכן גם התוסף פועל רק שם.',
    });
  }

  function serviceMissingView(actions) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: 'צריך להתקין רכיב קטן, פעם אחת',
      text:
        'כדי שאוצריא תוכל לעבוד עם תוכנת בר אילן, יש להתקין במחשב את ' +
        '"שירות בר אילן לאוצריא". ההתקנה לוקחת פחות מדקה ואינה דורשת הרשאות מנהל.',
      steps: [
        'לחצו על "הורדת המתקין".',
        'פתחו את הקובץ שירד, ולחצו "התקן".',
        'חזרו לכאן. המסך יתעדכן מעצמו.',
      ],
      actions: [
        button('filled', 'הורדת המתקין', actions.download, {
          icon: 'arrow_download_24_regular',
        }),
        button('text', 'בדיקה חוזרת', actions.retry),
      ],
      footnote:
        'כבר התקנתם? ייתכן שהשירות לא פועל כרגע. הפעלה מחדש של המחשב תפעיל אותו.',
    });
  }

  function serviceOutdatedView(actions) {
    return stateCard({
      iconName: 'arrow_download_24_regular',
      title: 'צריך לעדכן את שירות בר אילן',
      text:
        'גרסת השירות שמותקנת במחשב אינה מתאימה לגרסת התוסף. יש להוריד ' +
        'ולהתקין את הגרסה החדשה; ההתקנה מעדכנת את הקיימת.',
      actions: [
        button('filled', 'הורדת הגרסה החדשה', actions.download, {
          icon: 'arrow_download_24_regular',
        }),
        button('text', 'בדיקה חוזרת', actions.retry),
      ],
    });
  }

  function portTakenView(actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: 'תוכנה אחרת תופסת את החיבור של השירות',
      text:
        'תוכנה אחרת במחשב משתמשת בחיבור שהשירות צריך (פורט 39700), ולכן ' +
        'השירות לא יכול לפעול. סגירת אותה תוכנה, או הפעלה מחדש של המחשב, ' +
        'בדרך כלל פותרת זאת.',
      actions: [button('tonal', 'בדיקה חוזרת', actions.retry)],
    });
  }

  function notInstalledView(actions) {
    return stateCard({
      iconName: 'library_24_regular',
      title: 'בר אילן לא נמצא במחשב',
      text:
        'התוסף עובד עם תוכנת פרויקט השו"ת של בר אילן, ולא מצא אותה במחשב ' +
        'הזה. אחרי שתותקן, המסך יתעדכן מעצמו.',
      actions: [button('text', 'בדיקה חוזרת', actions.retry)],
    });
  }

  function needsCatalogView(model, actions) {
    return stateCard({
      iconName: 'library_24_regular',
      title: 'הכנה חד-פעמית',
      text: [
        'כדי להציג כאן את ספרי בר אילן, התוסף צריך לקרוא פעם אחת את רשימת ' +
          'הספרים מהתוכנה. זה לוקח כחמש דקות.',
        'בזמן הזה בר אילן ייפתח ויעבוד לבד. אין צורך לגעת בו, ואפשר להמשיך ' +
          'לעבוד באוצריא.',
      ],
      actions: [button('filled', 'התחלה', actions.startBuild)],
      footnote: model.version
        ? 'נמצא במחשב: פרויקט השו"ת, מהדורה ' + model.version + '.'
        : null,
    });
  }

  function progressTrack(progress) {
    const bar = el('div', { class: 'progress-bar' });
    if (progress.fraction !== null) bar.style.width = progress.percent + '%';
    return el(
      'div',
      {
        class: 'progress' + (progress.fraction === null ? ' is-indeterminate' : ''),
        role: 'progressbar',
        'aria-label': 'התקדמות קריאת רשימת הספרים',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': progress.percent === null ? null : String(progress.percent),
      },
      bar,
    );
  }

  function progressLines(progress) {
    return el(
      'div',
      { class: 'progress-lines' },
      el('span', {}, progress.detail),
      el(
        'span',
        {},
        progress.percent === null
          ? null
          : el('span', { class: 'progress-percent' }, progress.percent + '%'),
        progress.remaining ? ' · ' + progress.remaining : '',
      ),
    );
  }

  function buildingView(model, actions) {
    const progress = Domain.buildProgress(model.progress, model.elapsedMs);
    const track = progressTrack(progress);
    const card = stateCard({
      iconName: 'library_24_regular',
      title: progress.label,
      text:
        'בר אילן פתוח ועובד כרגע לבד. אין צורך לגעת בו. אפשר להמשיך לעבוד ' +
        'באוצריא, וגם לסגור את הלשונית הזו: הקריאה תמשיך.',
      actions: [
        button('outlined', 'ביטול', actions.cancelBuild, {
          busy: model.cancelling,
          busyLabel: 'מבטל…',
        }),
      ],
    });
    const lines = progressLines(progress);
    card.insertBefore(lines, card.querySelector('.state-actions'));
    card.insertBefore(track, lines);
    return card;
  }

  function buildFailedView(model, actions) {
    return stateCard({
      iconName: 'warning_24_regular',
      error: true,
      title: 'קריאת רשימת הספרים לא הושלמה',
      text: [model.message, 'שום דבר לא נמחק. אפשר לנסות שוב.'],
      actions: [button('filled', 'ניסיון נוסף', actions.startBuild)],
    });
  }

  function readyView(model, actions) {
    const input = el('input', {
      class: 'search-input',
      type: 'search',
      placeholder: 'חיפוש ספר או מחבר בבר אילן',
      'aria-label': 'חיפוש ספר או מחבר בבר אילן',
      autocomplete: 'off',
      spellcheck: 'false',
      value: model.query,
    });
    input.value = model.query;
    input.addEventListener('input', () => actions.search(input.value));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') actions.search(input.value, { now: true });
      if (event.key === 'Escape' && input.value) {
        input.value = '';
        actions.search('', { now: true });
      }
    });

    const notice = model.buildActive ? null : Domain.catalogNotice(model.status);
    return el(
      'div',
      {},
      el('div', { class: 'banner-host' }, rebuildBanner(model, actions)),
      notice
        ? el(
            'div',
            { class: 'notice', role: 'note' },
            icon('warning_24_regular'),
            el('span', { class: 'notice-text' }, notice.text),
            button('text', 'בנייה מחדש', actions.rebuild),
          )
        : null,
      el(
        'label',
        { class: 'search-bar' },
        icon('search_24_regular'),
        input,
        model.searching
          ? el('span', { class: 'spinner', 'aria-hidden': 'true' })
          : null,
      ),
      el('div', { class: 'results-host' }, resultsBlock(model, actions)),
    );
  }

  /** בנייה מחדש ברקע, מעל החיפוש. `null` כשאין בנייה. */
  function rebuildBanner(model, actions) {
    if (!model.buildActive) return null;
    const progress = Domain.buildProgress(model.progress, model.elapsedMs);
    return el(
      'section',
      { class: 'rebuild-banner', role: 'status' },
      el(
        'div',
        { class: 'rebuild-banner-row' },
        el(
          'span',
          { class: 'rebuild-banner-text' },
          'בונה מחדש את רשימת הספרים. בינתיים החיפוש עובד על הרשימה הקיימת.',
        ),
        button('text', 'ביטול', actions.cancelBuild, {
          busy: model.cancelling,
          busyLabel: 'מבטל…',
        }),
      ),
      progressTrack(progress),
      progressLines(progress),
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
          'אפשר לחפש לפי שם הספר, שם המחבר, או שניהם יחד. למשל: ' +
            '"אבני נזר", "מהרש"א", או "רא"ש יבמות".',
        ),
      );
    }
    if (model.searchError) {
      return el(
        'div',
        { class: 'empty', role: 'alert' },
        icon('warning_24_regular'),
        el('p', {}, model.searchError),
      );
    }
    if (model.results === null) return null;
    if (model.results.length === 0) {
      return el(
        'div',
        { class: 'empty', role: 'status' },
        icon('search_info_24_regular'),
        el('p', {}, 'לא נמצאו ספרים. אפשר לנסות מילה אחרת, או רק חלק מהשם.'),
      );
    }
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'results-header', role: 'status' },
        el('span', {}, 'נמצאו ' + Domain.booksLabel(model.total)),
      ),
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
        icon: 'open_24_regular',
        busy: opening,
        busyLabel: 'פותח…',
        disabled: model.openingKey !== null && !opening,
      }),
    );
  }

  // ------------------------------------------------------------- לוח מידע

  function infoPanel(model, actions) {
    const status = model.status || {};
    const catalog = status.catalog || {};
    const facts = [];
    const fact = (label, value, options) => {
      if (!value) return;
      // נתיב Windows הוא טקסט משמאל לימין; בלי dir הוא נשבר בתוך עברית.
      const dir = options && options.ltr ? 'ltr' : null;
      facts.push(el('dt', {}, label), el('dd', { dir }, value));
    };
    fact('בר אילן', status.installed ? 'מותקן' + (status.version ? ', מהדורה ' + status.version : '') : 'לא נמצא');
    fact('מיקום', status.installPath, { ltr: true });
    fact('ספרים בקטלוג', catalog.exists ? Domain.formatCount(catalog.bookCount) : 'טרם נבנה');
    fact('הקטלוג נבנה', Domain.formatBuiltAt(catalog.builtAt));
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
        el('h3', { class: 'panel-section-title' }, 'קטלוג הספרים'),
        el(
          'p',
          { class: 'panel-text' },
          'אם הותקנה מהדורה חדשה של בר אילן, או שספר מסוים לא נפתח, אפשר ' +
            'לקרוא מחדש את רשימת הספרים. זה לוקח כחמש דקות, והקטלוג הקיים ' +
            'נשאר בשימוש עד שהחדש מוכן.',
        ),
        el(
          'div',
          { class: 'panel-actions' },
          button('tonal', 'בנייה מחדש', actions.rebuild, {
            disabled: !status.installed || model.buildActive,
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
            icon: 'book_24_regular',
          }),
        ),
      ),
    );
  }

  const api = {
    el,
    rebuildBanner,
    loadingView,
    unsupportedView,
    serviceMissingView,
    serviceOutdatedView,
    portTakenView,
    notInstalledView,
    needsCatalogView,
    buildingView,
    buildFailedView,
    readyView,
    infoPanel,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
