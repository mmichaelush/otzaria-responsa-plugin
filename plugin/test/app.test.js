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
    this.renders = [];
    this.updates = 0;
    this.results = 0;
    this.announced = [];
  }
  render(model) {
    this.renders.push(model.screen);
  }
  update() {
    this.updates++;
  }
  renderResults() {
    this.results++;
  }
  renderInfo() {}
  announce(text) {
    this.announced.push(text);
  }
}

const health = reply(200, { ok: true, service: 'otzaria-responsa', apiVersion: 1 });
const ready = {
  installed: true,
  version: 25,
  catalog: { exists: true, bookCount: 8402, matchesInstallation: true },
  build: { state: 'idle' },
};
const noCatalog = { installed: true, catalog: { exists: false }, build: { state: 'idle' } };
const book = { key: '3232', title: 'מהרש"א חידושי אגדות', contextPath: '' };
const windows = { app: { platform: 'windows' } };

function setup(routes) {
  const bridge = new FakeBridge(Object.assign({ '/health': health }, routes));
  const view = new FakeView();
  const app = new App(bridge, view);
  return { bridge, view, app };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const until = async (condition) => {
  for (let i = 0; i < 300 && !condition(); i++) await tick();
  assert.ok(condition(), 'התנאי לא התקיים');
};
const requests = (bridge, path) => bridge.requests.filter((r) => r.path === path);

test('boot בוחר מסך לפי מצב השירות', async () => {
  const { app, view } = setup({ '/status': reply(200, ready) });
  await app.boot({ app: { platform: 'windows' }, plugin: { version: '0.1.0' } });
  assert.equal(app.model.screen, Screen.ready);
  assert.equal(app.model.pluginVersion, '0.1.0');
  assert.deepEqual(view.renders, [Screen.ready]);
  app.suspend();
});

test('בלי שירות: מסך התקנה ובדיקה חוזרת מתוזמנת', async () => {
  const bridge = new FakeBridge({});
  const app = new App(bridge, new FakeView());
  await app.boot(windows);
  assert.equal(app.model.screen, Screen.serviceMissing);
  assert.ok(app.pollTimer);
  app.suspend();
  assert.equal(app.pollTimer, null);
});

test('בלי הרשאת localhost: מסך הרשאה, בלי אף פנייה לשירות', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot({ app: { platform: 'windows' }, permissions: ['app.open_url'] });
  assert.equal(app.model.screen, Screen.permissionDenied);
  assert.equal(bridge.requests.length, 0);
});

test('ההרשאה הודלקה בהגדרות: המסך מתעדכן', async () => {
  const { app } = setup({ '/status': reply(200, ready) });
  await app.boot({ app: { platform: 'windows' }, permissions: [] });
  await app.permissionsChanged(['network.localhost']);
  assert.equal(app.model.screen, Screen.ready);
  app.suspend();
});

test('אותו מסך שוב: עדכון במקום ולא בנייה מחדש', async () => {
  const { app, view } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  await app.refresh();
  await app.refresh();
  assert.deepEqual(view.renders, [Screen.ready]);
  assert.ok(view.updates >= 2);
  app.suspend();
});

test('השירות ענה ל-health ונכשל ב-status: "לא מגיב", לא "צריך להתקין"', async () => {
  const { app } = setup({ '/status': new Error('Network stream timed out') });
  await app.boot(windows);
  assert.equal(app.model.screen, Screen.serviceError);
  app.suspend();
});

test('ביטול בנייה קודמת אינו מוצג ככשל', async () => {
  const { app } = setup({
    '/status': reply(200, {
      installed: true,
      catalog: { exists: false, bookCount: 0 },
      build: { state: 'failed', error: { code: 'cancelled', message: 'בוטלה' } },
    }),
  });
  await app.boot(windows);
  assert.equal(app.model.screen, Screen.needsCatalog);
});

test('רענון ישן אינו דורס בנייה שזה עתה התחילה', async () => {
  let release;
  const slow = new Promise((resolve) => (release = resolve));
  let first = true;
  const { app } = setup({
    '/status': async () => {
      if (first) {
        first = false;
        return reply(200, ready);
      }
      await slow;
      return reply(200, ready);
    },
    '/catalog/build': { status: 200, chunks: ['{"type":"progress","scanned":1}\n'], hang: true },
  });
  await app.boot(windows);
  const stale = app.refresh();
  app.startBuild();
  release();
  await stale;
  assert.equal(app.model.buildActive, true);
  app.suspend();
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
  await app.boot(windows);
  app.search('ישן', { now: true });
  app.search('חדש', { now: true });
  await until(() => app.model.results && app.model.results[0].key === 'חדש');
  release();
  await tick();
  await tick();
  assert.equal(app.model.results[0].key, 'חדש');
  app.suspend();
});

test('חיפוש מכריז על מספר התוצאות לקורא מסך', async () => {
  const { app, view } = setup({
    '/status': reply(200, ready),
    '/catalog/search': reply(200, { total: 1, results: [book] }),
  });
  await app.boot(windows);
  app.search('x', { now: true });
  await until(() => view.announced.includes('נמצא ספר אחד'));
  app.suspend();
});

test('חיפוש ריק מנקה תוצאות בלי לפנות לשירות', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  const before = bridge.requests.length;
  app.search('   ');
  assert.equal(app.model.results, null);
  assert.equal(bridge.requests.length, before);
});

