'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');
const { FakeBridge, reply } = require('./helpers/fake-bridge');

const { Service, Domain } = loadPlugin();
const { ServiceClient, ServiceError } = Service;

const health = reply(200, { ok: true, service: 'otzaria-responsa', apiVersion: 1 });

/** לקוח שכבר מחובר לשירות בפורט הראשון. */
async function connected(routes) {
  const bridge = new FakeBridge(Object.assign({ '/health': health }, routes));
  const service = new ServiceClient(bridge, undefined, { sleep: async () => {} });
  await service.connect();
  bridge.requests.length = 0;
  return { bridge, service };
}

test('connect: השירות בפורט הראשון', async () => {
  const bridge = new FakeBridge({ '/health': health });
  const service = new ServiceClient(bridge);
  const result = await service.connect();
  assert.equal(result.service, 'otzaria-responsa');
  assert.equal(service.baseUrl, 'http://127.0.0.1:39700');
});

test('connect: מדלג על שירות של משתמש Windows אחר', async () => {
  const bridge = new FakeBridge({
    '39700/health': reply(403, { error: { code: 'otherSession', message: 'x' } }),
    '39701/health': health,
  });
  const service = new ServiceClient(bridge);
  await service.connect();
  assert.equal(service.baseUrl, 'http://127.0.0.1:39701');
});

test('connect: אין שירות בכל הטווח → serviceUnavailable, בכל עשרת הפורטים', async () => {
  const bridge = new FakeBridge({});
  const service = new ServiceClient(bridge);
  await assert.rejects(service.connect(), { code: 'serviceUnavailable' });
  assert.equal(bridge.requests.length, Domain.PORT_COUNT);
});

test('connect: תוכנה אחרת (HTML, JSON זר, 404) → portTaken', async () => {
  for (const foreign of [
    reply(200, '<html>'),
    reply(200, { service: 'other' }),
    reply(404, 'Not Found'),
  ]) {
    const bridge = new FakeBridge({ '39700/health': foreign });
    await assert.rejects(new ServiceClient(bridge).connect(), { code: 'portTaken' });
  }
});

test('connect: הודעות ההרשאה של אוצריא (בעברית, בלי קוד) → permissionDenied', async () => {
  for (const message of [
    'error.permission_denied: לתוסף אין הרשאת גישה לשירותים מקומיים (localhost).',
    'לתוסף אין הרשאת גישה לשירותים מקומיים',
    'error.forbidden: הכתובת אינה ברשימת ההיתר לגישת רשת של תוספים',
  ]) {
    const bridge = new FakeBridge({ '/health': new Error(message) });
    await assert.rejects(new ServiceClient(bridge).connect(), { code: 'permissionDenied' });
  }
});

test('connect: עומס במארח → hostBusy ולא "צריך להתקין"', async () => {
  const bridge = new FakeBridge({
    '/health': new Error('error.rate_limited: too many active network fetch streams'),
  });
  await assert.rejects(new ServiceClient(bridge).connect(), { code: 'hostBusy' });
});

test('connect: מנסה קודם את הפורט שעבד בפעם הקודמת', async () => {
  const bridge = new FakeBridge({ '39703/health': health });
  const service = new ServiceClient(bridge);
  await service.connect();
  bridge.requests.length = 0;
  await service.connect();
  assert.equal(bridge.requests[0].port, 39703);
  assert.equal(bridge.requests.length, 1);
});

test('request: JSON מחולק למקטעים מורכב מחדש', async () => {
  const { service } = await connected({
    '/status': reply(200, '', { chunks: ['{"installed":tr', 'ue}'] }),
  });
  assert.deepEqual(await service.status(), { installed: true });
});

test('request: שולח JSON עם Content-Type', async () => {
  const { bridge, service } = await connected({
    '/catalog/search': reply(200, { total: 0, results: [] }),
  });
  await service.search('יבמות', 0, 50);
  const request = bridge.requests[0];
  assert.equal(request.params.method, 'POST');
  assert.equal(request.params.headers['Content-Type'], 'application/json');
  assert.deepEqual(request.body, { q: 'יבמות', offset: 0, limit: 50 });
});

test('request: שגיאת שירות הופכת ל-ServiceError עם הקוד וההודעה', async () => {
  const { service } = await connected({
    '/book/open': reply(409, {
      error: { code: 'wrongBook', message: 'נפתח ספר אחר', details: { triedRefs: ['x'] } },
    }),
  });
  await assert.rejects(service.open('1'), (error) => {
    assert.ok(error instanceof ServiceError);
    assert.equal(error.code, 'wrongBook');
    assert.equal(error.message, 'נפתח ספר אחר');
    assert.equal(error.status, 409);
    assert.deepEqual(error.details, { triedRefs: ['x'] });
    return true;
  });
});

test('request: שירות שנעלם → החיבור הבא מחפש אותו מחדש', async () => {
  const { service } = await connected({ '/status': new Error('Connection refused') });
  await assert.rejects(service.status(), { code: 'serviceUnavailable' });
  assert.equal(service.baseUrl, null);
});

