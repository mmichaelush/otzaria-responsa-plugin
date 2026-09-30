'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Runtime } = loadPlugin();
const { createRuntime, SdkError } = Runtime;

const quiet = { warn() {}, error() {} };
const noSleep = { sleep: async () => {}, logger: quiet };

function bridge(respond) {
  const calls = [];
  return {
    calls,
    call: async (method, payload) => {
      calls.push(method);
      return respond(method, payload, calls.length);
    },
    on(event, handler) {
      this.handlers = this.handlers || {};
      this.handlers[event] = handler;
    },
  };
}

test('call מחזיר data, וכשל הופך ל-SdkError עם הקוד', async () => {
  const runtime = createRuntime(
    bridge((method) =>
      method === 'ok'
        ? { success: true, data: 5 }
        : { success: false, error: { code: 'error.unknown_method', message: 'nope' } },
    ),
    noSleep,
  );
  assert.equal(await runtime.call('ok'), 5);
  await assert.rejects(runtime.call('missing'), (error) => {
    assert.ok(error instanceof SdkError);
    assert.equal(error.code, 'error.unknown_method');
    assert.equal(error.isUnsupported, true);
    return true;
  });
});

test('rate_limited חוזר על הקריאה, כי אוצריא דחתה אותה לפני שרצה', async () => {
  const host = bridge((method, payload, count) =>
    count < 3 ? { success: false, error: { code: 'error.rate_limited' } } : { success: true, data: 'x' },
  );
  const runtime = createRuntime(host, noSleep);
  assert.equal(await runtime.call('storage.get', { key: 'k' }), 'x');
  assert.equal(host.calls.length, 3);
});

test('שגיאה אחרת אינה חוזרת: ייתכן שהפעולה כבר בוצעה', async () => {
  const host = bridge(() => ({ success: false, error: { code: 'error.timeout' } }));
  const runtime = createRuntime(host, noSleep);
  await assert.rejects(runtime.call('feedback.report'));
  assert.equal(host.calls.length, 1);
});

test('callSoft מחזיר ערך חלופי ולא זורק', async () => {
  const runtime = createRuntime(
    bridge(() => ({ success: false, error: { code: 'permission_denied' } })),
    noSleep,
  );
  assert.equal(await runtime.callSoft('plugin.openSelf', {}), null);
  assert.equal(await runtime.callSoft('plugin.openSelf', {}, false), false);
});

test('פרץ של יותר מ-45 קריאות ממתין במקום להידחות', async () => {
  let clock = 0;
  const waits = [];
  const runtime = createRuntime(
    bridge(() => ({ success: true, data: true })),
    {
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
      logger: quiet,
    },
  );
  await Promise.all(Array.from({ length: 60 }, (_, i) => runtime.call('storage.get', { key: i })));
  assert.ok(waits.length > 0, 'אחרי 45 קריאות היה אמור לחכות');
});

test('on: חריגה במטפל נרשמת ואינה בורחת כדחייה', async () => {
  const errors = [];
  const host = bridge(() => ({ success: true }));
  const runtime = createRuntime(host, { logger: { warn() {}, error: (...args) => errors.push(args) } });
  runtime.on('plugin.boot', () => {
    throw new Error('boom');
  });
  await host.handlers['plugin.boot']({});
  assert.equal(errors.length, 1);
});