test('שגיאת חיפוש שמחייבת רענון אינה נכנסת ללולאה', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/search': reply(404, { error: { code: 'catalogMissing', message: 'חסר' } }),
  });
  await app.boot(windows);
  app.search('x', { now: true });
  await until(() => app.model.searchError !== null);
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(requests(bridge, '/catalog/search').length, 1);
  assert.equal(app.model.searchError, 'חסר');
  app.suspend();
});

test('עוד תוצאות מצטרפות לקיימות', async () => {
  const { app } = setup({
    '/status': reply(200, ready),
    '/catalog/search': (params) => {
      const offset = JSON.parse(params.body).offset;
      return reply(200, { total: 2, results: [{ key: String(offset), title: 'x' }] });
    },
  });
  await app.boot(windows);
  app.search('x', { now: true });
  await until(() => app.model.results && app.model.results.length === 1);
  app.loadMore();
  await until(() => app.model.results.length === 2);
  assert.deepEqual(app.model.results.map((b) => b.key), ['0', '1']);
  app.suspend();
});

test('פתיחה מוצלחת: הודעת הצלחה של אוצריא', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': reply(200, { ok: true, broughtToFront: true }),
  });
  await app.boot(windows);
  await app.open(book);
  assert.deepEqual(bridge.notifications('ui.showSuccess'), [
    '"מהרש"א חידושי אגדות" נפתח בבר אילן',
  ]);
  assert.equal(app.model.openingKey, null);
  app.suspend();
});

test('פתיחה שנכשלה: הודעת השגיאה של השירות', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': reply(409, { error: { code: 'windowLimit', message: 'יותר מדי חלונות' } }),
  });
  await app.boot(windows);
  await app.open(book);
  assert.deepEqual(bridge.notifications('ui.showError'), ['יותר מדי חלונות']);
  app.suspend();
});

test('פתיחה שנייה בזמן הראשונה מתעלמת', async () => {
  let release;
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/book/open': () =>
      new Promise((resolve) => (release = () => resolve(reply(200, { ok: true })))),
  });
  await app.boot(windows);
  const first = app.open(book);
  await until(() => typeof release === 'function');
  await app.open({ key: 'other', title: 'אחר' });
  assert.equal(requests(bridge, '/book/open').length, 1);
  release();
  await first;
  app.suspend();
});

test('אין פתיחה בזמן קריאת הרשימה', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/build': { status: 200, chunks: [], hang: true },
  });
  await app.boot(windows);
  app.startBuild();
  await app.open(book);
  assert.equal(requests(bridge, '/book/open').length, 0);
  app.suspend();
});

test('בנייה מחדש מתוך מסך החיפוש: נשארים בחיפוש, מתעדכנים במקום', async () => {
  const { app, view, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/build': reply(200, '{"type":"progress","scanned":5}\n{"type":"done","books":8402}\n'),
  });
  await app.boot(windows);
  app.startBuild();
  assert.equal(app.model.screen, Screen.ready);
  assert.equal(app.model.buildActive, true);
  await until(() => bridge.notifications('ui.showSuccess').length === 1);
  assert.match(bridge.notifications('ui.showSuccess')[0], /8,402/);
  await until(() => app.model.buildActive === false);
  assert.deepEqual(view.renders, [Screen.ready]);
  app.suspend();
});

test('בנייה ראשונה: מסך בנייה, ובסוף חזרה לחיפוש', async () => {
  let built = false;
  const { app, view } = setup({
    '/status': () => reply(200, built ? ready : noCatalog),
    '/catalog/build': () => {
      built = true;
      return reply(200, '{"type":"progress","scanned":1}\n{"type":"done","books":8402}\n');
    },
  });
  await app.boot(windows);
  assert.equal(app.model.screen, Screen.needsCatalog);
  app.startBuild();
  assert.equal(app.model.screen, Screen.building);
  await until(() => app.model.screen === Screen.ready);
  // אירוע ההתקדמות עודכן במקום, לא בנייה מחדש של המסך.
  assert.deepEqual(view.renders, [Screen.needsCatalog, Screen.building, Screen.ready]);
  app.suspend();
});

test('ביטול: "מבטל…" נשאר עד שהבנייה באמת נעצרת', async () => {
  let finish;
  const { app } = setup({
    '/status': reply(200, noCatalog),
    '/catalog/build': () =>
      new Promise((resolve) => {
        finish = () => resolve(reply(200, '{"type":"error","code":"cancelled","message":"בוטלה"}\n'));
      }),
    '/catalog/cancel': reply(200, { ok: true, wasRunning: true }),
  });
  await app.boot(windows);
  app.startBuild();
  await until(() => typeof finish === 'function');
  await app.cancelBuild();
  assert.equal(app.model.cancelling, true);
  finish();
  await until(() => app.model.buildActive === false);
  assert.equal(app.model.cancelling, false);
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
  await app.boot(windows);
  await until(() => requests(bridge, '/catalog/build').length > 0);
  assert.equal(requests(bridge, '/catalog/build')[0].body.mode, 'attach');
  assert.equal(app.model.screen, Screen.building);
  app.suspend();
});

test('Windows בלבד', async () => {
  const { app, bridge } = setup({});
  await app.boot({ app: { platform: 'linux' } });
  assert.equal(app.model.screen, Screen.unsupported);
  assert.equal(bridge.requests.length, 0);
});
