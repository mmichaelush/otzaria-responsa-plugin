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
    this.sheets = [];
    this.languages = 0;
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
  renderSheet(model) {
    this.sheets.push(model.sheet);
  }
  updateReport() {}
  applyLanguage() {
    this.languages++;
  }
  announce(text) {
    this.announced.push(text);
  }
  focusSearch() {
    this.focused = (this.focused || 0) + 1;
  }
  focusBrowse() {
    this.browseFocused = (this.browseFocused || 0) + 1;
  }
  redraw(model) {
    this.redraws = (this.redraws || 0) + 1;
    this.renders.push(model.screen);
  }
  rememberFocus() {}
  focusInSheet(key) {
    this.sheetFocus = key;
  }
  focusAdvancedProblem(problem) {
    this.problemFocus = problem;
  }
  updateAdvanced() {
    this.advancedUpdates = (this.advancedUpdates || 0) + 1;
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

test('רענון ישן אינו מחזיר את מסך ההתחלה בזמן בנייה ראשונה', async () => {
  let release;
  const slow = new Promise((resolve) => (release = resolve));
  let calls = 0;
  const { app } = setup({
    '/status': async () => {
      calls++;
      if (calls > 1) await slow;
      return reply(200, noCatalog);
    },
    '/catalog/build': { status: 200, chunks: ['{"type":"progress","scanned":1}\n'], hang: true },
  });
  await app.boot(windows);
  const stale = app.refresh();
  app.startBuild();
  release();
  await stale;
  assert.equal(app.model.screen, Screen.building);
  app.suspend();
});

test('בנייה שנדחתה ב"עסוק" מוסברת למשתמש', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/build': reply(409, { error: { code: 'busy', message: 'ספר נפתח כרגע' } }),
  });
  await app.boot(windows);
  app.startBuild();
  await until(() => app.model.buildActive === false);
  assert.deepEqual(bridge.notifications('ui.showError'), ['ספר נפתח כרגע']);
  app.suspend();
});

test('Windows בלבד', async () => {
  const { app, bridge } = setup({});
  await app.boot({ app: { platform: 'linux' } });
  assert.equal(app.model.screen, Screen.unsupported);
  assert.equal(bridge.requests.length, 0);
});

// ------------------------------------------------------- הגדרות ועזרה

test('לוח ההגדרות והעזרה נפתחים ונסגרים; כרטיסייה לא מוכרת נשארת על הקודמת', async () => {
  const { app, view } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  app.actions.openSettings();
  app.actions.openHelp('status');
  app.actions.openHelp('nope');
  app.actions.closeSheet();
  app.actions.closeSheet();
  assert.deepEqual(view.sheets.slice(-4), ['settings', 'help', 'help', null]);
  assert.equal(app.model.helpTab, 'status');
  app.suspend();
});

test('plugin.page_opened עם view פותח את הלוח המבוקש', async () => {
  const { app } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  app.pageOpened({ param: { view: 'help', tab: 'troubleshoot' } });
  assert.equal(app.model.sheet, 'help');
  assert.equal(app.model.helpTab, 'troubleshoot');
  app.pageOpened({ param: { view: 'settings' } });
  assert.equal(app.model.sheet, 'settings');
  app.pageOpened(null);
  assert.equal(app.model.sheet, 'settings');
  app.suspend();
});

test('מתג שנכשל בשמירה נשאר במצבו, עם הסבר', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  bridge.methods['storage.set'] = { error: { code: 'error.internal' } };
  await app.boot(windows);
  await app.actions.setSetting('contextMenu', false);
  assert.equal(app.model.settings.contextMenu, true);
  assert.deepEqual(bridge.notifications('ui.showError'), ['ההגדרה לא נשמרה. אפשר לנסות שוב.']);
  app.suspend();
});

