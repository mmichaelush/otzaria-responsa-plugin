// "ביוגרפיה" בפרטי ספר: בקשה אחת בכל פעם, שמירה בזיכרון, ותשובה שהגיעה באיחור.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { BiographyFlow: Module } = loadPlugin();
const { BiographyFlow, CACHE_LIMIT } = Module;

const SILENT = Object.freeze({ debug() {}, info() {}, warn() {}, error() {} });
const book = (key) => ({ key, title: 'ספר ' + key });
const FOUND = { found: true, heading: 'מגילת תענית', text: 'חיבור קצר.\nפסקה שנייה.', cached: false };

function setup(answer) {
  const calls = [];
  const service = {
    biography: async (key) => {
      calls.push(key);
      return typeof answer === 'function' ? answer(key) : answer;
    },
  };
  const renders = { count: 0 };
  const flow = new BiographyFlow({ service, log: SILENT, changed: () => renders.count++ });
  return { flow, calls, renders };
}

test('בקשה: טוען, ואז מציג את המאמר', async () => {
  const { flow, calls, renders } = setup(FOUND);
  const pending = flow.show(book('7'));
  assert.equal(flow.state.loading, true);
  assert.equal(flow.state.key, '7');
  await pending;
  assert.equal(flow.state.loading, false);
  assert.deepEqual(flow.state.result, FOUND);
  assert.deepEqual(calls, ['7']);
  assert.ok(renders.count >= 2);
});

test('פתיחה שנייה של אותו ספר מהזיכרון, בלי בקשה', async () => {
  const { flow, calls } = setup(FOUND);
  await flow.show(book('7'));
  flow.close();
  await flow.show(book('7'));
  assert.equal(calls.length, 1);
  assert.deepEqual(flow.state.result, FOUND);
});

test('"אין ביוגרפיה" נשמר גם הוא: לא פונים שוב לבר אילן', async () => {
  const { flow, calls } = setup({ found: false });
  await flow.show(book('7'));
  assert.equal(flow.state.result.found, false);
  flow.close();
  await flow.show(book('7'));
  assert.equal(calls.length, 1);
});

test('כשל: נשמר להצגה, אינו נשמר בזיכרון, וניסיון חוזר פונה שוב', async () => {
  let fail = true;
  const { flow, calls } = setup(() => {
    if (fail) throw Object.assign(new Error('בר אילן לא פתח את החלון'), { code: 'dialogNotFound' });
    return FOUND;
  });
  await flow.show(book('7'));
  assert.equal(flow.state.error.code, 'dialogNotFound');
  assert.equal(flow.state.result, null);
  assert.equal(flow.state.loading, false);
  fail = false;
  await flow.show(book('7'));
  assert.equal(flow.state.error, null);
  assert.deepEqual(flow.state.result, FOUND);
  assert.equal(calls.length, 2);
});

test('בקשה שנייה בזמן שהראשונה רצה אינה נשלחת', async () => {
  let release;
  const { flow, calls } = setup(() => new Promise((resolve) => (release = () => resolve(FOUND))));
  const first = flow.show(book('7'));
  await flow.show(book('8'));
  assert.equal(calls.length, 1);
  release();
  await first;
  assert.equal(flow.state.key, '7');
});

test('סגירה בזמן קריאה מתעלמת; סגירה אחריה מנקה', async () => {
  let release;
  const { flow } = setup(() => new Promise((resolve) => (release = () => resolve(FOUND))));
  const pending = flow.show(book('7'));
  flow.close();
  assert.equal(flow.state.key, '7');
  release();
  await pending;
  flow.close();
  assert.deepEqual(
    { key: flow.state.key, loading: flow.state.loading, result: flow.state.result, error: flow.state.error },
    { key: null, loading: false, result: null, error: null },
  );
});

test('isShown: רק הספר שהלוח פתוח עליו', async () => {
  const { flow } = setup(FOUND);
  await flow.show(book('7'));
  assert.equal(flow.isShown(book('7')), true);
  assert.equal(flow.isShown(book('8')), false);
});

test('הזיכרון מוגבל: הישן ביותר יוצא', async () => {
  const { flow, calls } = setup(FOUND);
  for (let i = 0; i < CACHE_LIMIT + 1; i++) {
    await flow.show(book('k' + i));
    flow.close();
  }
  await flow.show(book('k0'));
  // k0 נדחק החוצה ונקרא שוב; הספר האחרון עדיין בזיכרון.
  assert.equal(calls.filter((key) => key === 'k0').length, 2);
  await flow.show(book('k' + CACHE_LIMIT));
  assert.equal(calls.filter((key) => key === 'k' + CACHE_LIMIT).length, 1);
});

// ---- קריאת כל הביוגרפיות

const RUNNING = { state: 'running', total: 1248, stored: 10, failed: 0, current: 'מגילת תענית', message: null };
const DONE = { state: 'done', total: 1248, stored: 1248, failed: 0, current: null, message: null };

