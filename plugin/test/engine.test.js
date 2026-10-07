'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Engine: EngineModule, Settings, Service, Domain } = loadPlugin();
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
  const engine = new Engine(runtime, { health: CURRENT_HEALTH, ...(service || {}) }, {
    permissions,
    pluginVersion,
  });
  return { engine, runtime };
}

test('פורט השירות נשמר לאוצריא רק כשהשתנה, ורק פעם אחת בהפעלה', async () => {
  const stored = {};
  const { engine, runtime } = setup({
    answers: {
      'storage.get': ({ key }) => stored[key] ?? null,
      'storage.set': ({ key, value }) => {
        stored[key] = value;
        return true;
      },
    },
  });
  assert.equal(await engine.savePort('http://127.0.0.1:39701'), true);
  assert.equal(stored[Settings.KEYS.servicePort], 39701);
  // אותו פורט: אין קריאה נוספת לאחסון בכלל.
  const before = runtime.calls.length;
  assert.equal(await engine.savePort('http://127.0.0.1:39701'), false);
  assert.equal(runtime.calls.length, before);
  // השירות עבר לפורט אחר: נשמר מחדש.
  assert.equal(await engine.savePort('http://127.0.0.1:39703'), true);
  assert.equal(stored[Settings.KEYS.servicePort], 39703);
});

test('פורט השירות: כתובת לא תקינה אינה נשמרת, וכשל באחסון אינו זורק', async () => {
  const quiet = setup({});
  assert.equal(await quiet.engine.savePort(null), false);
  assert.equal(await quiet.engine.savePort('http://localhost:39700'), false);
  assert.equal(quiet.runtime.calls.length, 0);

  const failing = setup({ answers: { 'storage.get': new Error('rate_limited') } });
  assert.equal(await failing.engine.savePort('http://127.0.0.1:39700'), false);
});

test('שירות לפני 0.5.0: הפורט נמחק, כדי שאוצריא לא תפנה אליו', async () => {
  const stored = { [Settings.KEYS.servicePort]: 39700 };
  const { engine, runtime } = setup({
    answers: {
      'storage.get': ({ key }) => stored[key] ?? null,
      'storage.set': ({ key, value }) => {
        stored[key] = value;
        return true;
      },
      'storage.remove': ({ key }) => {
        delete stored[key];
        return true;
      },
    },
  });
  const oldService = { capabilities: ['searchText', 'browse'] };
  const newService = { capabilities: ['searchText', 'browse', 'notify'] };

  assert.equal(await engine.syncPort(oldService, 'http://127.0.0.1:39700'), true);
  assert.equal(Settings.KEYS.servicePort in stored, false);
  // כבר נמחק בהפעלה הזו: אין קריאה נוספת.
  const before = runtime.calls.length;
  assert.equal(await engine.syncPort(oldService, 'http://127.0.0.1:39700'), false);
  assert.equal(runtime.calls.length, before);
  // אחרי העדכון: נשמר שוב.
  assert.equal(await engine.syncPort(newService, 'http://127.0.0.1:39700'), true);
  assert.equal(stored[Settings.KEYS.servicePort], 39700);
});

test('הבאת הלשונית לחזית; בלי ההרשאה מקבלים הסבר', async () => {
  const withPermission = setup({ answers: { 'plugin.openSelf': true } });
  await withPermission.engine.showSelf();
  assert.deepEqual(withPermission.runtime.toasts, []);

  const without = setup({ answers: { 'plugin.openSelf': new Error('permission_denied') } });
  await without.engine.showSelf();
  assert.equal(without.runtime.toasts[0][0], 'info');
});

test('כותרות שני פריטי התפריט מתעדכנות לשפה, רק כשהם רשומים', async () => {
  const { engine, runtime } = setup({ permissions: ['app.startup_contributions'] });
  await engine.patchContextMenuTitle();
  const ids = runtime.calls
    .filter((call) => call.method === 'reader.updateContextMenuItem')
    .map((call) => call.payload.id);
  assert.deepEqual(ids, [Domain.CONTEXT_MENU_ITEM, Domain.LOCATE_MENU_ITEM]);

  const blocked = setup({ permissions: [] });
  assert.equal(await blocked.engine.patchContextMenuTitle(), null);
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
        responsa_show_forms: 'yes',
      })[key] ?? null,
  });
  const store = new Settings.SettingsStore(runtime);
  assert.deepEqual(await store.load(), {
    language: 'auto',
    font: '',
    scale: 1,
    libraryBooks: false,
    contextMenu: true,
    searchDialog: true,
    autoStart: true,
    showForms: false,
    startupNotice: false,
    welcomeSeen: false,
    browsePath: '',
    advancedQuery: null,
    tab: 'books',
    locateHistory: [],
  });
});