test('בחירת אנגלית: הדף נבנה מחדש באנגלית, ופריט התפריט מתורגם', async () => {
  const { app, view, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  const renders = view.renders.length;
  await app.actions.setLanguage('en');
  try {
    assert.equal(globalThis.ResponsaI18n.language, 'en');
    assert.ok(view.renders.length > renders);
    await until(() => bridge.calls.some((c) => c.method === 'reader.updateContextMenuItem'));
    const patch = bridge.calls.find((c) => c.method === 'reader.updateContextMenuItem');
    assert.deepEqual(patch.payload, { id: 'responsa-search', patch: { title: 'Search in Bar-Ilan' } });
    assert.deepEqual(
      bridge.calls.filter((c) => c.method === 'storage.set').map((c) => c.payload),
      [{ key: 'responsa_language', value: 'en' }],
    );
  } finally {
    await app.actions.setLanguage('he');
    app.suspend();
  }
});

test('שפת אוצריא השתנתה: חלה רק כשבתוסף נבחר "כמו באוצריא"', async () => {
  const { app } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  try {
    app.hostSettingChanged({ key: 'key-settings-language', newValue: 'en' });
    assert.equal(globalThis.ResponsaI18n.language, 'en');
    app.hostSettingChanged({ key: 'key-other', newValue: 'he' });
    assert.equal(globalThis.ResponsaI18n.language, 'en');
  } finally {
    app.hostSettingChanged({ key: 'key-settings-language', newValue: 'he' });
    app.suspend();
  }
});

test('דיווח: נשלח עם פרטי המערכת, ומתנקה אחרי שליחה', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  bridge.methods['feedback.report'] = 'sent';
  await app.boot({ ...windows, plugin: { version: '0.2.0' } });
  app.actions.editReport('קצר');
  await app.actions.sendReport();
  assert.equal(bridge.calls.some((c) => c.method === 'feedback.report'), false, 'פחות מ-10 תווים');

  app.actions.editReport('הספר לא נפתח בבר אילן');
  await app.actions.sendReport();
  const sent = bridge.calls.find((c) => c.method === 'feedback.report').payload;
  assert.match(sent.details, /^הספר לא נפתח בבר אילן\n\n---\n/);
  assert.match(sent.details, /גרסת התוסף: 0\.2\.0/);
  assert.equal(app.model.report.text, '');
  assert.deepEqual(bridge.notifications('ui.showSuccess'), ['הדיווח נשלח. תודה!']);
  app.suspend();
});

test('דיווח שהמשתמש ביטל נשאר בתיבה', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  bridge.methods['feedback.report'] = 'cancelled';
  await app.boot(windows);
  app.actions.editReport('הספר לא נפתח בבר אילן');
  await app.actions.sendReport();
  assert.equal(app.model.report.text, 'הספר לא נפתח בבר אילן');
  assert.equal(app.model.report.sending, false);
  app.suspend();
});

test('קיצור דרך: הצלחה, ביטול בדיאלוג של אוצריא, וכשל', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  bridge.methods['shortcut.create'] = { created: true };
  await app.actions.createShortcut('desktop');
  bridge.methods['shortcut.create'] = { created: false };
  await app.actions.createShortcut('desktop');
  bridge.methods['shortcut.create'] = { error: { code: 'error.unsupported' } };
  await app.actions.createShortcut('startMenu');
  assert.deepEqual(bridge.notifications('ui.showSuccess'), ['קיצור הדרך נוצר בשולחן העבודה.']);
  assert.deepEqual(bridge.notifications('ui.showError'), ['לא ניתן היה ליצור את קיצור הדרך.']);
  app.suspend();
});

test('רשימה מוכנה ומארח שתומך: נשלחת לחיפוש הספרייה', async () => {
  const { app, bridge } = setup({
    '/health': reply(200, {
      ok: true,
      service: 'otzaria-responsa',
      apiVersion: 1,
      capabilities: ['catalog', 'open', 'export'],
    }),
    '/status': reply(200, { ...ready, catalog: { ...ready.catalog, builtAt: '2026-09-29T10:00:00Z' } }),
    '/catalog/export': reply(200, { builtAt: '2026-09-29T10:00:00Z', books: [['7', 'אבני נזר', null, '']] }),
  });
  bridge.methods['storage.get'] = null;
  await app.boot({ ...windows, permissions: ['network.localhost', 'library.books.provide', 'app.startup_contributions'] });
  await until(() => bridge.calls.some((c) => c.method === 'library.setProviderBooks'));
  const sent = bridge.calls.find((c) => c.method === 'library.setProviderBooks').payload;
  assert.deepEqual(sent.books, [{ id: 7, title: 'אבני נזר', categoryPath: '/בר אילן' }]);
  app.suspend();
});

