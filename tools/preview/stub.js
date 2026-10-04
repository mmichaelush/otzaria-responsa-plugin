// גשר מדומה לתצוגה מקדימה בדפדפן: מחליף את `window.Otzaria` ואת השירות
// המקומי, לפי `?scenario=...&mode=light|dark&query=...&page=books|text|locate|settings|help&tab=...
// &lang=en&browse=<נתיב>&adv=<חיפוש>&loc=<מקום>&run=1&oldservice=1&noicons=1`. ערכות הצבעים הן
// של אוצריא (מתוך Y-PLONI/HebrewBooksPlugin tools/preview-stub.js).
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const scenario = params.get('scenario') || 'ready';
  const dark = params.get('mode') === 'dark';
  const fixtures = window.__RESPONSA_FIXTURES__;

  const schemes = {
    light: {"primary":"#805610","onPrimary":"#ffffff","primaryContainer":"#ffddb3","onPrimaryContainer":"#633f00","secondary":"#6f5b40","onSecondary":"#ffffff","secondaryContainer":"#fbdebc","onSecondaryContainer":"#56442a","tertiary":"#51643f","onTertiary":"#ffffff","tertiaryContainer":"#d4eabb","onTertiaryContainer":"#3a4c2a","surface":"#fff8f4","onSurface":"#201b13","onSurfaceVariant":"#4f4539","surfaceContainerLowest":"#ffffff","surfaceContainerLow":"#fff1e5","surfaceContainer":"#f9ecdf","surfaceContainerHigh":"#f3e6da","surfaceContainerHighest":"#ede0d4","error":"#ba1a1a","onError":"#ffffff","errorContainer":"#ffdad6","onErrorContainer":"#93000a","outline":"#817567","outlineVariant":"#d3c4b4","inverseSurface":"#362f27","onInverseSurface":"#fcefe2","inversePrimary":"#f4bd6f","shadow":"#000000","scrim":"#000000","surfaceTint":"#805610"},
    dark: {"primary":"#ebb5ed","onPrimary":"#49204e","primaryContainer":"#613766","onPrimaryContainer":"#ffd6fe","secondary":"#d7bfd5","onSecondary":"#3b2b3c","secondaryContainer":"#534153","onSecondaryContainer":"#f4dbf1","tertiary":"#f6b8ad","onTertiary":"#4c251f","tertiaryContainer":"#673b34","onTertiaryContainer":"#ffdad4","surface":"#171216","onSurface":"#ebdfe6","onSurfaceVariant":"#d0c3cc","surfaceContainerLowest":"#110d11","surfaceContainerLow":"#1f1a1f","surfaceContainer":"#231e23","surfaceContainerHigh":"#2e282d","surfaceContainerHighest":"#393338","error":"#ffb4ab","onError":"#690005","errorContainer":"#93000a","onErrorContainer":"#ffdad6","outline":"#998d96","outlineVariant":"#4d444c","inverseSurface":"#ebdfe6","onInverseSurface":"#352f34","inversePrimary":"#7b4e7f","shadow":"#000000","scrim":"#000000","surfaceTint":"#ebb5ed"},
  };

  const catalogReady = {
    exists: true,
    bookCount: 8402,
    schemaVersion: 6,
    outdated: false,
    builtAt: '2026-09-28T19:13:04',
    sourceVersion: 25,
    matchesInstallation: scenario !== 'otherInstallation',
  };
  const catalogMissing = { exists: false, bookCount: 0, outdated: false, matchesInstallation: true };
  const running = {
    state: 'running',
    startedAt: new Date(Date.now() - 150000).toISOString(),
    stage: 'scanning',
    scanned: 612000,
    expected: 465701,
    sectionsDone: 9,
    sectionsTotal: 20,
  };

  const statuses = {
    needsCatalog: { catalog: catalogMissing, build: { state: 'idle' } },
    building: { catalog: catalogMissing, build: running },
    buildFailed: {
      catalog: catalogMissing,
      build: {
        state: 'failed',
        error: {
          code: 'elevated',
          message: 'אין גישה לבר אילן, כנראה כי הוא פועל כמנהל מערכת. יש לסגור אותו ולפתוח אותו שוב כרגיל, לא דרך "הפעל כמנהל".',
        },
      },
    },
    notInstalled: { installed: false, catalog: catalogMissing, build: { state: 'idle' } },
    ready: { catalog: catalogReady, build: { state: 'idle' } },
    otherInstallation: { catalog: catalogReady, build: { state: 'idle' } },
    rebuilding: { catalog: catalogReady, build: running },
  };

  function status() {
    const base = statuses[scenario] || statuses.ready;
    return Object.assign(
      {
        installed: true,
        running: true,
        version: 25,
        confidence: 'verified',
        installPath: 'C:\\Program Files (x86)\\ResponsaCD25',
      },
      base,
    );
  }

  function search(body) {
    const key = Object.keys(fixtures).find((q) =>
      q.replace(/["״]/g, '').includes(String(body.q).replace(/["״]/g, '').trim()),
    );
    const found = key ? fixtures[key] : { total: 0, results: [] };
    if (!body.path) return found;
    const inPath = found.results.filter(
      (book) => book.contextPath === body.path || book.contextPath.startsWith(body.path + '/'),
    );
    return { total: inPath.length, results: inPath };
  }

  // עץ לדוגמה, בשמות של הקטגוריות בבר אילן.
  const MEFARSHIM = 'מפרשים ופוסקים על הבבלי והירושלמי';
  const ACHARONIM = MEFARSHIM + '/אחרונים על הבבלי';
  const tree = {
    '': [
      ['תנ"ך ומפרשיו', 245],
      ['תלמוד בבלי, ירושלמי ומדרשים', 128],
      [MEFARSHIM, 1840],
      ['רמב"ם ונושאי כליו', 312],
      ['טור, שולחן ערוך ונושאי כליהם', 506],
      ['ספרי שאלות ותשובות (שו"ת)', 2150],
      ['ספרי הלכה', 1210],
      ['מחשבה, מוסר וחסידות', 1530],
      ['שונות', 481],
    ],
    [MEFARSHIM]: [
      ['ראשונים על הבבלי', 520],
      ['אחרונים על הבבלי', 1320],
    ],
    [ACHARONIM]: [
      ['מהרש"א', 12],
      ['פני יהושע', 9],
      ['רבי עקיבא איגר', 14],
      ['חתם סופר', 21],
    ],
  };

  function browse(body) {
    const path = String(body.path || '');
    const prefix = path ? path + '/' : '';
    const books = fixtures['מהרש"א'].results.filter((book) => book.contextPath === path);
    const children = tree[path] || [];
    if (!children.length && !books.length && path) return null;
    return {
      path,
      categories: children.map(([name, bookCount]) => ({ name, path: prefix + name, bookCount })),
      books,
    };
  }

  function respond(path, body) {
    switch (path) {
      case '/health':
        return scenario === 'portTaken'
          ? { ok: true, service: 'something-else' }
          : {
              ok: true,
              service: 'otzaria-responsa',
              apiVersion: scenario === 'serviceOutdated' ? 2 : 1,
              serverVersion: '0.5.0',
              capabilities: params.get('oldservice')
                ? ['catalog', 'open', 'icon', 'searchText', 'export']
                : [
                    'catalog',
                    'open',
                    'icon',
                    'searchText',
                    'export',
                    'browse',
                    'otzariaIcons',
                    'advancedSearch',
                    'showResponsa',
                    'notify',
                    'locate',
                    'autoStart',
                  ],
            };
      case '/status':
        return status();
      case '/catalog/search':
        return search(body);
      case '/catalog/browse':
        return browse(body);
      case '/otzaria/icons':
        return window.__OTZARIA_ICON_FONT__ && !params.get('noicons') ? window.__OTZARIA_ICON_FONT__ : null;
      case '/icon':
        return window.__RESPONSA_APP_ICON__ ? { png: window.__RESPONSA_APP_ICON__ } : null;
      case '/book/open':
      case '/responsa/show':
        return { ok: true, broughtToFront: true };
      case '/text/search':
        return { ok: true, outcome: 'found', count: 191, query: body.q, advanced: body.advanced, broughtToFront: true };
      // "בראשית ב ג": כמה מקורות לבחירה, כמו בבר אילן; כל השאר נפתח מיד.
      case '/reference/open':
        return body.index === undefined && String(body.ref).startsWith('בראשית')
          ? {
              ok: true,
              opened: false,
              ref: body.ref,
              choices: ['תורה בראשית ב ג', 'תרגום אונקלוס בראשית ב ג', 'רש"י בראשית ב ג', 'רמב"ן בראשית ב ג', 'אבן עזרא בראשית ב ג'],
            }
          : { ok: true, opened: true, ref: body.ref, window: body.ref, broughtToFront: true };
      default:
        return { ok: true };
    }
  }

  async function* fetchStream(params) {
    await new Promise((resolve) => setTimeout(resolve, 60));
    if (scenario === 'serviceMissing') {
      throw new Error('SocketException: Connection refused');
    }
    if (scenario === 'serviceError' && params.url.endsWith('/status')) {
      throw new Error('Network stream timed out');
    }
    const path = params.url.replace(/^https?:\/\/[^/]+/, '');
    const body = params.body ? JSON.parse(params.body) : {};
    if (path === '/catalog/build') {
      yield { type: 'response', status: 200, ok: true, headers: {} };
      yield { type: 'data', body: JSON.stringify(Object.assign({ type: 'progress' }, running)) + '\n' };
      await new Promise(() => {});
    }
    const answer = respond(path, body);
    if (answer === null) {
      yield { type: 'response', status: 404, ok: false, headers: {} };
      yield { type: 'data', body: JSON.stringify({ error: { code: 'notFound', message: 'לא נמצא' } }) };
      return;
    }
    yield { type: 'response', status: 200, ok: true, headers: {} };
    yield { type: 'data', body: JSON.stringify(answer) };
  }

  const listeners = {};
  // מסך הפתיחה מוצג רק כשמבקשים (`welcome=1`), כדי שלא יכסה כל מסך אחר.
  const storage = params.get('welcome') ? {} : { responsa_welcome_seen: true };
  if (params.get('browse')) storage.responsa_browse_path = params.get('browse');
  // `page=<tab>`: הלשונית שנפתחת (ספרים, חיפוש בטקסט, איתור מקום, הגדרות, עזרה).
  if (params.get('page')) storage.responsa_tab = params.get('page');
  if (params.get('history')) storage.responsa_locate_history = ['שמות רבה פרשה א', 'ברכות דף ב עמוד א'];
  // `adv=<name>`: חיפוש שמור, כמו אחרי עבודה בלשונית.
  const advanced = {
    simple: { mode: 'simple', simpleText: 'צער בעלי חיים', options: { abbreviations: true, showForms: false } },
    words: {
      terms: [
        { words: ['קוצץ', 'עוקר', 'משחית'], form: 'exact', exclude: false },
        { words: ['אילן'], form: 'prefixes', exclude: false },
        { words: ['פירות'], form: 'spelling', exclude: false },
      ],
      gaps: [{ kind: 'after', distance: 3 }, { kind: 'around', distance: 5 }],
      options: { abbreviations: true, showForms: false },
    },
    scope: {
      terms: [{ words: ['נר'], form: 'exact', exclude: false }, { words: ['שבת'], form: 'exact', exclude: false }],
      gaps: [{ kind: 'after', distance: 4 }],
      scope: {
        mode: 'pick',
        items: [
          { type: 'category', path: 'מפרשים ופוסקים על הבבלי והירושלמי/אחרונים על הבבלי', name: 'אחרונים על הבבלי' },
          { type: 'book', key: '90', name: 'שו"ת אבני נזר', path: 'ספרי שאלות ותשובות (שו"ת)/ספרי שאלות ותשובות - אחרונים' },
        ],
      },
    },
    manual: { mode: 'manual', manualText: '8: ($שומר/%מצא) #(אכל/גנב/מכר) *(פקדון/אבידה)*' },
  }[params.get('adv')];
  if (advanced) storage.responsa_advanced_query = advanced;
  window.Otzaria = {
    call(method, payload) {
      if (method === 'network.fetchStream') return fetchStream(payload);
      console.log('[stub]', method, payload);
      let data = true;
      if (method === 'storage.get') data = Object.hasOwn(storage, payload.key) ? storage[payload.key] : null;
      if (method === 'storage.set') storage[payload.key] = payload.value;
      return Promise.resolve({ success: true, data, error: null });
    },
    on(event, callback) {
      (listeners[event] = listeners[event] || []).push(callback);
    },
    off() {},
  };

  window.addEventListener('load', () => {
    const payload = {
      plugin: { id: 'com.otzaria-responsa', version: '0.5.0' },
      app: {
        version: '0.9.98',
        platform: scenario === 'unsupported' ? 'linux' : 'windows',
        language: params.get('lang') || 'he',
      },
      connectivity: { isOnline: params.get('offline') ? false : true },
      permissions:
        scenario === 'permissionDenied'
          ? ['app.open_url']
          : [
              'network.localhost',
              'app.open_url',
              'app.startup_contributions',
              'app.shortcuts',
              'reader.context_menu',
              'search.dialog',
              'navigation.write',
              'ui.create_shortcut',
              'feedback.send_email',
              'library.books.provide',
            ],
      theme: {
        mode: dark ? 'dark' : 'light',
        colorScheme: dark ? schemes.dark : schemes.light,
        typography: { uiFontFamily: 'Rubik', fontFamily: 'FrankRuhlCLM', fontSize: 25 },
      },
    };
    (listeners['plugin.boot'] || []).forEach((cb) => cb(payload));
    const query = params.get('query');
    if (query) {
      setTimeout(() => {
        const input = document.querySelector('.search-input');
        if (!input) return;
        input.value = query;
        input.dispatchEvent(new Event('input'));
        // `details=<key>`: פרטי הספר פתוחים, כמו אחרי לחיצה על הכפתור.
        const details = params.get('details');
        if (details) {
          setTimeout(() => {
            const toggle = document.querySelector('[data-focus-key="details-' + details + '"]');
            if (toggle) toggle.click();
          }, 400);
        }
      }, 300);
    }
    // `tab=<help tab>`: כרטיסייה בתוך "עזרה".
    const helpTab = params.get('tab');
    if (helpTab) {
      const pick = () => {
        const button = document.querySelector('.secondary-tabs [data-tab="' + helpTab + '"]');
        if (button) button.click();
        else setTimeout(pick, 100);
      };
      setTimeout(pick, 300);
    }
    // `run=1`: אחרי "חיפוש בבר אילן" (או "פתיחה בבר אילן" באיתור מקום).
    if (params.get('run')) {
      setTimeout(() => {
        const run = document.querySelector('[data-focus-key="adv-run"], [data-focus-key="locate-run"]');
        if (run) run.click();
      }, 400);
    }
    // `example=1`: לחיצה על הדוגמה הראשונה, ובדיקה שהיא מילאה את השדה (נמצא
    // בבדיקה חיה: `value` אינו ב-markup, והרענון לא עדכן אותו).
    if (params.get('example')) {
      setTimeout(() => {
        const chip = document.querySelector('[data-focus-key^="locate-example-"]');
        chip.click();
        setTimeout(() => {
          const value = document.querySelector('.locate-input').value;
          if (value !== chip.textContent) console.error('Error: example did not fill the field: "' + value + '"');
        }, 200);
      }, 400);
    }
    // `loc=<מקום>`: מה שהוקלד באיתור מקום.
    const loc = params.get('loc');
    if (loc) {
      setTimeout(() => {
        const input = document.querySelector('.locate-input');
        input.value = loc;
        input.dispatchEvent(new Event('input'));
      }, 300);
    }
    // `reader=<ספר>|<מקום>`: לחיצה ימנית בספר ← "איתור המקום בבר אילן".
    // השדה חייב להראות את ההפניה שנשלחה (`value` אינו ב-markup).
    const reader = params.get('reader');
    if (reader) {
      const [currentBook, currentRef] = reader.split('|');
      setTimeout(() => {
        (listeners['contextMenu.itemClicked'] || []).forEach((cb) =>
          cb({ itemId: 'responsa-locate-here', currentBook, currentRef }),
        );
        setTimeout(() => {
          // בלי שירות הלשונית מראה מה חסר, ואין שדה.
          const input = document.querySelector('.locate-input');
          if (!input) return;
          const value = input.value;
          if (!value.startsWith(window.ResponsaLocate.fromReader(currentBook, currentRef).title)) {
            console.error('Error: the reader place did not reach the field: "' + value + '"');
          }
        }, 600);
      }, 300);
    }
    // `otzsearch=<מילים>`: "חיפוש בבר אילן" מסומן בדיאלוג החיפוש של אוצריא.
    const otzsearch = params.get('otzsearch');
    if (otzsearch) {
      setTimeout(() => {
        (listeners['search.requested'] || []).forEach((cb) =>
          cb({ itemId: 'responsa-search-dialog', request: { query: otzsearch, mode: 'exact', distance: 0 } }),
        );
        setTimeout(() => {
          const input = document.querySelector('[data-focus-key="adv-simple"]');
          if (!input || input.value !== otzsearch) {
            console.error('Error: the Otzaria search did not reach the field: "' + (input && input.value) + '"');
          }
        }, 600);
      }, 300);
    }
    if (params.get('guide')) {
      setTimeout(() => {
        const guide = document.querySelector('.advanced-guide');
        guide.open = true;
        const scroller = document.querySelector('.app-content');
        scroller.scrollTop = guide.offsetTop - 16;
      }, 400);
    }
  });
})();
