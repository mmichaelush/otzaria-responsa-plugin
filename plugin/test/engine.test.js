'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Engine: EngineModule, Settings, Service } = loadPlugin();
const { Engine } = EngineModule;
const { ServiceError } = Service;

/** runtime מדומה: מה שנקרא, מה שהוצג, ותשובה לכל שיטה. */
function fakeRuntime(answers) {
  const calls = [];
  const toasts = [];
  const call = async (method, payload) => {
    calls.push({ method, payload });
    const answer = answers && answers[method];
    if (answer instanceof Error) throw answer;
    return typeof answer === 'function' ? answer(payload) : answer;
  };
  return {
    calls,
    toasts,
    call,
    callSoft: async (method, payload) => {
      try {
        return await call(method, payload);
      } catch (_) {
        return null;
      }
    },
    notify: {
      info: async (message) => toasts.push(['info', message]),
      success: async (message) => toasts.push(['success', message]),
      error: async (message) => toasts.push(['error', message]),
    },
  };
}

/** שירות שמכיר חיפוש טקסט, אלא אם נאמר אחרת. */
/** מה שצריך כדי שהרשימה תגיע לחיפוש הספרייה. */
const LIBRARY_PERMISSIONS = ['library.books.provide', 'app.startup_contributions'];

const CURRENT_HEALTH = { capabilities: ['searchText', 'export'] };

function setup({ answers, service, permissions, pluginVersion } = {}) {
  const runtime = fakeRuntime(answers);
  const activity = [];
  const engine = new Engine(runtime, { health: CURRENT_HEALTH, ...(service || {}) }, {
    permissions,
    pluginVersion,
    onActivity: (value) => activity.push(value),
  });
  return { engine, runtime, activity };
}

test('פתיחה מהספרייה: הספר נפתח בבר אילן לפי המזהה, עם הודעה ו"פותח…"', async () => {
  const opened = [];
  const { engine, runtime, activity } = setup({
    service: { open: async (key) => (opened.push(key), { ok: true, broughtToFront: true }) },
  });
  await engine.openFromLibrary({ provider: 'responsa', id: 7008, title: 'אבני נזר' });
  assert.deepEqual(opened, ['7008']);
  assert.deepEqual(runtime.toasts, [['success', '"אבני נזר" נפתח בבר אילן']]);
  assert.deepEqual(activity, [{ kind: 'opening', title: 'אבני נזר' }, null]);
});

test('פתיחה מהספרייה: כשל מהשירות מוצג כפי שהוא', async () => {
  const { engine, runtime, activity } = setup({
    service: {
      open: async () => {
        throw new ServiceError('windowLimit', 'יותר מדי חלונות');
      },
    },
  });
  await engine.openFromLibrary({ provider: 'responsa', id: 1, title: 'א' });
  assert.deepEqual(runtime.toasts, [['error', 'יותר מדי חלונות']]);
  assert.equal(activity.at(-1), null, '"פותח…" נעלם גם בכשל');
});

test('פתיחה מהספרייה: ספק אחר נזרק, ומזהה פגום מקבל הסבר', async () => {
  const { engine, runtime } = setup({ service: { open: async () => assert.fail('לא אמור לפתוח') } });
  await engine.openFromLibrary({ provider: 'other', id: 1 });
  assert.deepEqual(runtime.toasts, []);
  await engine.openFromLibrary({ provider: 'responsa', id: '7' });
  assert.equal(runtime.toasts.length, 1);
  assert.equal(runtime.toasts[0][0], 'error');
});

test('לחיצה ימנית: פריט אחר נזרק, בחירה ריקה מקבלת הסבר', async () => {
  const { engine, runtime } = setup({ service: { searchText: async () => assert.fail() } });
  await engine.contextMenuClicked({ itemId: 'marker-colors', selectedText: 'א' });
  assert.deepEqual(runtime.toasts, []);
  await engine.contextMenuClicked({ itemId: 'responsa-search', selectedText: '   ' });
  assert.match(runtime.toasts[0][1], /יש לסמן בספר/);
});