test('אירוע מהספרייה בזמן שהלשונית פתוחה: "פותח…" מוצג ונעלם', async () => {
  const { app, view } = setup({
    '/status': reply(200, ready),
    '/book/open': reply(200, { ok: true, broughtToFront: true }),
  });
  await app.boot(windows);
  const updates = view.updates;
  await app.engine.openFromLibrary({ provider: 'responsa', id: 3232, title: 'חידושי אגדות' });
  assert.equal(app.model.activity, null);
  assert.ok(view.updates >= updates + 2);
  app.suspend();
});

// ------------------------------------------------ מסך פתיחה, קישורים, פרטים

test('מסך הפתיחה: מוצג בהפעלה הראשונה, ו"הבנתי" שומר שלא יוצג שוב', async () => {
  const { app, bridge, view } = setup({ '/status': reply(200, ready) });
  const stored = {};
  bridge.methods['storage.get'] = ({ key }) => (key in stored ? stored[key] : null);
  bridge.methods['storage.set'] = ({ key, value }) => {
    stored[key] = value;
    return true;
  };
  await app.boot(windows);
  assert.equal(app.model.sheet, 'welcome');
  assert.equal(view.sheets[0], 'welcome');
  app.actions.finishWelcome();
  await until(() => stored.responsa_welcome_seen === true);
  assert.equal(app.model.sheet, null);
  assert.equal(view.focused, 1, 'הפוקוס חוזר לתיבת החיפוש');
  app.suspend();

  const again = setup({ '/status': reply(200, ready) });
  again.bridge.methods['storage.get'] = ({ key }) => (key in stored ? stored[key] : null);
  await again.app.boot(windows);
  assert.equal(again.app.model.sheet, null);
  again.app.suspend();
});

test('מסך הפתיחה: מעבר ממנו לעזרה נחשב סגירה שלו', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  const stored = {};
  bridge.methods['storage.get'] = () => null;
  bridge.methods['storage.set'] = ({ key, value }) => ((stored[key] = value), true);
  await app.boot(windows);
  app.actions.openHelp('guide');
  await until(() => stored.responsa_welcome_seen === true);
  assert.equal(app.model.sheet, 'help');
  app.suspend();
});

test('קישור בלי אינטרנט: הסבר עם הכתובת, בלי לפתוח דפדפן', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot({ ...windows, connectivity: { isOnline: false } });
  assert.equal(app.model.online, false);
  await app.actions.openLink('guide');
  assert.equal(bridge.calls.some((c) => c.method === 'app.openUrl'), false);
  assert.match(bridge.notifications('ui.showMessage')[0], /אין כרגע חיבור לאינטרנט.*USER_GUIDE/);
  app.suspend();
});

test('קישור עם אינטרנט (או כשעוד לא ידוע) נפתח בדפדפן', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot({ ...windows, connectivity: { isOnline: null } });
  assert.equal(app.model.online, null);
  await app.actions.openLink('forum');
  const opened = bridge.calls.find((c) => c.method === 'app.openUrl');
  assert.equal(opened.payload.url, Domain.Links.forum);
  await app.actions.openLink('nothing');
  assert.equal(bridge.calls.filter((c) => c.method === 'app.openUrl').length, 1, 'שם לא מוכר');
  app.suspend();
});

test('פרטי ספר: לחיצה פותחת וסוגרת, וחיפוש חדש מאפס', async () => {
  const { app } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  app.model.query = 'אבני';
  app.actions.toggleDetails('7008');
  assert.equal(app.model.expandedKey, '7008');
  app.actions.toggleDetails('7008');
  assert.equal(app.model.expandedKey, null);
  app.actions.toggleDetails('31');
  app.search('אבני ', {});
  assert.equal(app.model.expandedKey, '31', 'רווח בסוף אינו חיפוש חדש');
  app.search('מהרש"א', {});
  assert.equal(app.model.expandedKey, null);
  app.suspend();
});

test('מסך שגיאה: קוד הכשל נשמר לציטוט בפנייה', async () => {
  const { app } = setup({ '/status': reply(500, { error: { code: 'internal', message: 'x' } }) });
  await app.boot(windows);
  assert.equal(app.model.screen, Screen.serviceError);
  assert.equal(app.model.errorCode, 'internal');
  app.suspend();
});