/** טיימר מדומה: אוסף את מה שנקבע, והבדיקה מפעילה אותו בעצמה. */
function harvestSetup(answers) {
  const actions = [];
  const timers = [];
  const service = {
    biographyHarvest: async (action) => {
      actions.push(action);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    biography: async () => FOUND,
  };
  const flow = new BiographyFlow({
    service,
    log: SILENT,
    changed: () => {},
    schedule: (fn, ms) => timers.push({ fn, ms, cancelled: false }) && timers[timers.length - 1],
    cancel: (timer) => (timer.cancelled = true),
  });
  return { flow, actions, timers };
}

test('קריאה ברקע: לא מתחילה לבד, ורק status נשאל כשנכנסים להגדרות', async () => {
  const { flow, actions } = harvestSetup([{ ...DONE, state: 'idle', stored: 0 }]);
  assert.equal(flow.state.harvest, null);
  await flow.loadHarvest();
  assert.deepEqual(actions, ['status']);
  assert.equal(flow.state.harvest.state, 'idle');
});

test('start: המצב מתעדכן, וכל עוד רצה נשאלת שוב בקצב קבוע; בסיום המעקב נפסק', async () => {
  const { flow, actions, timers } = harvestSetup([RUNNING, { ...RUNNING, stored: 40 }, DONE]);
  await flow.startHarvest();
  assert.equal(flow.state.harvest.state, 'running');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, Module.POLL_MS);
  await timers[0].fn();
  assert.equal(flow.state.harvest.stored, 40);
  assert.equal(timers.length, 2);
  await timers[1].fn();
  assert.equal(flow.state.harvest.state, 'done');
  assert.equal(timers.length, 2, 'אחרי "done" אין עוד שאילתות');
  assert.deepEqual(actions, ['start', 'status', 'status']);
});

test('stop עוצר את המעקב הישן ושואל מה המצב עכשיו', async () => {
  const { flow, actions, timers } = harvestSetup([RUNNING, { ...RUNNING, state: 'stopped' }]);
  await flow.startHarvest();
  await flow.stopHarvest();
  assert.equal(timers[0].cancelled, true);
  assert.equal(flow.state.harvest.state, 'stopped');
  assert.equal(timers.length, 1, 'אחרי "stopped" אין עוד שאילתות');
  assert.deepEqual(actions, ['start', 'stop']);
});

test('stopPolling (התוסף הוסתר): הטיימר מבוטל, והקריאה בשירות אינה נעצרת', async () => {
  const { flow, actions, timers } = harvestSetup([RUNNING]);
  await flow.startHarvest();
  flow.stopPolling();
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual(actions, ['start'], 'לא נשלח stop');
});

test('כשל בהפעלה: נשמר להצגה, המצב הקודם נשאר, ואין מעקב', async () => {
  const failure = Object.assign(new Error('בר אילן לא פועלת'), { code: 'notRunning' });
  const { flow, timers } = harvestSetup([failure]);
  await flow.startHarvest();
  assert.equal(flow.state.harvestError, failure);
  assert.equal(flow.state.harvest, null);
  assert.equal(timers.length, 0);
});

test('בקשה בזמן שבקשה אחרת בדרך נדחית: אין שתי הפעלות במקביל', async () => {
  let release;
  const { flow, actions } = harvestSetup([]);
  flow.service.biographyHarvest = (action) => {
    actions.push(action);
    return new Promise((resolve) => (release = () => resolve(RUNNING)));
  };
  const first = flow.startHarvest();
  assert.equal(flow.state.harvestBusy, true);
  await flow.startHarvest();
  release();
  await first;
  assert.deepEqual(actions, ['start']);
  assert.equal(flow.state.harvestBusy, false);
});

test('ביוגרפיה בודדת כשבר אילן עסוקה (קריאה ברקע): מנסים שוב ואז מציגים', async () => {
  const busy = Object.assign(new Error('עסוקה'), { code: 'busy' });
  const answers = [busy, busy, FOUND];
  const timers = [];
  const calls = [];
  const flow = new BiographyFlow({
    service: { biography: async (key) => (calls.push(key), answers.length ? (() => { const a = answers.shift(); if (a instanceof Error) throw a; return a; })() : FOUND) },
    log: SILENT,
    changed: () => {},
    schedule: (fn, ms) => (timers.push(ms), fn()),
  });
  await flow.show(book('7'));
  assert.deepEqual(flow.state.result, FOUND);
  assert.equal(flow.state.error, null);
  assert.deepEqual(timers, [Module.BUSY_WAIT_MS, Module.BUSY_WAIT_MS]);
  assert.equal(calls.length, 3);
});

test('עסוקה שאינה חולפת: אחרי כמה ניסיונות מוצגת השגיאה, בלי לולאה אינסופית', async () => {
  const busy = Object.assign(new Error('עסוקה'), { code: 'busy' });
  let attempts = 0;
  const flow = new BiographyFlow({
    service: { biography: async () => (attempts++, Promise.reject(busy)) },
    log: SILENT,
    changed: () => {},
    schedule: (fn) => fn(),
  });
  await flow.show(book('7'));
  assert.equal(flow.state.error, busy);
  assert.equal(attempts, Module.BUSY_RETRIES + 1);
});

test('שגיאה אחרת אינה מנוסה שוב', async () => {
  const other = Object.assign(new Error('x'), { code: 'notRunning' });
  let attempts = 0;
  const flow = new BiographyFlow({
    service: { biography: async () => (attempts++, Promise.reject(other)) },
    log: SILENT,
    changed: () => {},
    schedule: (fn) => fn(),
  });
  await flow.show(book('7'));
  assert.equal(attempts, 1);
});
