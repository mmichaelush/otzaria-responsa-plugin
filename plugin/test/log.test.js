'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Log: LogModule } = loadPlugin();
const { Log, scrub, describe } = LogModule;

/** console מדומה שרושם מה נכתב אליו. */
function fakeConsole() {
  const lines = [];
  const write = (level) => (...args) => lines.push([level, ...args]);
  return { lines, info: write('info'), warn: write('warn'), error: write('error'), log: write('log') };
}

test('רשומה נשמרת עם רמה, זמן ופירוט השגיאה', () => {
  const log = new Log({ console: null, now: () => 1000 });
  const error = Object.assign(new Error('Connection refused'), { name: 'ServiceError', code: 'serviceUnavailable' });
  log.warn('[responsa] GET /status נכשלה', error);
  assert.deepEqual(log.entries(), [
    {
      time: 1000,
      level: 'warn',
      message: 'GET /status נכשלה',
      detail: 'ServiceError [serviceUnavailable]: Connection refused',
    },
  ]);
});

test('היומן שומר רק את הרשומות האחרונות', () => {
  const log = new Log({ console: null, max: 3 });
  for (let i = 1; i <= 5; i++) log.info('פעולה ' + i);
  assert.deepEqual(
    log.entries().map((entry) => entry.message),
    ['פעולה 3', 'פעולה 4', 'פעולה 5'],
  );
});

test('console מקבל info ומעלה; debug נשאר בזיכרון בלבד', () => {
  const target = fakeConsole();
  const log = new Log({ console: target });
  log.debug('GET /health → 200');
  log.info('מסך: ready');
  log.error('נכשל', new Error('x'));
  assert.deepEqual(
    target.lines.map(([level, message]) => [level, message]),
    [
      ['info', '[responsa] מסך: ready'],
      ['error', '[responsa] נכשל'],
    ],
  );
  assert.equal(log.entries().length, 3);
  assert.equal(log.entries('info').length, 2);
});

test('text: שורה לכל רשומה, עם סינון וקיצור', () => {
  const log = new Log({ console: null, now: () => new Date(2026, 8, 29, 9, 5, 7).getTime() });
  log.debug('בקשה');
  log.info('פתיחה', { id: 7008 });
  log.warn('כשל');
  assert.equal(log.text({ minLevel: 'info', limit: 1 }), '09:05:07 WARN  כשל');
  assert.equal(log.text().split('\n').length, 3);
  assert.match(log.text(), /INFO  פתיחה — \{"id":7008\}/);
});

test('scrub: שם המשתמש שבנתיב אינו יוצא מהמחשב', () => {
  assert.equal(
    scrub('C:\\Users\\Moshe Cohen\\AppData\\Roaming\\otzaria'),
    'C:\\Users\\…\\AppData\\Roaming\\otzaria',
  );
  assert.equal(scrub('file:///C:/Users/moshe/x.js:1'), 'file:///C:/Users/…/x.js:1');
  assert.equal(scrub('D:\\Responsa\\RESPONSA.exe'), 'D:\\Responsa\\RESPONSA.exe');
  const log = new Log({ console: null });
  log.warn('נכשל: C:\\Users\\Moshe\\x');
  assert.doesNotMatch(log.text({ forReport: true }), /Moshe/);
  assert.match(log.text(), /Moshe/, 'בתצוגה המקומית הנתיב המלא נשאר');
});

test('describe: שגיאה, טקסט ואובייקט', () => {
  assert.equal(describe(null), '');
  assert.equal(describe('טקסט'), 'טקסט');
  assert.equal(describe({ outcome: 'found' }), '{"outcome":"found"}');
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(describe(cyclic), '[object Object]');
});

test('מאזין מקבל כל רשומה חדשה, וביטול מפסיק', () => {
  const log = new Log({ console: null });
  const seen = [];
  const stop = log.subscribe((entry) => seen.push(entry.message));
  log.info('א');
  stop();
  log.info('ב');
  assert.deepEqual(seen, ['א']);
});

test('טקסט ארוך נחתך, כדי שרשומה אחת לא תמלא את הדיווח', () => {
  const log = new Log({ console: null });
  log.info('א'.repeat(1000));
  assert.ok(log.entries()[0].message.length <= 400);
  assert.ok(log.entries()[0].message.endsWith('…'));
});