test('לחיצה ימנית: התשובה של בר אילן הופכת להודעה המתאימה', async () => {
  const replies = [
    { outcome: 'found', count: 2543, query: 'ואהבת לרעך כמוך', truncated: false },
    { outcome: 'asked', query: 'קקק', truncated: false },
    { outcome: 'refused', query: 'שבת', message: 'נמצאו מעל 32000 תוצאות', truncated: true },
  ];
  const sent = [];
  const { engine, runtime } = setup({
    service: { searchText: async (text) => (sent.push(text), replies.shift()) },
  });
  for (const text of ['ואהבת לרעך כמוך', 'קקק', 'שבת']) {
    await engine.contextMenuClicked({ itemId: 'responsa-search', selectedText: text });
  }
  assert.deepEqual(sent, ['ואהבת לרעך כמוך', 'קקק', 'שבת']);
  assert.deepEqual(
    runtime.toasts.map(([kind]) => kind),
    ['success', 'success', 'error'],
    '"שואל" אינו כשל: בר אילן ממתין לתשובה של המשתמש',
  );
  assert.match(runtime.toasts[0][1], /2,543/);
  assert.match(runtime.toasts[2][1], /32000/);
  assert.match(runtime.toasts[2][1], /רק את תחילת הטקסט/);
});

test('פקודת פתיחת הלשונית; בלי ההרשאה מקבלים הסבר', async () => {
  const withPermission = setup({ answers: { 'plugin.openSelf': true } });
  await withPermission.engine.command({ command: 'responsa.openPanel' });
  assert.deepEqual(withPermission.runtime.toasts, []);

  const without = setup({ answers: { 'plugin.openSelf': new Error('permission_denied') } });
  await without.engine.command({ command: 'responsa.openPanel' });
  assert.equal(without.runtime.toasts[0][0], 'info');

  await without.engine.command({ command: 'other' });
  assert.equal(without.runtime.toasts.length, 1);
});

const readyStatus = { catalog: { exists: true, bookCount: 2, builtAt: '2026-09-29T10:00:00Z' } };
const exported = {
  builtAt: '2026-09-29T10:00:00Z',
  books: [
    ['7008', 'אבני נזר', 'רבי אברהם בורנשטיין', 'שו"ת'],
    ['31', 'חידושי אגדות', null, 'מפרשים ופוסקים על הבבלי/מהרש"א'],
    ['x', 'מזהה לא מספרי', null, ''],
  ],
};

test('חיפוש הספרייה: נשלח לאוצריא רק כשהמארח תומך ברשימה חדשה', async () => {
  const unsupported = setup({ service: { exportCatalog: async () => assert.fail() } });
  assert.equal(await unsupported.engine.syncLibrary(readyStatus), false);

  const { engine, runtime } = setup({
    permissions: LIBRARY_PERMISSIONS,
    pluginVersion: '0.2.0',
    answers: { 'storage.get': null, 'library.setProviderBooks': { count: 2 }, 'storage.set': true },
    service: { exportCatalog: async () => exported },
  });
  assert.equal(await engine.syncLibrary(readyStatus), true);
  const sent = runtime.calls.find((c) => c.method === 'library.setProviderBooks').payload;
  assert.equal(sent.provider, 'responsa');
  assert.deepEqual(sent.books, [
    { id: 7008, title: 'אבני נזר', author: 'רבי אברהם בורנשטיין', categoryPath: '/בר אילן/שו"ת' },
    { id: 31, title: 'חידושי אגדות', categoryPath: '/בר אילן/מפרשים ופוסקים על הבבלי/מהרש"א' },
  ]);
  const marker = runtime.calls.find((c) => c.method === 'storage.set').payload;
  assert.deepEqual(marker, {
    key: Settings.KEYS.librarySync,
    value: { builtAt: '2026-09-29T10:00:00Z', count: 2, pluginVersion: '0.2.0' },
  });
});

test('חיפוש הספרייה: רשימה שכבר נשלחה אינה נשלחת שוב, וכשל אינו זורק', async () => {
  const same = setup({
    permissions: LIBRARY_PERMISSIONS,
    answers: { 'storage.get': { builtAt: '2026-09-29T10:00:00Z', count: 2 } },
    service: { exportCatalog: async () => assert.fail('אין צורך לייצא') },
  });
  assert.equal(await same.engine.syncLibrary(readyStatus), false);

  const failing = setup({
    permissions: LIBRARY_PERMISSIONS,
    answers: { 'storage.get': null, 'library.setProviderBooks': new Error('error.invalid_params') },
    service: { exportCatalog: async () => exported },
  });
  assert.equal(await failing.engine.syncLibrary(readyStatus), false);
  assert.equal(
    failing.runtime.calls.some((c) => c.method === 'storage.set'),
    false,
    'בלי שליחה מוצלחת לא נשמר סימון',
  );
});

test('חיפוש הספרייה: שתי בקשות חופפות שולחות פעם אחת', async () => {
  let exports = 0;
  const { engine } = setup({
    permissions: LIBRARY_PERMISSIONS,
    answers: { 'storage.get': null, 'library.setProviderBooks': {}, 'storage.set': true },
    service: { exportCatalog: async () => (exports++, exported) },
  });
  await Promise.all([engine.syncLibrary(readyStatus), engine.syncLibrary(readyStatus)]);
  assert.equal(exports, 1);
});

