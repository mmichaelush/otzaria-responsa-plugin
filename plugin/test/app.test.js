'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');
const { FakeBridge, reply } = require('./helpers/fake-bridge');

const { App: AppModule, Domain } = loadPlugin();
const { App } = AppModule;
const { Screen } = Domain;

/** מתעד מה הוצג, בלי DOM. */
class FakeView {
  constructor() {
    this.screens = [];
    this.results = 0;
    this.banners = 0;
  }
  render(model) {
    this.screens.push(model.screen);
  }
  renderResults() {
    this.results++;
  }
  renderBanner() {
    this.banners++;
  }
  renderInfo() {}
}

const health = reply(200, { ok: true, service: 'otzaria-responsa', apiVersion: 1 });
const ready = {
  installed: true,
  version: 25,
  catalog: { exists: true, bookCount: 8402, matchesInstallation: true },
  build: { state: 'idle' },
};
const book = { key: '3232', title: 'מהרש"א חידושי אגדות', contextPath: '' };

function setup(routes) {
  const bridge = new FakeBridge(Object.assign({ '/health': health }, routes));
  const view = new FakeView();
  const app = new App(bridge, view);
  return { bridge, view, app };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (condition) => {
  for (let i = 0; i < 200 && !condition(); i++) await tick();
  assert.ok(condition(), 'התנאי לא התקיים');
};

test('boot בוחר מסך לפי מצב השירות', async () => {
  const { app, view } = setup({ '/status': reply(200, ready) });
  await app.boot({ app: { platform: 'windows' }, plugin: { version: '0.1.0' } });
  assert.equal(app.model.screen, Screen.ready);
  assert.equal(app.model.pluginVersion, '0.1.0');
  assert.equal(view.screens.at(-1), Screen.ready);
  app.suspend();
});

test('בלי שירות: מסך התקנה ובדיקה חוזרת מתוזמנת', async () => {
  const bridge = new FakeBridge({});
  const app = new App(bridge, new FakeView());
  await app.boot({ app: { platform: 'windows' } });
  assert.equal(app.model.screen, Screen.serviceMissing);
  assert.ok(app.pollTimer, 'צריכה להיות בדיקה חוזרת');
  app.suspend();
  assert.equal(app.pollTimer, null);
});

test('ביטול בנייה קודמת אינו מוצג ככשל', async () => {
  const { app } = setup({
    '/status': reply(200, {
      installed: true,
      catalog: { exists: false, bookCount: 0 },
      build: { state: 'failed', error: { code: 'cancelled', message: 'בוטלה' } },
    }),
  });
  await app.boot({ app: { platform: 'windows' } });
  assert.equal(app.model.screen, Screen.needsCatalog);
});

test('חיפוש: תשובה ישנה נזרקת', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const { app } = setup({
    '/status': reply(200, ready),
    '/catalog/search': async (params) => {
      const q = JSON.parse(params.body).q;
      if (q === 'ישן') await gate;
      return reply(200, { total: 1, results: [{ key: q, title: q }] });
    },
  });
  await app.boot({ app: { platform: 'windows' } });
  app.search('ישן', { now: true });
  app.search('חדש', { now: true });
  await until(() => app.model.results && app.model.results[0].key === 'חדש');
  release();
  await tick();
  await tick();
  assert.equal(app.model.results[0].key, 'חדש');
  app.suspend();
});

test('חיפוש ריק מנקה תוצאות בלי לפנות לשירות', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot({ app: { platform: 'windows' } });
  const before = bridge.requests.length;
  app.search('   ');
  assert.equal(app.model.results, null);
  assert.equal(bridge.requests.length, before);
});