test('דיווח: מצורף יומן הפעולות, בלי שם המשתמש שבנתיבים', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  bridge.methods['feedback.report'] = 'sent';
  await app.boot(windows);
  app.log.warn('נכשל: C:\\Users\\Moshe\\AppData\\x');
  app.actions.editReport('הספר לא נפתח בבר אילן');
  await app.actions.sendReport();
  const { details } = bridge.calls.find((c) => c.method === 'feedback.report').payload;
  assert.match(details, /--- יומן פעולות ---/);
  assert.match(details, /C:\\Users\\…\\AppData/);
  assert.doesNotMatch(details, /Moshe/);
  assert.ok(details.length <= 5000);
  app.suspend();
});


// ---------------------------------------------------- עיון בקטגוריות

const browseHealth = reply(200, {
  ok: true,
  service: 'otzaria-responsa',
  apiVersion: 1,
  capabilities: ['catalog', 'open', 'searchText', 'export', 'browse'],
});
const rootLevel = {
  path: '',
  categories: [{ name: 'שו"ת', path: 'שו"ת', bookCount: 2150 }],
  books: [],
};
const innerLevel = { path: 'שו"ת', categories: [], books: [book] };

test('עיון: השורש נטען כשהמסך מוכן, ומעבר לקטגוריה שומר אותה', async () => {
  const { app, bridge } = setup({
    '/health': browseHealth,
    '/status': reply(200, ready),
    '/catalog/browse': (params) =>
      reply(200, JSON.parse(params.body).path ? innerLevel : rootLevel),
  });
  await app.boot(windows);
  await until(() => app.model.browse.level !== null);
  assert.deepEqual(app.model.browse.level, rootLevel);

  await app.browseTo('שו"ת');
  assert.equal(app.model.browse.path, 'שו"ת');
  assert.deepEqual(app.model.browse.level.books, [book]);
  await until(() =>
    bridge.calls.some((c) => c.method === 'storage.set' && c.payload.key === 'responsa_browse_path'),
  );
  const saved = bridge.calls.find((c) => c.method === 'storage.set' && c.payload.key === 'responsa_browse_path');
  assert.equal(saved.payload.value, 'שו"ת');
  app.suspend();
});

test('עיון: חיפוש בתוך קטגוריה שולח path, ו"בכל הספרים" מבטל אותו', async () => {
  const { app, bridge } = setup({
    '/health': browseHealth,
    '/status': reply(200, ready),
    '/catalog/browse': (params) =>
      reply(200, JSON.parse(params.body).path ? innerLevel : rootLevel),
    '/catalog/search': reply(200, { total: 1, results: [book] }),
  });
  await app.boot(windows);
  await app.browseTo('שו"ת');
  app.search('מהרש"א', { now: true });
  await until(() => !app.model.searching && app.model.results);
  assert.equal(requests(bridge, '/catalog/search').at(-1).body.path, 'שו"ת');

  await app.searchEverywhere();
  await until(() => requests(bridge, '/catalog/search').length >= 2 && !app.model.searching);
  assert.equal(app.model.browse.path, '');
  assert.equal(requests(bridge, '/catalog/search').at(-1).body.path, undefined);
  app.suspend();
});

test('עיון: קטגוריה שנעלמה (הרשימה נקראה מחדש) חוזרת לשורש', async () => {
  const { app } = setup({
    '/health': browseHealth,
    '/status': reply(200, ready),
    '/catalog/browse': (params) =>
      JSON.parse(params.body).path
        ? reply(404, { error: { code: 'notFound', message: 'x' } })
        : reply(200, rootLevel),
  });
  await app.boot(windows);
  await app.browseTo('אין כזה');
  await until(() => app.model.browse.level && app.model.browse.path === '');
  assert.equal(app.model.browse.error, null);
  app.suspend();
});

test('עיון: שירות בלי browse אינו נשאל, והחיפוש בלי path', async () => {
  const { app, bridge } = setup({
    '/status': reply(200, ready),
    '/catalog/search': reply(200, { total: 0, results: [] }),
  });
  await app.boot(windows);
  app.model.browse.path = 'שו"ת';
  app.search('x', { now: true });
  await until(() => !app.model.searching && app.model.results);
  assert.equal(requests(bridge, '/catalog/browse').length, 0);
  assert.equal(requests(bridge, '/catalog/search')[0].body.path, undefined);
  app.suspend();
});