test('request: ניתוק אחרי תשובה → connectionLost', async () => {
  const { service } = await connected({
    '/status': { status: 200, chunks: ['{"a":', new Error('Connection reset')] },
  });
  await assert.rejects(service.status(), { code: 'connectionLost' });
});

test('request: חסם זמן → timeout', async () => {
  const { service } = await connected({ '/status': new Error('Network stream timed out') });
  await assert.rejects(service.status(), { code: 'timeout' });
});

test('request: תשובה שאינה JSON → badResponse', async () => {
  const { service } = await connected({ '/status': reply(200, '<html>') });
  await assert.rejects(service.status(), { code: 'badResponse' });
});

test('open משתמש בחסם הזמן הארוך', async () => {
  const { bridge, service } = await connected({ '/book/open': reply(200, { ok: true }) });
  await service.open('1');
  assert.equal(bridge.requests[0].params.timeoutMs, 120000);
});

test('watchBuild: שורות שנחתכו באמצע, heartbeat מתעלמים', async () => {
  const { service } = await connected({
    '/catalog/build': reply(200, '', {
      chunks: [
        '{"type":"start"}\n{"type":"heart',
        'beat"}\n{"type":"progress","scanned":5}\n',
        '{"type":"done","books":3}\n',
      ],
    }),
  });
  const events = [];
  const terminal = await service.watchBuild((event) => events.push(event.type));
  assert.deepEqual(events, ['start', 'progress', 'done']);
  assert.equal(terminal.books, 3);
});

test('watchBuild: זרם שנחתך מתחבר מחדש במצב attach בלבד', async () => {
  let calls = 0;
  const { bridge, service } = await connected({
    '/catalog/build': () => {
      calls++;
      return calls === 1
        ? reply(200, '{"type":"progress","scanned":1}\n')
        : reply(200, '{"type":"done","books":8402}\n');
    },
  });
  const terminal = await service.watchBuild(() => {});
  assert.equal(terminal.type, 'done');
  assert.deepEqual(bridge.requests.map((r) => r.body.mode), ['start', 'attach']);
});

test('watchBuild: attachOnly לא מתחיל בנייה, ו-idle מסיים', async () => {
  const { bridge, service } = await connected({
    '/catalog/build': reply(200, '{"type":"idle"}\n'),
  });
  const terminal = await service.watchBuild(() => {}, undefined, { attachOnly: true });
  assert.equal(terminal.type, 'idle');
  assert.equal(bridge.requests[0].body.mode, 'attach');
});

test('watchBuild: זרמים ריקים ברצף לא מסתובבים לנצח', async () => {
  const sleeps = [];
  const bridge = new FakeBridge({ '/health': health, '/catalog/build': reply(200, '') });
  const service = new ServiceClient(bridge, undefined, {
    sleep: async (ms) => sleeps.push(ms),
  });
  await assert.rejects(service.watchBuild(() => {}), { code: 'connectionLost' });
  const builds = bridge.requests.filter((r) => r.path === '/catalog/build');
  assert.equal(builds.length, 10);
  assert.ok(sleeps.length > 0, 'צריכה להיות השהיה בין ניסיונות');
});

test('watchBuild: שגיאת HTTP נזרקת', async () => {
  const { service } = await connected({
    '/catalog/build': reply(409, { error: { code: 'busy', message: 'x' } }),
  });
  await assert.rejects(service.watchBuild(() => {}), { code: 'busy' });
});

test('watchBuild: signal עוצר את ההאזנה מיד, גם בלי מקטע נוסף', async () => {
  const controller = new AbortController();
  const { service } = await connected({
    '/catalog/build': { status: 200, chunks: ['{"type":"progress"}\n'], hang: true },
  });
  const watching = service.watchBuild(() => controller.abort(), controller.signal);
  assert.equal(await watching, null);
});

test('"הפעלת בר אילן" כבויה: autoStart: false בפתיחה, בחיפוש ובאיתור, ולא בשאר', async () => {
  const { bridge, service } = await connected({
    '/book/open': reply(200, { ok: true }),
    '/text/search': reply(200, { ok: true }),
    '/reference/open': reply(200, { ok: true, opened: true }),
    '/catalog/search': reply(200, { total: 0, results: [] }),
  });
  service.autoStart = false;
  await service.open('7');
  await service.advancedSearch({ q: 'נר', advanced: true });
  await service.locate('בראשית ב ג', 2);
  await service.search('נר');
  const bodies = Object.fromEntries(bridge.requests.filter((r) => r.body).map((r) => [r.path, r.body]));
  assert.deepEqual(bodies['/book/open'], { key: '7', autoStart: false });
  assert.equal(bodies['/text/search'].autoStart, false);
  assert.deepEqual(bodies['/reference/open'], { ref: 'בראשית ב ג', index: 2, autoStart: false });
  assert.equal('autoStart' in bodies['/catalog/search'], false);
});