test('הגדרות: גופן מהרשימה, וגודל תצוגה בטווח המחוון', async () => {
  const read = async (values) =>
    new Settings.SettingsStore(fakeRuntime({ 'storage.get': ({ key }) => values[key] ?? null })).load();
  const chosen = await read({ responsa_font: 'Shofar', responsa_scale: 1.3 });
  assert.equal(chosen.font, 'Shofar');
  assert.equal(chosen.scale, 1.3);
  // "רש"י" אינו גופן ממשק, ושם שאינו גופן של אוצריא אינו נכנס ל-CSS.
  for (const font of ['NotoRashiHebrew', "x'; color: red", 7]) {
    assert.equal((await read({ responsa_font: font })).font, '');
  }
  // ערך בטווח מעוגל לקפיצה של 5%, ובקצוות נשאר כפי שהוא.
  assert.equal((await read({ responsa_scale: 1.12 })).scale, 1.1);
  assert.equal((await read({ responsa_scale: 1.15 })).scale, 1.15);
  assert.equal((await read({ responsa_scale: 0.9 })).scale, 0.9);
  assert.equal((await read({ responsa_scale: 1.5 })).scale, 1.5);
  for (const scale of [0, 0.85, 1.6, '1.3', 9, Number.NaN, Infinity]) {
    assert.equal((await read({ responsa_scale: scale })).scale, 1);
  }
});

test('הגדרות: הלשונית האחרונה והמקומות האחרונים, בגבולות', async () => {
  const long = 'א'.repeat(201);
  const runtime = fakeRuntime({
    'storage.get': ({ key }) =>
      ({
        responsa_tab: 'locate',
        responsa_locate_history: ['בראשית ב ג', 7, '', long, ...Array(12).fill('ברכות דף ב')],
      })[key] ?? null,
  });
  const values = await new Settings.SettingsStore(runtime).load();
  assert.equal(values.tab, 'locate');
  assert.equal(values.locateHistory[0], 'בראשית ב ג');
  assert.equal(values.locateHistory.length, Settings.MAX_LOCATE_HISTORY);
  assert.ok(!values.locateHistory.includes(long));

  const unknown = fakeRuntime({ 'storage.get': ({ key }) => (key === 'responsa_tab' ? 'nope' : null) });
  assert.equal((await new Settings.SettingsStore(unknown).load()).tab, 'books');
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


test('המתג "ספרי בר אילן בחיפוש הספרייה" כבוי: הרשימה נמחקת מאוצריא פעם אחת, ודלוק — נשלחת שוב', async () => {
  const stored = {};
  const { engine, runtime } = setup({
    permissions: LIBRARY_PERMISSIONS,
    pluginVersion: '0.5.0',
    answers: {
      'storage.get': ({ key }) => stored[key] ?? null,
      'storage.set': ({ key, value }) => ((stored[key] = value), true),
      'library.setProviderBooks': ({ books }) => ({ count: books.length }),
    },
    service: { exportCatalog: async () => exported },
  });
  const sent = () => runtime.calls.filter((c) => c.method === 'library.setProviderBooks').map((c) => c.payload.books.length);
  assert.equal(await engine.syncLibrary(readyStatus), true);
  assert.equal(await engine.syncLibrary(readyStatus, { enabled: false }), true);
  assert.equal(await engine.syncLibrary(readyStatus, { enabled: false }), false, 'כבר נמחקה');
  assert.equal(await engine.syncLibrary(readyStatus, { enabled: true }), true);
  assert.deepEqual(sent(), [2, 0, 2]);

  // מתג שהתהפך בזמן שליחה: רץ אחריה, ולא מצטרף אליה.
  await Promise.all([engine.syncLibrary(readyStatus, { force: true }), engine.syncLibrary(readyStatus, { enabled: false })]);
  assert.deepEqual(sent(), [2, 0, 2, 2, 0]);
});
