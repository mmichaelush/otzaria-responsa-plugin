// לשונית "הערות": קריאה מהשירות, בדיקת ההתאמה, ייבוא וביטול, מול גשר מדומה.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');
const { FakeBridge } = require('./helpers/fake-bridge');

const { Notes, NotesFlow: FlowModule, Runtime } = loadPlugin();
const { NotesFlow, Phase, LEDGER_KEY, MAX_CONSECUTIVE_FAILURES } = FlowModule;

const SILENT = Object.freeze({ debug() {}, info() {}, warn() {}, error() {} });

const note = (id, overrides) => ({
  id,
  text: 'הערה ' + id,
  source: 'ברכות דף ' + id,
  ...overrides,
});

const hit = (overrides) => ({
  id: 42,
  bookId: 'ברכות',
  bookUid: 'id:42',
  type: 'text',
  title: 'ברכות',
  index: 10,
  isSourceLine: true,
  ...overrides,
});

/** שירות מדומה שמחזיר את [all] בעמודים, ומסנן לפי `query` בתוכן ההערה. */
function fakeService(all) {
  const calls = [];
  return {
    calls,
    async notes(query, offset, limit) {
      calls.push({ query, offset, limit });
      const matching = all.filter((entry) => !query || entry.text.includes(query));
      return {
        available: true,
        all: all.length,
        total: matching.length,
        empty: 0,
        notes: matching.slice(offset, offset + limit),
      };
    },
  };
}

