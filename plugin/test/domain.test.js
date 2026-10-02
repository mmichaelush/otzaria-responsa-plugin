'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Domain } = loadPlugin();
const { Screen } = Domain;

const health = { ok: true, service: 'otzaria-responsa', apiVersion: 1 };
const catalogReady = { exists: true, bookCount: 8402, matchesInstallation: true };
const status = (overrides) =>
  Object.assign(
    { installed: true, catalog: { exists: false, bookCount: 0 }, build: { state: 'idle' } },
    overrides,
  );

test('screenFor: פלטפורמה שאינה Windows', () => {
  assert.equal(Domain.screenFor({ platform: 'linux' }), Screen.unsupported);
});

test('screenFor: אין שירות מאזין', () => {
  assert.equal(
    Domain.screenFor({ platform: 'windows', failure: { code: 'serviceUnavailable' } }),
    Screen.serviceMissing,
  );
});

test('screenFor: הרשאה חסרה, בין מהרשימה ובין מהמארח', () => {
  assert.equal(
    Domain.screenFor({ platform: 'windows', permissions: ['app.open_url'] }),
    Screen.permissionDenied,
  );
  assert.equal(
    Domain.screenFor({ failure: { code: 'permissionDenied' } }),
    Screen.permissionDenied,
  );
});

test('screenFor: תוכנה אחרת בפורט', () => {
  assert.equal(Domain.screenFor({ failure: { code: 'portTaken' } }), Screen.portTaken);
  assert.equal(Domain.screenFor({ health: { service: 'other' } }), Screen.portTaken);
});

test('screenFor: גרסאות לא תואמות, בשני הכיוונים', () => {
  const service = (apiVersion) => ({ service: 'otzaria-responsa', apiVersion });
  assert.equal(Domain.screenFor({ health: service(0) }), Screen.serviceOutdated);
  assert.equal(Domain.screenFor({ health: service(2) }), Screen.pluginOutdated);
});

test('screenFor: השירות ענה ונכשל אחר כך = לא מגיב', () => {
  assert.equal(
    Domain.screenFor({ health, failure: { code: 'timeout' } }),
    Screen.serviceError,
  );
  assert.equal(Domain.screenFor({ failure: { code: 'timeout' } }), Screen.serviceMissing);
});

test('screenFor: בר אילן לא מותקן', () => {
  assert.equal(
    Domain.screenFor({ health, status: status({ installed: false }) }),
    Screen.notInstalled,
  );
});

test('screenFor: צריך קטלוג, בונה, נכשל', () => {
  assert.equal(Domain.screenFor({ health, status: status() }), Screen.needsCatalog);
  assert.equal(
    Domain.screenFor({ health, status: status({ build: { state: 'running' } }) }),
    Screen.building,
  );
  assert.equal(
    Domain.screenFor({ health, status: status({ build: { state: 'failed' } }) }),
    Screen.buildFailed,
  );
});

test('screenFor: קטלוג קיים נשאר שמיש גם בזמן בנייה מחדש', () => {
  assert.equal(
    Domain.screenFor({
      health,
      status: status({ catalog: catalogReady, build: { state: 'running' } }),
    }),
    Screen.ready,
  );
});

test('screenFor: קטלוג קיים גם כשבר אילן הוסר (רק הפתיחה תיכשל)', () => {
  assert.equal(
    Domain.screenFor({ health, status: status({ installed: false, catalog: catalogReady }) }),
    Screen.ready,
  );
});

test('catalogNotice', () => {
  assert.equal(Domain.catalogNotice(status({ catalog: catalogReady })), null);
  assert.equal(
    Domain.catalogNotice(
      status({
        catalog: catalogReady,
        build: { state: 'failed', error: { code: 'notResponding', message: 'x' } },
      }),
    ).kind,
    'rebuildFailed',
  );
  assert.equal(
    Domain.catalogNotice(
      status({ catalog: Object.assign({}, catalogReady, { matchesInstallation: false }) }),
    ).kind,
    'otherInstallation',
  );
  assert.equal(
    Domain.catalogNotice(status({ catalog: Object.assign({}, catalogReady, { outdated: true }) }))
      .kind,
    'outdated',
  );
  assert.equal(Domain.catalogNotice(status()), null);
});