test('אייקונים: הסמל של בר אילן נטען פעם אחת, כ-ico', async () => {
  const { app, bridge } = setup({
    '/health': reply(200, { ok: true, service: 'otzaria-responsa', apiVersion: 1, capabilities: ['icon'] }),
    '/status': reply(200, ready),
    '/icon': reply(200, { png: 'AAAB' }),
  });
  await app.boot(windows);
  await until(() => app.model.responsaIcon !== null);
  assert.equal(app.model.responsaIcon, 'data:image/x-icon;base64,AAAB');
  await app.refresh();
  assert.equal(requests(bridge, '/icon').length, 1);
  app.suspend();
});

test('עיון: רשימה שנקראה מחדש בונה את העץ מחדש', async () => {
  let builtAt = '2026-09-28T10:00:00';
  const { app, bridge } = setup({
    '/health': browseHealth,
    '/status': () => reply(200, { ...ready, catalog: { ...ready.catalog, builtAt } }),
    '/catalog/browse': reply(200, rootLevel),
  });
  await app.boot(windows);
  await until(() => app.model.browse.level !== null);
  await app.refresh();
  assert.equal(requests(bridge, '/catalog/browse').length, 1, 'אותה רשימה: בלי טעינה חוזרת');
  builtAt = '2026-10-02T10:00:00';
  await app.refresh();
  await until(() => requests(bridge, '/catalog/browse').length === 2);
  app.suspend();
});

// ------------------------------------------------------ חיפוש מתקדם

const advancedHealth = reply(200, {
  ok: true,
  service: 'otzaria-responsa',
  apiVersion: 1,
  capabilities: ['catalog', 'open', 'searchText', 'export', 'browse', 'advancedSearch', 'showResponsa'],
});

async function bootAdvanced(routes) {
  const context = setup(Object.assign({ '/health': advancedHealth, '/status': reply(200, ready) }, routes));
  await context.app.boot(windows);
  return context;
}

test('חיפוש מתקדם: נבנה מהבונה ונשלח עם האפשרויות, והתשובה מוצגת', async () => {
  const { app, bridge, view } = await bootAdvanced({
    '/text/search': reply(200, { ok: true, outcome: 'found', count: 191, query: 'נר [1:4] שבת', advanced: true }),
  });
  app.openAdvanced();
  assert.equal(app.model.sheet, 'advanced');
  app.advancedWord(0, 0, 'נר');
  app.advancedAddTerm();
  assert.equal(view.sheetFocus, 'adv-word-1-0');
  app.advancedWord(1, 0, 'שבת');
  app.advancedGap(0, { kind: 'after', distance: 4 });
  app.advancedSet({ options: { abbreviations: true, showForms: false } });
  await app.runAdvanced();
  const sent = requests(bridge, '/text/search')[0].body;
  assert.deepEqual(sent, {
    q: 'נר [1:4] שבת',
    advanced: true,
    options: { abbreviations: true, showForms: false, allDatabases: true },
  });
  assert.equal(app.model.advanced.status.kind, 'success');
  assert.equal(app.model.advanced.status.text, 'בר אילן מצא 191 תוצאות. הן פתוחות בחלון של בר אילן.');
  assert.match(view.announced.at(-1), /191/);
  app.suspend();
});

test('חיפוש מתקדם: בלי מילה — אין בקשה, ההערה והפוקוס על הבעיה', async () => {
  const { app, bridge, view } = await bootAdvanced({});
  app.openAdvanced();
  await app.runAdvanced();
  assert.equal(requests(bridge, '/text/search').length, 0);
  assert.match(app.model.advanced.problem.message, /לפחות מילה אחת/);
  assert.equal(view.problemFocus, app.model.advanced.problem);
  // תיקון: ההערה מתעדכנת בהקלדה, בלי לבנות את השדה מחדש.
  const sheets = view.sheets.length;
  app.advancedWord(0, 0, 'נר');
  assert.equal(app.model.advanced.problem, null);
  assert.equal(view.sheets.length, sheets);
  assert.ok(view.advancedUpdates >= 1);
  app.suspend();
});