/** זרימה על גשר מדומה. `store` הוא אחסון התוסף; `written` — מה נכתב לאוצריא. */
function setup(allNotes, options) {
  const opts = options || {};
  const store = { ...(opts.store || {}) };
  const written = [];
  const deleted = [];
  const bridge = new FakeBridge();
  bridge.methods = {
    'storage.get': ({ key }) => (Object.hasOwn(store, key) ? store[key] : null),
    'storage.set': ({ key, value }) => {
      store[key] = value;
      return true;
    },
    'library.resolveRef': opts.resolveRef || (() => [hit()]),
    'notes.add': opts.add || ((request) => (written.push(request), true)),
    'notes.list': opts.list || (() => []),
    'notes.delete': (request) => (deleted.push(request), true),
    ...(opts.methods || {}),
  };
  // שעון שמתקדם בכל קריאה: דלי הקצב של הלקוח מתמלא מיד, והבדיקה לא ממתינה לו.
  let clock = 0;
  const runtime = Runtime.createRuntime(bridge, {
    logger: SILENT,
    sleep: () => Promise.resolve(),
    now: () => (clock += 10),
  });
  const service = opts.service || fakeService(allNotes);
  const renders = { count: 0 };
  const flow = new NotesFlow({
    runtime,
    service,
    log: SILENT,
    changed: () => renders.count++,
    debounceMs: 1,
    now: () => renders.count * 1000,
    locate: (place) => (flow.located = place),
  });
  return { flow, store, written, deleted, bridge, service, renders };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('כניסה ללשונית קוראת עמוד אחד, ופעם אחת בלבד', async () => {
  const { flow, service } = setup([note(1), note(2)]);
  await flow.open();
  await flow.open();
  assert.equal(service.calls.length, 1);
  assert.equal(flow.state.list.available, true);
  assert.equal(flow.state.list.items.length, 2);
  assert.equal(flow.state.list.all, 2);
});

test('אין קובץ הערות: available=false, בלי שגיאה', async () => {
  const service = { async notes() { return { available: false, all: 0, total: 0, notes: [] }; } };
  const { flow } = setup([], { service });
  await flow.open();
  assert.equal(flow.state.list.available, false);
  assert.equal(flow.state.list.error, null);
});

test('כשל בשירות נשמר להצגה, והלשונית נשארת שמישה', async () => {
  const service = { async notes() { throw new Error('boom'); } };
  const { flow } = setup([], { service });
  await flow.open();
  assert.equal(flow.state.list.error.message, 'boom');
  assert.equal(flow.state.list.loading, false);
});

test('"עוד": מוסיף את העמוד הבא, ונעצר כשהכול הוצג', async () => {
  const all = Array.from({ length: Notes.PAGE_SIZE + 5 }, (_, i) => note(i + 1));
  const { flow, service } = setup(all);
  await flow.open();
  assert.equal(flow.state.list.items.length, Notes.PAGE_SIZE);
  await flow.more();
  assert.equal(flow.state.list.items.length, all.length);
  assert.equal(service.calls.at(-1).offset, Notes.PAGE_SIZE);
  await flow.more();
  assert.equal(service.calls.length, 2);
});

test('חיפוש: בקשה אחת אחרי הקלדה, ותשובה מאוחרת לחיפוש ישן נזרקת', async () => {
  const slow = { resolve: null };
  let first = true;
  const service = {
    calls: [],
    async notes(query) {
      service.calls.push(query);
      if (first) {
        first = false;
        await new Promise((resolve) => (slow.resolve = resolve));
        return { available: true, all: 2, total: 1, notes: [note(1)] };
      }
      return { available: true, all: 2, total: 1, notes: [note(2)] };
    },
  };
  const { flow } = setup([], { service });
  const opening = flow.open();
  await sleep(5);
  flow.search('ב');
  flow.search('בר');
  await sleep(30);
  slow.resolve();
  await opening;
  assert.deepEqual(service.calls, ['', 'בר']);
  assert.deepEqual(
    flow.state.list.items.map((entry) => entry.id),
    [2],
  );
});

test('איתור בבר אילן: שולח את מראה המקום, ובלעדיו לא עושה כלום', () => {
  const { flow } = setup([]);
  flow.locate(note(1, { source: 'שבת דף ג' }));
  assert.equal(flow.located, 'שבת דף ג');
  flow.located = undefined;
  flow.locate(note(2, { source: '' }));
  assert.equal(flow.located, undefined);
});

test('בדיקה: כל ההערות נקראות, וכל אחת נשאלת על מקומה', async () => {
  const all = Array.from({ length: Notes.FETCH_SIZE + 30 }, (_, i) => note(i + 1));
  const { flow, service, bridge } = setup(all);
  await flow.check();
  const { importer } = flow.state;
  assert.equal(importer.phase, Phase.review);
  assert.equal(importer.items.length, all.length);
  assert.equal(importer.counts.matched, all.length);
  // שני עמודים בגודל הקריאה המלא.
  assert.deepEqual(
    service.calls.map((call) => call.offset),
    [0, Notes.FETCH_SIZE],
  );
  assert.equal(bridge.calls.filter((call) => call.method === 'library.resolveRef').length, all.length);
});

test('בדיקה: הערה בלי מקום לא נשאלת, וסיבת הדחייה נרשמת', async () => {
  const { flow, bridge } = setup([note(1), note(2, { source: '' })], {
    resolveRef: ({ ref }) => (ref === 'ברכות דף 1' ? [hit()] : []),
  });
  await flow.check();
  const { counts } = flow.state.importer;
  assert.equal(counts.matched, 1);
  assert.equal(counts.unmatched[Notes.Reason.noPlace], 1);
  assert.equal(bridge.calls.filter((call) => call.method === 'library.resolveRef').length, 1);
});

test('בדיקה: הערה שכבר יובאה אינה נבדקת שוב', async () => {
  const done = note(1);
  const row = Notes.ledgerRow(done, { bookUid: 'id:42', lineNumber: 11, content: 'x' });
  const { flow, bridge } = setup([done, note(2)], { store: { [LEDGER_KEY]: [row] } });
  await flow.check();
  const { importer } = flow.state;
  assert.equal(importer.counts.imported, 1);
  assert.equal(importer.counts.matched, 1);
  assert.equal(importer.importedBefore, 1);
  assert.equal(bridge.calls.filter((call) => call.method === 'library.resolveRef').length, 1);
});

test('בדיקה: כשל בודד מול אוצריא אינו עוצר, כשל רצוף כן', async () => {
  let calls = 0;
  const one = setup([note(1), note(2)], {
    resolveRef: () => {
      calls += 1;
      if (calls === 1) return { error: { code: 'error.internal', message: 'x' } };
      return [hit()];
    },
  });
  await one.flow.check();
  assert.equal(one.flow.state.importer.phase, Phase.review);
  assert.equal(one.flow.state.importer.counts.unmatched[Notes.Reason.failed], 1);
  assert.equal(one.flow.state.importer.counts.matched, 1);

  const all = Array.from({ length: MAX_CONSECUTIVE_FAILURES + 5 }, (_, i) => note(i + 1));
  const many = setup(all, { resolveRef: () => ({ error: { code: 'error.internal', message: 'down' } }) });
  await many.flow.check();
  assert.equal(many.flow.state.importer.phase, Phase.idle);
  assert.ok(many.flow.state.importer.error);
});

test('בדיקה: הרשאה חסרה עוצרת מיד, עם הסבר שאפשר לפעול לפיו', async () => {
  const { flow } = setup([note(1), note(2)], {
    resolveRef: () => ({ error: { code: 'permission_denied', message: 'no' } }),
  });
  await flow.check();
  assert.equal(flow.state.importer.phase, Phase.idle);
  assert.match(flow.state.importer.error, /הרשאה/);
});

test('בדיקה: עצירה באמצע מחזירה למצב ההתחלה בלי לכתוב דבר', async () => {
  const { flow, written } = setup(
    Array.from({ length: 20 }, (_, i) => note(i + 1)),
    {
      resolveRef: () => {
        flow.cancel();
        return [hit()];
      },
    },
  );
  await flow.check();
  assert.equal(flow.state.importer.phase, Phase.idle);
  assert.equal(flow.state.importer.cancelling, false);
  assert.equal(written.length, 0);
});

test('ייבוא: כותב כל הערה שנמצא לה מקום, ורושם אותה ביומן', async () => {
  const { flow, written, store } = setup([note(1), note(2)], {
    resolveRef: ({ ref }) => (ref.endsWith('1') ? [hit({ index: 10 })] : []),
  });
  await flow.check();
  await flow.runImport();

  assert.equal(written.length, 1);
  assert.equal(written[0].lineNumber, 11);
  assert.equal(written[0].bookUid, 'id:42');
  assert.ok(written[0].content.startsWith(Notes.MARKER));

  const { importer } = flow.state;
  assert.equal(importer.phase, Phase.done);
  assert.deepEqual(importer.result, { added: 1, failed: 0 });
  assert.equal(store[LEDGER_KEY].length, 1);
  assert.equal(store[LEDGER_KEY][0][0], Notes.signature(note(1)));
  assert.equal(importer.importedBefore, 1);
});

test('ייבוא חוזר לא מכפיל: מה שיובא כבר אינו נכתב שוב', async () => {
  const { flow, written } = setup([note(1), note(2)]);
  await flow.check();
  await flow.runImport();
  assert.equal(written.length, 2);
  await flow.check();
  assert.equal(flow.state.importer.counts.matched, 0);
  assert.equal(flow.state.importer.counts.imported, 2);
  await flow.runImport();
  assert.equal(written.length, 2);
});

test('ייבוא: כשל בהערה אחת נספר, והשאר נכתבות', async () => {
  let count = 0;
  const { flow, written } = setup([note(1), note(2), note(3)], {
    add: (request) => {
      count += 1;
      if (count === 2) return { error: { code: 'error.internal', message: 'x' } };
      written.push(request);
      return true;
    },
  });
  const written_ = written;
  await flow.check();
  await flow.runImport();
  assert.deepEqual(flow.state.importer.result, { added: 2, failed: 1 });
  assert.equal(written_.length, 2);
});

test('ייבוא שנעצר באמצע שומר ביומן את מה שכבר נכתב', async () => {
  const written = [];
  const { flow, store } = setup(
    Array.from({ length: 5 }, (_, i) => note(i + 1)),
    {
      add: (request) => {
        written.push(request);
        if (written.length === 3) flow.cancel();
        return true;
      },
    },
  );
  await flow.check();
  await flow.runImport();
  assert.equal(written.length, 3);
  assert.equal(store[LEDGER_KEY].length, 3);
  assert.equal(flow.state.importer.result.added, 3);
});

test('ייבוא: הרשאת כתיבה חסרה עוצרת עם הסבר, ומה שנכתב נרשם', async () => {
  let count = 0;
  const { flow, store } = setup([note(1), note(2), note(3)], {
    add: () => (++count === 2 ? { error: { code: 'permission_denied', message: 'no' } } : true),
  });
  await flow.check();
  await flow.runImport();
  assert.match(flow.state.importer.error, /הרשאה/);
  assert.equal(store[LEDGER_KEY].length, 1);
});

test('ביטול ייבוא: מוחק רק הערות שלא נערכו, ומנקה את היומן', async () => {
  const first = note(1);
  const second = note(2);
  const writtenContent = {};
  const { flow, deleted, store } = setup([first, second], {
    add: (request) => {
      writtenContent[request.lineNumber] = request.content;
      return true;
    },
    resolveRef: ({ ref }) => [hit({ index: ref.endsWith('1') ? 10 : 20 })],
  });
  await flow.check();
  await flow.runImport();
  assert.equal(store[LEDGER_KEY].length, 2);

  // המשתמש ערך את ההערה השנייה באוצריא.
  flow.runtime.bridge.methods['notes.list'] = () => [
    { id: 'n1', lineNumber: 11, content: writtenContent[11] },
    { id: 'n2', lineNumber: 21, content: writtenContent[21] + ' (ערכתי)' },
  ];
  const result = await flow.undo();
  assert.deepEqual(result, { removed: 1, kept: 1, failed: 0 });
  assert.deepEqual(deleted.map((request) => request.noteId), ['n1']);
  assert.deepEqual(store[LEDGER_KEY], []);
  assert.equal(flow.state.importer.phase, Phase.idle);
  assert.deepEqual(flow.state.importer.result, { removed: 1, kept: 1, failed: 0 });
});

test('ביטול: ספר שאינו קיים עוד אינו עוצר את היתר, והשורה יוצאת מהיומן', async () => {
  const { flow, deleted, store } = setup([note(1)], { list: () => ({ error: { code: 'error.not_found', message: 'gone' } }) });
  await flow.check();
  await flow.runImport();
  const result = await flow.undo();
  assert.deepEqual(result, { removed: 0, kept: 1, failed: 0 });
  assert.equal(deleted.length, 0);
  assert.deepEqual(store[LEDGER_KEY], []);
});

test('ביטול: כשל בקריאת ספר (לא "אין ספר") משאיר את השורה ביומן, ואפשר לנסות שוב', async () => {
  const { flow, deleted, store, bridge } = setup([note(1)]);
  await flow.check();
  await flow.runImport();
  bridge.methods['notes.list'] = () => ({ error: { code: 'error.internal', message: 'busy' } });
  const result = await flow.undo();
  assert.deepEqual(result, { removed: 0, kept: 0, failed: 1 });
  assert.equal(store[LEDGER_KEY].length, 1, 'השורה נשארה');
  assert.equal(flow.state.importer.importedBefore, 1);
  // עכשיו הספר נקרא, ומה שנכשל מתבטל.
  const written = bridge.calls.filter((c) => c.method === 'notes.add')[0].payload;
  bridge.methods['notes.list'] = () => [{ id: 'n1', lineNumber: written.lineNumber, content: written.content }];
  assert.deepEqual(await flow.undo(), { removed: 1, kept: 0, failed: 0 });
  assert.deepEqual(deleted.map((request) => request.noteId), ['n1']);
  assert.deepEqual(store[LEDGER_KEY], []);
});

test('ביטול: מחיקה שנכשלה באמצע משאירה ביומן את מה שלא נמחק, ואת מה שנמחק מוציאה', async () => {
  const { flow, store, bridge } = setup([note(1), note(2)], {
    resolveRef: ({ ref }) => [hit({ index: ref.endsWith('1') ? 10 : 20 })],
  });
  await flow.check();
  await flow.runImport();
  const contents = bridge.calls.filter((c) => c.method === 'notes.add').map((c) => c.payload);
  bridge.methods['notes.list'] = () => contents.map((c, i) => ({ id: 'n' + i, lineNumber: c.lineNumber, content: c.content }));
  let deletes = 0;
  bridge.methods['notes.delete'] = () => (++deletes === 2 ? { error: { code: 'error.internal', message: 'x' } } : true);
  const result = await flow.undo();
  assert.deepEqual(result, { removed: 1, kept: 0, failed: 1 });
  assert.equal(store[LEDGER_KEY].length, 1);
});

test('ביטול: קריאת היומן שנכשלה אינה מוחקת אותו', async () => {
  const { flow, store, bridge } = setup([note(1)]);
  await flow.check();
  await flow.runImport();
  const before = store[LEDGER_KEY];
  bridge.methods['storage.get'] = () => ({ error: { code: 'error.internal', message: 'x' } });
  await flow.undo();
  assert.deepEqual(store[LEDGER_KEY], before);
  assert.equal(flow.state.importer.phase, Phase.idle);
  assert.ok(flow.state.importer.error);
});

test('ייבוא: קריאת היומן שנכשלה אינה כותבת דבר', async () => {
  const { flow, written, bridge, store } = setup([note(1)], { store: { [LEDGER_KEY]: [] } });
  await flow.check();
  bridge.methods['storage.get'] = () => ({ error: { code: 'error.internal', message: 'x' } });
  await flow.runImport();
  assert.equal(written.length, 0);
  assert.deepEqual(store[LEDGER_KEY], []);
  assert.equal(flow.state.importer.phase, Phase.idle);
});

test('ייבוא: הערה שכבר באוצריא (ריצה שנקטעה) נרשמת ולא נכתבת שוב', async () => {
  const first = setup([note(1)]);
  await first.flow.check();
  await first.flow.runImport();
  const sent = first.written[0];
  // ריצה חדשה, בלי יומן, כשההערה כבר באוצריא.
  const { flow, written, store } = setup([note(1)], {
    list: () => [{ id: 'n1', lineNumber: sent.lineNumber, content: sent.content }],
  });
  await flow.check();
  await flow.runImport();
  assert.equal(written.length, 0);
  assert.equal(store[LEDGER_KEY].length, 1);
  assert.equal(flow.state.importer.result.added, 1);
});

test('ייבוא: שתי הערות זהות נכתבות פעם אחת, עם שורת יומן אחת', async () => {
  const twin = note(1);
  const { flow, written, store } = setup([twin, { ...twin, id: 2 }], {
    // אוצריא מחזירה מה שנכתב בה.
    methods: {
      'notes.list': () => written.map((request, i) => ({ id: 'n' + i, lineNumber: request.lineNumber, content: request.content })),
    },
  });
  await flow.check();
  await flow.runImport();
  assert.equal(written.length, 1);
  assert.equal(store[LEDGER_KEY].length, 1);
});

test('ייבוא: PDF וספר אישי אינם מקבלים הערות', async () => {
  const { flow, written } = setup([note(1), note(2), note(3)], {
    resolveRef: ({ ref }) => [
      ref.endsWith('1') ? hit({ isPdf: true }) : ref.endsWith('2') ? hit({ type: 'pdf' }) : hit({ isUserBook: true }),
    ],
  });
  await flow.check();
  assert.equal(flow.state.importer.counts.matched, 0);
  await flow.runImport();
  assert.equal(written.length, 0);
});

test('ייבוא שנכשל באמצע מציג את מה שכבר נכתב', async () => {
  let count = 0;
  const { flow } = setup([note(1), note(2), note(3)], {
    add: () => (++count === 2 ? { error: { code: 'permission_denied', message: 'no' } } : true),
  });
  await flow.check();
  await flow.runImport();
  assert.equal(flow.state.importer.phase, Phase.done);
  assert.equal(flow.state.importer.result.added, 1);
  assert.ok(flow.state.importer.error);
});

test('הודעה טכנית של אוצריא אינה מוצגת למשתמש', async () => {
  const { flow, bridge } = setup([note(1)]);
  bridge.methods['storage.get'] = () => ({ error: { code: 'error.internal', message: 'storage.get [error.internal]: raw' } });
  await flow.check();
  assert.equal(flow.state.importer.error, 'בדיקת ההערות נכשלה');
});

test('אי אפשר לבדוק או לבטל בזמן ביטול שרץ', async () => {
  const { flow, bridge } = setup([note(1)]);
  await flow.check();
  await flow.runImport();
  let release;
  bridge.methods['notes.list'] = () => new Promise((resolve) => (release = () => resolve([])));
  const undoing = flow.undo();
  await sleep(5);
  assert.equal(flow.state.importer.phase, Phase.undoing);
  await flow.check();
  assert.equal(flow.state.importer.phase, Phase.undoing);
  assert.equal(await flow.undo(), null);
  release();
  await undoing;
});

test('סגירת התוצאה מחזירה למצב ההתחלה, ושומרת כמה יובאו', async () => {
  const { flow } = setup([note(1)]);
  await flow.check();
  await flow.runImport();
  flow.dismiss();
  assert.equal(flow.state.importer.phase, Phase.idle);
  assert.equal(flow.state.importer.importedBefore, 1);
  assert.equal(flow.state.importer.items.length, 0);
});

test('אי אפשר להתחיל בדיקה כשבדיקה כבר רצה', async () => {
  const { flow, service } = setup([note(1)]);
  const first = flow.check();
  const second = flow.check();
  await Promise.all([first, second]);
  // `_fetchAll` רץ פעם אחת בלבד.
  assert.equal(service.calls.length, 1);
});