test('buildProgress: עם מכנה', () => {
  const p = Domain.buildProgress(
    { stage: 'scanning', scanned: 625944, expected: 1251889 },
    150000,
  );
  assert.equal(p.percent, 50);
  assert.match(p.detail, /נקראו .* מתוך כ-/);
  assert.equal(p.remaining, 'נותרו כ-3 דקות');
});

test('buildProgress: לעולם לא 100% לפני הסיום', () => {
  const p = Domain.buildProgress({ stage: 'scanning', scanned: 2000000, expected: 1000 }, 1000);
  assert.equal(p.percent, 98);
});

test('buildProgress: בלי מכנה אין אחוז, רק חלקים', () => {
  const p = Domain.buildProgress(
    { stage: 'scanning', scanned: 1000, sectionsDone: 3, sectionsTotal: 20 },
    60000,
  );
  assert.equal(p.fraction, null);
  assert.equal(p.remaining, '');
  assert.match(p.detail, /חלק 3 מתוך 20/);
});

test('buildProgress: התחלה ומיון', () => {
  assert.equal(Domain.buildProgress(null, 0).fraction, null);
  assert.equal(Domain.buildProgress({ stage: 'classifying', scanned: 10 }, 1).percent, 99);
});

test('remainingLabel', () => {
  assert.equal(Domain.remainingLabel(0.01, 60000), '');
  assert.equal(Domain.remainingLabel(0.9, 60000), 'פחות מדקה');
  assert.equal(Domain.remainingLabel(0.5, 60000), 'נותרה כדקה');
});

test('bookMeta ו-bookContext', () => {
  assert.equal(
    Domain.bookMeta({ author: 'ר\' שמואל', pubPlace: '', pubDate: 'תש"מ' }),
    'ר\' שמואל · תש"מ',
  );
  assert.equal(Domain.bookMeta({}), '');
  assert.equal(Domain.bookContext({ contextPath: 'א/ב/ג' }), 'א › ב › ג');
  assert.equal(Domain.bookContext({ contextPath: '' }), '');
});

test('booksLabel', () => {
  assert.equal(Domain.booksLabel(1), 'ספר אחד');
  assert.equal(Domain.booksLabel(8402), '8,402 ספרים');
});

test('needsRefresh', () => {
  assert.equal(Domain.needsRefresh('catalogMissing'), true);
  assert.equal(Domain.needsRefresh('otherSession'), true);
  assert.equal(Domain.needsRefresh('catalogUnreadable'), false);
  assert.equal(Domain.needsRefresh('wrongBook'), false);
});

test('foundLabel ו-serviceUrls', () => {
  assert.equal(Domain.foundLabel(1), 'נמצא ספר אחד');
  assert.equal(Domain.foundLabel(78), 'נמצאו 78 ספרים');
  const urls = Domain.serviceUrls();
  assert.equal(urls.length, 10);
  assert.equal(urls[0], 'http://127.0.0.1:39700');
  assert.equal(urls[9], 'http://127.0.0.1:39709');
});

test('formatBuiltAt', () => {
  assert.equal(Domain.formatBuiltAt(''), '');
  assert.equal(Domain.formatBuiltAt('not a date'), '');
  assert.match(Domain.formatBuiltAt('2026-09-28T19:13:04'), /2026/);
});

test('subtitleFor: שורת המשנה בפס העליון לפי המסך', () => {
  const ready = { screen: Domain.Screen.ready, status: { version: 25, catalog: { bookCount: 8402 } } };
  assert.equal(Domain.subtitleFor(ready), '8,402 ספרים · מהדורה 25');
  assert.equal(Domain.subtitleFor({ ...ready, buildActive: true }), '8,402 ספרים · מהדורה 25 · קורא מחדש…');
  assert.equal(Domain.subtitleFor({ screen: Domain.Screen.permissionDenied }), 'נדרשת הרשאה');
  assert.equal(Domain.subtitleFor({ screen: Domain.Screen.loading }), '');
});

