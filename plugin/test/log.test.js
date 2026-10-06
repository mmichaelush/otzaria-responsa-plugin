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
  const log = new Log({ console: null, max: 3, startup: 0 });
  for (let i = 1; i <= 5; i++) log.info('פעולה ' + i);
  assert.deepEqual(
    log.entries().map((entry) => entry.message),
    ['פעולה 3', 'פעולה 4', 'פעולה 5'],
  );
});

test('רשומות ההפעלה (info ומעלה הראשונות) נשמרות גם כשהיומן מתמלא', () => {
  const log = new Log({ console: null, max: 6, startup: 2 });
  log.debug('GET /health → serviceUnavailable');
  log.info('הפעלה: תוסף 0.5.1');
  log.info('נמצא השירות ב-http://127.0.0.1:39700, גרסה 0.5.1');
  for (let i = 1; i <= 10; i++) log.debug('GET /status ' + i);
  assert.deepEqual(
    log.entries().map((entry) => entry.message),
    ['הפעלה: תוסף 0.5.1', 'נמצא השירות ב-http://127.0.0.1:39700, גרסה 0.5.1', 'GET /status 7', 'GET /status 8', 'GET /status 9', 'GET /status 10'],
  );
  assert.equal(log.text({ startup: true }).split('\n').length, 2);
  assert.doesNotMatch(log.text({ startup: false }), /הפעלה/);
  assert.equal(log.text({ startup: false }).split('\n').length, 4);
});

// ---------------------------------------------------- קיפול חזרות

/** יומן עם שעון שמתקדם בשנייה בכל רשומה. */
function ticking() {
  let now = new Date(2026, 9, 6, 0, 18, 36).getTime();
  return new Log({ console: null, now: () => (now += 1000) - 1000 });
}

/** המחזור מהדיווח האמיתי: מסך "השירות לא מגיב" בודק כל 10 שניות. */
function pollCycle(log, ms) {
  log.debug('GET /health → 200 (' + ms + 'ms)');
  log.debug('GET /status → 500 (' + (ms * 10) + 'ms)');
  log.warn(
    'GET /status נכשלה',
    Object.assign(new Error("שגיאה פנימית בשירות: FileSystemException: Exists failed, path = 'E:\\'"), {
      name: 'ServiceError',
      code: 'internal',
    }),
  );
}

test('compact: מחזור של 3 שורות נשאר פעם אחת, ושורה אחת אומרת כמה פעמים חזר ועד מתי', () => {
  const log = ticking();
  log.info('הפעלה: תוסף 0.5.1');
  for (let i = 0; i < 26; i++) pollCycle(log, 20 + i);
  const lines = log.text({ compact: true }).split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[1], /^00:18:37 DEBUG GET \/health → 200 \(20ms\)$/);
  assert.match(lines[3], /WARN  GET \/status נכשלה — ServiceError \[internal\]/);
  // 1 + 26 * 3 = 79 רשומות; האחרונה ב-00:19:54.
  assert.equal(lines[4], '   ↻ 3 השורות שלמעלה חזרו עוד 25 פעמים, עד 00:19:54');
  assert.equal(log.text().split('\n').length, 79, 'בלי compact — הכול');
});

test('compact: שורה אחת שחוזרת', () => {
  const log = ticking();
  for (let i = 0; i < 4; i++) log.debug('GET /health → serviceUnavailable (' + i + 'ms)');
  log.info('מסך: serviceMissing');
  assert.deepEqual(log.text({ compact: true }).split('\n'), [
    '00:18:36 DEBUG GET /health → serviceUnavailable (0ms)',
    '   ↻ השורה שלמעלה חזרה עוד 3 פעמים, עד 00:18:39',
    '00:18:40 INFO  מסך: serviceMissing',
  ]);
});

test('compact: מחזור שנקטע בשורה אחרת, וחוזר אחריה', () => {
  const log = ticking();
  pollCycle(log, 20);
  pollCycle(log, 21);
  log.info('ההרשאות השתנו');
  pollCycle(log, 22);
  pollCycle(log, 23);
  pollCycle(log, 24);
  const lines = log.text({ compact: true }).split('\n');
  assert.equal(lines.length, 3 + 1 + 1 + 3 + 1);
  assert.equal(lines[3], '   ↻ 3 השורות שלמעלה חזרו עוד פעם אחת, עד 00:18:41');
  assert.match(lines[4], /INFO  ההרשאות השתנו$/);
  assert.match(lines[5], /GET \/health → 200 \(22ms\)$/);
  assert.equal(lines[8], '   ↻ 3 השורות שלמעלה חזרו עוד 2 פעמים, עד 00:18:51');
});

test('compact: שורות שונות, או שורה שחוזרת רק פעמיים, אינן מתקפלות', () => {
  const log = ticking();
  log.info('חיפוש: אבני נזר');
  log.info('חיפוש: אבני מילואים');
  log.warn('GET /status נכשלה', 'timeout');
  log.warn('GET /status נכשלה', 'internal');
  log.debug('GET /health → 200 (3ms)');
  log.debug('GET /health → 200 (4ms)');
  log.info('פתיחה');
  log.info('סגירה');
  log.info('פתיחה');
  assert.equal(log.text({ compact: true }), log.text());
});

test('compact: compactLines עצמאית, על רשומות שאינן מהיומן', () => {
  const entry = (time, message) => ({ time, level: 'info', message, detail: '' });
  const lines = LogModule.compactLines([
    entry(0, 'א'),
    entry(1000, 'ב'),
    entry(2000, 'א'),
    entry(3000, 'ב'),
    entry(4000, 'א'),
    entry(5000, 'ב'),
  ]);
  assert.equal(lines.length, 3);
  assert.match(lines[2], /2 השורות שלמעלה חזרו עוד 2 פעמים/);
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