test('הגדרות: נקראות מהאחסון, ערך פגום חוזר לברירת המחדל', async () => {
  const runtime = fakeRuntime({
    'storage.get': ({ key }) =>
      ({
        responsa_language: 'klingon',
        responsa_library_books: false,
        responsa_welcome_seen: 'yes',
        responsa_advanced_query: ['not', 'an', 'object'],
      })[key] ?? null,
  });
  const store = new Settings.SettingsStore(runtime);
  assert.deepEqual(await store.load(), {
    language: 'auto',
    libraryBooks: false,
    contextMenu: true,
    startupNotice: false,
    welcomeSeen: false,
    browsePath: '',
    advancedQuery: null,
  });
});

test('הגדרות: קריאה שנכשלה אינה "אין הגדרות", ושמירה שנכשלה זורקת', async () => {
  const runtime = fakeRuntime({ 'storage.get': new Error('rate'), 'storage.set': new Error('x') });
  const store = new Settings.SettingsStore(runtime);
  assert.deepEqual(await store.load(), Settings.DEFAULTS);
  await assert.rejects(store.set('contextMenu', false));
  assert.equal(store.get('contextMenu'), true, 'המצב בזיכרון לא השתנה');
});

test('הגדרות: כל מתג נשמר במפתח משלו, בערך פשוט', async () => {
  const runtime = fakeRuntime({ 'storage.set': true });
  const store = new Settings.SettingsStore(runtime);
  await store.set('contextMenu', false);
  await store.set('language', 'en');
  assert.deepEqual(
    runtime.calls.map((c) => c.payload),
    [
      { key: 'responsa_context_menu', value: false },
      { key: 'responsa_language', value: 'en' },
    ],
  );
});

test('לחיצה ימנית: שירות ישן בלי חיפוש טקסט מקבל הסבר, בלי לנסות', async () => {
  const { engine, runtime } = setup({
    service: {
      health: { capabilities: ['export'] },
      searchText: async () => assert.fail('שירות ישן אינו מכיר את הנתיב'),
    },
  });
  await engine.contextMenuClicked({ itemId: 'responsa-search', selectedText: 'שבת' });
  assert.equal(runtime.toasts[0][0], 'error');
  assert.match(runtime.toasts[0][1], /לעדכן את שירות בר אילן/);
});

test('לחיצה ימנית: בלי מידע על השירות מתחברים קודם', async () => {
  let connected = 0;
  const { engine, runtime } = setup({
    service: {
      health: null,
      connect: async () => (connected++, CURRENT_HEALTH),
      searchText: async () => ({ outcome: 'found', count: 1, query: 'שבת', truncated: false }),
    },
  });
  await engine.contextMenuClicked({ itemId: 'responsa-search', selectedText: 'שבת' });
  assert.equal(connected, 1);
  assert.equal(runtime.toasts[0][0], 'success');
});

test('לחיצה ימנית: קטע ארוך נחתך לפני השליחה', async () => {
  const sent = [];
  const { engine } = setup({
    service: {
      searchText: async (text) => (sent.push(text), { outcome: 'found', count: 1, query: 'שבת', truncated: true }),
    },
  });
  await engine.searchSelection('שבת '.repeat(2000));
  assert.equal(sent[0].length, 2000);
});

test('לחיצה ימנית: טקסט בלי עברית מקבל הסבר ברור', async () => {
  const { engine, runtime } = setup({
    service: {
      searchText: async () => {
        throw new ServiceError('badRequest', 'Bad request');
      },
    },
  });
  await engine.contextMenuClicked({ itemId: 'responsa-search', selectedText: 'Genesis' });
  assert.match(runtime.toasts[0][1], /אין מילים בעברית/);
});

test('כותרת הפריט בתפריט מעודכנת לשפה הנוכחית', async () => {
  const { engine, runtime } = setup({ answers: { 'reader.updateContextMenuItem': true } });
  await engine.patchContextMenuTitle();
  const patch = runtime.calls.find((c) => c.method === 'reader.updateContextMenuItem').payload;
  assert.deepEqual(patch, { id: 'responsa-search', patch: { title: 'חיפוש בבר אילן' } });
});