test('bookDetails: כל מה שבקטלוג, ורק שדות שיש בהם ערך', () => {
  const details = Domain.bookDetails({
    key: '7008',
    title: 'אבני נזר',
    author: 'רבי אברהם בורנשטיין',
    pubPlace: 'ירושלים',
    pubDate: 'תשס"ו',
    edition: 'ירושלים תשס"ו, ד"צ פיוטרקוב תרע"ב',
    contextPath: 'שו"ת/אחרונים',
    topics: '',
    otzariaCategory: 'שו"ת/אחרונים',
  });
  assert.deepEqual(
    details.map(({ label, value }) => [label, value]),
    [
      ['מחבר', 'רבי אברהם בורנשטיין'],
      ['מקום הדפסה', 'ירושלים'],
      ['שנת הדפסה', 'תשס"ו'],
      ['מהדורה', 'ירושלים תשס"ו, ד"צ פיוטרקוב תרע"ב'],
      ['מיקום בבר אילן', 'שו"ת › אחרונים'],
      ['קטגוריה מקבילה באוצריא', 'שו"ת › אחרונים'],
      ['מזהה בבר אילן', '7008'],
    ],
  );
});

test('bookDetails: מהדורה שאינה יותר ממקום ושנה אינה חוזרת פעמיים', () => {
  const details = Domain.bookDetails({ key: '1', pubPlace: 'וינה', pubDate: 'תרנ"ח', edition: 'וינה, תרנ"ח' });
  assert.deepEqual(
    details.map(({ label }) => label),
    ['מקום הדפסה', 'שנת הדפסה', 'מזהה בבר אילן'],
  );
});

test('setupChecklist: מה מוכן, מה חסר ומה עוד לא ידוע', () => {
  const states = (model) => Object.fromEntries(Domain.setupChecklist(model).map((i) => [i.id, i.state]));
  assert.deepEqual(states({ screen: Screen.loading, permissions: null }), {
    responsa: 'unknown',
    service: 'unknown',
    permission: 'unknown',
    catalog: 'unknown',
  });
  assert.deepEqual(states({ screen: Screen.serviceMissing, permissions: ['network.localhost'] }), {
    responsa: 'unknown',
    service: 'missing',
    permission: 'missing',
    catalog: 'unknown',
  });
  assert.deepEqual(
    states({
      screen: Screen.ready,
      health,
      status: status({ catalog: catalogReady }),
      permissions: ['network.localhost', 'app.startup_contributions'],
    }),
    { responsa: 'done', service: 'done', permission: 'done', catalog: 'done' },
  );
  assert.equal(
    states({ screen: Screen.notInstalled, health, status: { installed: false }, permissions: [] })
      .responsa,
    'missing',
  );
});

test('Links: כתובות https בלבד, והפורום מצביע על ההבהרה', () => {
  for (const url of Object.values(Domain.Links)) assert.match(url, /^https:\/\//);
  assert.equal(Domain.Links.forum, 'https://otzaria.org/forum/post/40010');
});


test('breadcrumbs ו-scopeName', () => {
  assert.deepEqual(Domain.breadcrumbs(''), [{ name: 'כל הספרים', path: '' }]);
  assert.deepEqual(Domain.breadcrumbs('א/ב'), [
    { name: 'כל הספרים', path: '' },
    { name: 'א', path: 'א' },
    { name: 'ב', path: 'א/ב' },
  ]);
  assert.equal(Domain.scopeName('א/ב'), 'ב');
  assert.equal(Domain.scopeName(''), '');
});

test('serviceNotice: שירות בלי browse מקבל הערה משלו', () => {
  const caps = (list) => ({ capabilities: list });
  assert.equal(Domain.serviceNotice(caps(['searchText', 'browse'])), null);
  assert.match(Domain.serviceNotice(caps(['searchText'])).text, /עיון בקטגוריות/);
  assert.match(Domain.serviceNotice(caps([])).text, /לחיצה ימנית/);
});