test('עוד תוצאות מצטרפות לקיימות', async () => {
  const { app } = setup({
    '/status': reply(200, ready),
    '/catalog/search': (params) => {
      const offset = JSON.parse(params.body).offset;
      return reply(200, { total: 2, results: [{ key: String(offset), title: 'x' }] });
    },
  });
  await app.boot({ app: { platform: 'windows' } });
  app.search('x', { now: true });
  await until(() => app.model.results && app.model.results.length === 1);
  app.loadMore();
  await until(() => app.model.results.length === 2);
  assert.deepEqual(app.model.results.map((b) => b.key), ['0', '1']);
});

test('פתיחה מוצלחת: הודעת הצלחה של אוצריא', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': reply(200, { ok: true, broughtToFront: true }),
  });
  await app.boot({ app: { platform: 'windows' } });
  await app.open(book);
  assert.deepEqual(bridge.notifications('ui.showSuccess'), ['"מהרש"א חידושי אגדות" נפתח בבר אילן']);
  assert.equal(app.model.openingKey, null);
});

test('פתיחה שנכשלה: הודעת השגיאה של השירות', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': reply(409, { error: { code: 'windowLimit', message: 'יותר מדי חלונות' } }),
  });
  await app.boot({ app: { platform: 'windows' } });
  await app.open(book);
  assert.deepEqual(bridge.notifications('ui.showError'), ['יותר מדי חלונות']);
});

test('פתיחה שנייה בזמן הראשונה מתעלמת', async () => {
  let release;
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': () => new Promise((resolve) => (release = () => resolve(reply(200, { ok: true })))),
  });
  await app.boot({ app: { platform: 'windows' } });
  const first = app.open(book);
  await until(() => typeof release === 'function');
  await app.open({ key: 'other', title: 'אחר' });
  assert.equal(bridge.requests.filter((r) => r.path === '/book/open').length, 1);
  release();
  await first;
});

test('בנייה מחדש מתוך מסך החיפוש: נשארים בחיפוש, פס התקדמות', async () => {
  const { app, view, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/build': reply(200, '{"type":"progress","scanned":5}\n{"type":"done","books":8402}\n'),
  });
  await app.boot({ app: { platform: 'windows' } });
  app.startBuild();
  assert.equal(app.model.screen, Screen.ready);
  assert.equal(app.model.buildActive, true);
  await until(() => bridge.notifications('ui.showSuccess').length === 1);
  assert.match(bridge.notifications('ui.showSuccess')[0], /8,402/);
  assert.ok(view.banners > 0);
  await until(() => app.model.buildActive === false);
  app.suspend();
});

test('בנייה ראשונה: מסך בנייה, ובסוף חזרה לחיפוש', async () => {
  let built = false;
  const { app } = setup({
    '/status': () =>
      reply(200, built ? ready : { installed: true, catalog: { exists: false }, build: { state: 'idle' } }),
    '/catalog/build': () => {
      built = true;
      return reply(200, '{"type":"done","books":8402}\n');
    },
  });
  await app.boot({ app: { platform: 'windows' } });
  assert.equal(app.model.screen, Screen.needsCatalog);
  app.startBuild();
  assert.equal(app.model.screen, Screen.building);
  await until(() => app.model.screen === Screen.ready);
  app.suspend();
});

test('חזרה ללשונית בזמן בנייה מצטרפת בלי להתחיל חדשה', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, {
      installed: true,
      catalog: { exists: false },
      build: { state: 'running', scanned: 10, startedAt: new Date().toISOString() },
    }),
    '/catalog/build': { status: 200, chunks: ['{"type":"progress","scanned":11}\n'], hang: true },
  });
  await app.boot({ app: { platform: 'windows' } });
  await until(() => bridge.requests.some((r) => r.path === '/catalog/build'));
  const build = bridge.requests.find((r) => r.path === '/catalog/build');
  assert.equal(build.body.mode, 'attach');
  assert.equal(app.model.screen, Screen.building);
  app.suspend();
});

test('Windows בלבד', async () => {
  const { app, bridge } = setup({});
  await app.boot({ app: { platform: 'linux' } });
  assert.equal(app.model.screen, Screen.unsupported);
  assert.equal(bridge.requests.length, 0);
});