test('חיפוש הספרייה: גרסה חדשה של התוסף שולחת את הרשימה מחדש', async () => {
  const synced = { builtAt: readyStatus.catalog.builtAt, count: 2, pluginVersion: '0.1.0' };
  const { engine, runtime } = setup({
    permissions: LIBRARY_PERMISSIONS,
    pluginVersion: '0.2.0',
    answers: { 'storage.get': synced, 'library.setProviderBooks': { count: 2 }, 'storage.set': true },
    service: { exportCatalog: async () => exported },
  });
  assert.equal(await engine.syncLibrary(readyStatus), true);
  assert.ok(runtime.calls.some((c) => c.method === 'library.setProviderBooks'));
});

test('חיפוש הספרייה: אחרי כשל אין ניסיון חוזר מיד', async () => {
  let now = 0;
  let exports = 0;
  const runtime = fakeRuntime({ 'storage.get': null });
  const engine = new Engine(
    runtime,
    {
      health: CURRENT_HEALTH,
      exportCatalog: async () => {
        exports++;
        throw new ServiceError('unavailable', 'down');
      },
    },
    { permissions: LIBRARY_PERMISSIONS, now: () => now },
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await engine.syncLibrary(readyStatus), false);
    now = 60 * 1000;
    assert.equal(await engine.syncLibrary(readyStatus), false);
    assert.equal(exports, 1, 'דקה אחרי הכשל');
    now = 11 * 60 * 1000;
    await engine.syncLibrary(readyStatus);
    assert.equal(exports, 2, 'אחרי עשר דקות');
  } finally {
    console.warn = warn;
  }
});

test('חיפוש הספרייה: בלי "הוספת רכיבים לתוכנה" לא שולחים (אוצריא הייתה דוחה)', async () => {
  const { engine } = setup({
    permissions: ['library.books.provide'],
    service: { exportCatalog: async () => assert.fail('אין טעם לקרוא את הרשימה') },
  });
  assert.equal(await engine.syncLibrary(readyStatus), false);
});

test('חיפוש הספרייה: הדלקת הרשאה מבטלת את ההמתנה שאחרי כשל', async () => {
  let exports = 0;
  const runtime = fakeRuntime({ 'storage.get': null });
  const engine = new Engine(
    runtime,
    {
      health: CURRENT_HEALTH,
      exportCatalog: async () => {
        exports++;
        throw new ServiceError('unavailable', 'down');
      },
    },
    { permissions: LIBRARY_PERMISSIONS, now: () => 0 },
  );
  const warn = console.warn;
  console.warn = () => {};
  try {
    await engine.syncLibrary(readyStatus);
    engine.setPermissions([...LIBRARY_PERMISSIONS]);
    await engine.syncLibrary(readyStatus);
    assert.equal(exports, 1, 'אותן הרשאות: עדיין ממתינים');
    engine.setPermissions([...LIBRARY_PERMISSIONS, 'app.run_on_startup']);
    await engine.syncLibrary(readyStatus);
    assert.equal(exports, 2);
  } finally {
    console.warn = warn;
  }
});

test('כותרת הפריט: בלי "הוספת רכיבים לתוכנה" הפריט לא קיים, ולא מנסים לעדכן אותו', async () => {
  const { engine, runtime } = setup({ permissions: ['reader.context_menu'] });
  assert.equal(await engine.patchContextMenuTitle(), null);
  assert.equal(runtime.calls.some((c) => c.method === 'reader.updateContextMenuItem'), false);
});

test('ההבהרה על הרישיון: בפעולה הראשונה מהרקע נפתח מסך הפתיחה, פעם אחת', async () => {
  const { engine, runtime } = setup({ answers: { 'plugin.openSelf': true } });
  assert.equal(await engine.ensureLicenseNotice(false), true);
  const opened = runtime.calls.find((c) => c.method === 'plugin.openSelf');
  assert.deepEqual(opened.payload, { param: { view: 'welcome' } });
  assert.equal(await engine.ensureLicenseNotice(false), false, 'פעם אחת לכל הפעלה');
  assert.equal(runtime.calls.filter((c) => c.method === 'plugin.openSelf').length, 1);
});

test('ההבהרה על הרישיון: כבר הוצגה — אין מה לעשות; בלי הרשאה — הודעה', async () => {
  const seen = setup({});
  assert.equal(await seen.engine.ensureLicenseNotice(true), false);
  assert.equal(seen.runtime.calls.length, 0);

  const blocked = setup({ answers: { 'plugin.openSelf': new Error('permission_denied') } });
  await blocked.engine.ensureLicenseNotice(false);
  assert.equal(blocked.runtime.toasts[0][0], 'info');
  assert.match(blocked.runtime.toasts[0][1], /שארית ישראל לא יעשו עוולה/);
});
