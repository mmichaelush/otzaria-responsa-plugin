// גשר מדומה לתצוגה מקדימה בדפדפן: מחליף את `window.Otzaria` ואת השירות
// המקומי, לפי `?scenario=...&mode=light|dark&query=...&sheet=settings|help&tab=...
// &lang=en&library=1`. ערכות הצבעים הן
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
    expected: 1251889,
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
    return key ? fixtures[key] : { total: 0, results: [] };
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
              serverVersion: '0.2.0',
              capabilities: ['catalog', 'open', 'icon', 'searchText', 'export'],
            };
      case '/status':
        return status();
      case '/catalog/search':
        return search(body);
      case '/book/open':
        return { ok: true, broughtToFront: true };
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
    yield { type: 'response', status: 200, ok: true, headers: {} };
    yield { type: 'data', body: JSON.stringify(respond(path, body)) };
  }

  const listeners = {};
  // מסך הפתיחה מוצג רק כשמבקשים (`welcome=1`), כדי שלא יכסה כל מסך אחר.
  const storage = params.get('welcome') ? {} : { responsa_welcome_seen: true };
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
      plugin: { id: 'com.otzaria-responsa', version: '0.2.0' },
      app: {
        version: '0.9.97',
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
              'navigation.write',
              'ui.create_shortcut',
              ...(params.get('library') ? ['library.books.provide'] : []),
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
    const sheet = params.get('sheet');
    if (sheet) {
      setTimeout(() => {
        document.querySelector(sheet === 'help' ? '.help-toggle' : '.settings-toggle').click();
        const tab = params.get('tab');
        if (tab) setTimeout(() => document.querySelector('[data-tab="' + tab + '"]').click(), 100);
      }, 400);
    }
  });
})();