test('חיפוש מתקדם: בר אילן דחה את השאילתה — ההודעה שלו', async () => {
  const { app } = await bootAdvanced({
    '/text/search': reply(400, {
      error: { code: 'queryInvalid', message: 'בר אילן לא קיבל את השאילתה: אין משפחה בשם זה.' },
    }),
  });
  app.advancedSet({ manual: true, manualText: '<שבט>' });
  await app.runAdvanced();
  assert.equal(app.model.advanced.status.kind, 'error');
  assert.match(app.model.advanced.status.text, /אין משפחה בשם זה/);
  assert.equal(app.model.advanced.running, false);
  app.suspend();
});

test('חיפוש מתקדם: תחום — הבורר נטען, בחירה נשלחת כנתיבים וספרים', async () => {
  const { app, bridge, view } = await bootAdvanced({
    '/catalog/browse': (params) => reply(200, JSON.parse(params.body).path ? innerLevel : rootLevel),
    '/text/search': reply(200, { ok: true, outcome: 'found', count: 8, query: 'נר', advanced: true }),
  });
  app.openAdvanced();
  app.advancedScopeMode('pick');
  await until(() => app.model.advanced.picker.level !== null);
  assert.equal(view.sheetFocus, undefined);
  app.advancedWord(0, 0, 'נר');
  assert.deepEqual(app.model.advanced.picker.level, rootLevel);
  app.advancedToggleScope({ type: 'category', path: 'שו"ת', name: 'שו"ת' });
  await app.advancedBrowse('שו"ת');
  app.advancedToggleScope({ type: 'book', key: book.key, name: book.title, path: 'שו"ת' });
  // הספר בתוך קטגוריה שכבר נבחרה: הבחירה שלו מוחלפת בקטגוריה.
  assert.equal(app.model.advanced.query.scope.items.length, 2);
  await app.runAdvanced();
  const sent = requests(bridge, '/text/search')[0].body;
  assert.deepEqual(sent.scope, { paths: ['שו"ת'], books: [book.key] });
  assert.equal('allDatabases' in sent.options, false);
  app.suspend();
});

test('חיפוש מתקדם: נשמר אחרי הפסקה בהקלדה, ונטען בפתיחה הבאה', async () => {
  const stored = {};
  const first = await bootAdvanced({});
  first.bridge.methods['storage.set'] = ({ key, value }) => ((stored[key] = value), true);
  first.app.advancedWord(0, 0, 'שבת');
  first.app.advancedSet({ options: { abbreviations: true, showForms: false } });
  // השמירה ממתינה להפסקה בהקלדה (600ms): המתנה בזמן אמיתי, לא בתורות.
  assert.equal(stored.responsa_advanced_query, undefined);
  await new Promise((resolve) => setTimeout(resolve, 900));
  assert.ok(stored.responsa_advanced_query);
  first.app.suspend();

  const second = setup({ '/health': advancedHealth, '/status': reply(200, ready) });
  second.bridge.methods['storage.get'] = ({ key }) => stored[key] ?? null;
  await second.app.boot(windows);
  assert.deepEqual(second.app.model.advanced.query.terms[0].words, ['שבת']);
  assert.equal(second.app.model.advanced.query.options.abbreviations, true);
  second.app.suspend();
});

test('פתיחת בר אילן: מהדיאלוג — הודעה בו; מהמסך הראשי — כשל כהודעה של אוצריא', async () => {
  let fail = false;
  const { app, bridge } = await bootAdvanced({
    '/responsa/show': () =>
      fail
        ? reply(409, { error: { code: 'notRunning', message: 'בר אילן לא עלה' } })
        : reply(200, { ok: true, broughtToFront: true }),
  });
  app.openAdvanced();
  await app.showResponsa();
  assert.equal(app.model.showing, false);
  assert.deepEqual(app.model.advanced.status, { kind: 'success', text: 'בר אילן נפתח.' });
  app.closeSheet();
  fail = true;
  await app.showResponsa();
  assert.deepEqual(bridge.notifications('ui.showError'), ['בר אילן לא עלה']);
  app.suspend();
});

test('חיפוש מתקדם: שירות ישן — אין בקשה', async () => {
  const { app, bridge } = setup({ '/status': reply(200, ready) });
  await app.boot(windows);
  app.advancedWord(0, 0, 'נר');
  await app.runAdvanced();
  assert.equal(requests(bridge, '/text/search').length, 0);
  app.suspend();
});
