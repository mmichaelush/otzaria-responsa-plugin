'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');
const { FakeBridge, reply } = require('./helpers/fake-bridge');

const { Service } = loadPlugin();
const { ServiceClient, ServiceError } = Service;
const URL = 'http://127.0.0.1:39700';

const client = (routes) => {
  const bridge = new FakeBridge(routes);
  return { bridge, service: new ServiceClient(bridge, URL) };
};

test('request: JSON מחולק למקטעים מורכב מחדש', async () => {
  const { service } = client({
    '/health': reply(200, '', { chunks: ['{"ok":tr', 'ue,"service":"otzaria-responsa"}'] }),
  });
  assert.deepEqual(await service.health(), { ok: true, service: 'otzaria-responsa' });
});

test('request: שולח JSON עם Content-Type', async () => {
  const { bridge, service } = client({ '/catalog/search': reply(200, { total: 0, results: [] }) });
  await service.search('יבמות', 0, 50);
  const request = bridge.requests[0];
  assert.equal(request.params.method, 'POST');
  assert.equal(request.params.headers['Content-Type'], 'application/json');
  assert.deepEqual(request.body, { q: 'יבמות', offset: 0, limit: 50 });
});

test('request: שגיאת שירות הופכת ל-ServiceError עם הקוד וההודעה', async () => {
  const { service } = client({
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

test('request: אין שירות מאזין → serviceUnavailable', async () => {
  const { service } = client({});
  await assert.rejects(service.health(), { code: 'serviceUnavailable' });
});

test('request: ניתוק אחרי תשובה → connectionLost', async () => {
  const { service } = client({
    '/status': { status: 200, chunks: ['{"a":', new Error('Connection reset')] },
  });
  await assert.rejects(service.status(), { code: 'connectionLost' });
});

test('request: חסימת הרשאה וזמן', async () => {
  const denied = client({ '/health': new Error('error.permission_denied: network.localhost') });
  await assert.rejects(denied.service.health(), { code: 'permissionDenied' });
  const slow = client({ '/health': new Error('Network stream timed out') });
  await assert.rejects(slow.service.health(), { code: 'timeout' });
});

test('request: תשובה שאינה JSON → badResponse', async () => {
  const { service } = client({ '/status': reply(200, '<html>') });
  await assert.rejects(service.status(), { code: 'badResponse' });
});

test('open משתמש בחסם הזמן הארוך', async () => {
  const { bridge, service } = client({ '/book/open': reply(200, { ok: true }) });
  await service.open('1');
  assert.equal(bridge.requests[0].params.timeoutMs, 120000);
});

test('watchBuild: שורות שנחתכו באמצע, heartbeat מתעלמים', async () => {
  const { service } = client({
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
  const { bridge, service } = client({
    '/catalog/build': () => {
      calls++;
      return calls === 1
        ? reply(200, '{"type":"progress","scanned":1}\n')
        : reply(200, '{"type":"done","books":8402}\n');
    },
  });
  const terminal = await service.watchBuild(() => {});
  assert.equal(terminal.type, 'done');
  assert.deepEqual(
    bridge.requests.map((r) => r.body.mode),
    ['start', 'attach'],
  );
});

test('watchBuild: attachOnly לא מתחיל בנייה, ו-idle מסיים', async () => {
  const { bridge, service } = client({ '/catalog/build': reply(200, '{"type":"idle"}\n') });
  const terminal = await service.watchBuild(() => {}, undefined, { attachOnly: true });
  assert.equal(terminal.type, 'idle');
  assert.equal(bridge.requests[0].body.mode, 'attach');
});

test('watchBuild: שגיאת HTTP נזרקת', async () => {
  const { service } = client({
    '/catalog/build': reply(400, { error: { code: 'badRequest', message: 'x' } }),
  });
  await assert.rejects(service.watchBuild(() => {}), { code: 'badRequest' });
});

test('watchBuild: אין שירות → serviceUnavailable', async () => {
  const { service } = client({});
  await assert.rejects(service.watchBuild(() => {}), { code: 'serviceUnavailable' });
});

test('watchBuild: signal עוצר את ההאזנה', async () => {
  const controller = new AbortController();
  const { service } = client({
    '/catalog/build': () => {
      controller.abort();
      return reply(200, '{"type":"progress"}\n');
    },
  });
  assert.equal(await service.watchBuild(() => {}, controller.signal), null);
});
