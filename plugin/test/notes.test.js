// העברת הערות מבר אילן לאוצריא: מה מיובא, לאן, ואיך ההערה נראית.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Notes } = loadPlugin();

const note = (overrides) => ({
  id: 41,
  text: 'כדאי לעיין גם ברמב"ם',
  source: 'ברכות דף ב עמוד א',
  quote: 'מאימתי',
  title: 'זמן קריאת שמע',
  date: '2019-03-12',
  ...overrides,
});

/** תוצאה של `library.resolveRef`, כפי שאוצריא מחזירה אותה. */
const hit = (overrides) => ({
  id: 42,
  bookId: 'ברכות',
  bookUid: 'id:42',
  type: 'text',
  title: 'ברכות',
  reference: 'ברכות דף ב',
  index: 1233,
  isPdf: false,
  isSourceLine: true,
  isUserBook: false,
  ...overrides,
});

test('מראה מקום: מנוקה, ועד אורך שאפשר לפענח', () => {
  assert.equal(Notes.placeOf(note({ source: '  ברכות   דף ב ' })), 'ברכות דף ב');
  // כך בר אילן כותבת מראה מקום (נמדד חי): בלי פסיקים, ובלי התווית "בבלי".
  assert.equal(Notes.placeOf(note({ source: 'בבלי ברכות ב, א' })), 'ברכות דף ב א');
  assert.equal(Notes.placeOf(note({ source: 'בבלי בבא קמא קי, ב' })), 'בבא קמא דף קי ב');
  assert.equal(
    Notes.placeOf(note({ source: 'שולחן ערוך אורח חיים א, א' })),
    'שולחן ערוך אורח חיים א א',
  );
  assert.equal(Notes.placeOf(note({ source: 'ירושלמי ברכות א, א' })), 'ירושלמי ברכות א א');
  assert.equal(Notes.placeOf(note({ source: '' })), null);
  assert.equal(Notes.placeOf(note({ source: 'א' })), null);
  assert.equal(Notes.placeOf(note({ source: undefined })), null);
  assert.equal(Notes.placeOf(note({ source: 'א'.repeat(Notes.MAX_PLACE_LENGTH + 1) })), null);
});

test('תוכן ההערה באוצריא: סימון מקור ראשון, ואחריו כותרת, מילה וגוף', () => {
  assert.equal(
    Notes.contentFor(note()),
    ['יובא מבר אילן · 12.3.2019', 'זמן קריאת שמע', '«מאימתי»', '', 'כדאי לעיין גם ברמב"ם'].join('\n'),
  );
});

test('כותרת ברירת מחדל (זהה למילים שסומנו) אינה נכתבת פעמיים', () => {
  const content = Notes.contentFor(note({ title: 'מאימתי ' }));
  assert.equal(content.split('\n').filter((line) => line.includes('מאימתי')).length, 1);
});

test('תאריך לתצוגה: יום.חודש.שנה, ותאריך אחר כמות שהוא', () => {
  assert.equal(Notes.displayDate('2026-11-09'), '9.11.2026');
  assert.equal(Notes.displayDate('בכסלו'), 'בכסלו');
  assert.equal(Notes.displayDate(undefined), '');
});

test('תוכן הערה מינימלית: רק סימון וגוף, בלי שורות ריקות מיותרות', () => {
  assert.equal(
    Notes.contentFor({ id: 1, text: 'קצר' }),
    ['יובא מבר אילן', '', 'קצר'].join('\n'),
  );
});

test('החתימה היא התוכן: יציבה, ואינה תלויה במספר השורה', () => {
  assert.equal(Notes.signature(note()), Notes.signature(note()));
  // מספר השורה משתנה אם בר אילן מדחסת את הקובץ, ו-`id` חוזר בין מחברים.
  assert.equal(Notes.signature(note()), Notes.signature(note({ id: 42 })));
  assert.notEqual(Notes.signature(note()), Notes.signature(note({ text: 'אחר' })));
  assert.notEqual(Notes.signature(note()), Notes.signature(note({ source: 'שבת ג' })));
  assert.notEqual(Notes.signature(note()), Notes.signature(note({ date: '2020-01-01' })));
});

test('התאמה: מקום מדויק, וכותרת בלבד מסומנת כדיוק נמוך', () => {
  const exact = Notes.resolution(note(), [hit()]);
  assert.equal(exact.status, 'matched');
  assert.equal(exact.precision, 'line');

  const section = Notes.resolution(note(), [hit({ isSourceLine: false })]);
  assert.equal(section.status, 'matched');
  assert.equal(section.precision, 'section');
});

test('התאמה נדחית בלי מקום, בלי תוצאה, ובלי ודאות', () => {
  assert.deepEqual(Notes.resolution(note({ source: '' }), []), {
    status: 'unmatched',
    reason: Notes.Reason.noPlace,
  });
  assert.deepEqual(Notes.resolution(note(), []), { status: 'unmatched', reason: Notes.Reason.notFound });
  assert.deepEqual(Notes.resolution(note(), null), { status: 'unmatched', reason: Notes.Reason.notFound });
  // אוצריא ניחשה ספר שאינו זה שנכתב.
  assert.equal(Notes.resolution(note(), [hit({ title: 'שבת' })]).reason, Notes.Reason.unsure);
  // ספר אישי או PDF: אין מזהה יחיד.
  assert.equal(Notes.resolution(note(), [hit({ id: null })]).reason, Notes.Reason.unsure);
  // בלי אינדקס שורה אי אפשר להצמיד.
  assert.equal(Notes.resolution(note(), [hit({ index: null })]).reason, Notes.Reason.unsure);
  assert.equal(Notes.resolution(note(), [hit({ index: -1 })]).reason, Notes.Reason.unsure);
});

test('רק התוצאה הראשונה קובעת', () => {
  const result = Notes.resolution(note(), [hit({ title: 'שבת', id: 7 }), hit()]);
  assert.equal(result.reason, Notes.Reason.unsure);
});

test('בקשת הוספה: שורה מבוססת־1, והספר לפי bookUid כשיש', () => {
  const item = { note: note(), resolution: Notes.resolution(note(), [hit()]) };
  assert.deepEqual(Notes.addRequest(item), {
    bookUid: 'id:42',
    lineNumber: 1234,
    content: Notes.contentFor(note()),
  });
  const bare = { note: note(), resolution: Notes.resolution(note(), [hit({ bookUid: undefined })]) };
  const request = Notes.addRequest(bare);
  assert.equal(request.bookId, 'ברכות');
  assert.ok(!('bookUid' in request));
});

test('סיכום הבדיקה: מה מוכן, באיזה דיוק, מה נשאר ולמה', () => {
  const matched = (precision) => ({
    note: note(),
    imported: false,
    resolution: { status: 'matched', precision },
  });
  const skipped = (reason) => ({ note: note(), imported: false, resolution: { status: 'unmatched', reason } });
  const counts = Notes.summarize([
    matched('line'),
    matched('line'),
    matched('section'),
    skipped(Notes.Reason.noPlace),
    skipped(Notes.Reason.noPlace),
    skipped(Notes.Reason.unsure),
    { note: note(), imported: true, resolution: null },
  ]);
  assert.equal(counts.total, 7);
  assert.equal(counts.matched, 3);
  assert.equal(counts.line, 2);
  assert.equal(counts.section, 1);
  assert.equal(counts.imported, 1);
  assert.equal(counts.skipped, 3);
  assert.deepEqual(counts.unmatched, { [Notes.Reason.noPlace]: 2, [Notes.Reason.unsure]: 1 });
});

test('יומן: שורות פגומות נזרקות, ושורה תקינה נשמרת', () => {
  const good = ['41:abcd1234', 'id:42', 1234, 'deadbeef'];
  assert.deepEqual(Notes.normalizeLedger([good, ['x'], null, [1, 2, 3, 4], 'text']), [good]);
  assert.deepEqual(Notes.normalizeLedger(null), []);
  assert.deepEqual(Notes.normalizeLedger({}), []);
});

test('שורת יומן ממפתחת את ההערה ואת התוכן שנכתב', () => {
  const request = { bookUid: 'id:42', lineNumber: 1234, content: 'תוכן' };
  const row = Notes.ledgerRow(note(), request);
  assert.deepEqual(row, [Notes.signature(note()), 'id:42', 1234, Notes.hash('תוכן')]);
  assert.ok(Notes.importedSignatures([row]).has(Notes.signature(note())));
});

test('ביטול מוחק רק הערה שלא נערכה, באותה שורה', () => {
  const content = Notes.contentFor(note());
  const row = ['sig', 'id:42', 1234, Notes.hash(content)];
  const untouched = { id: 'a', lineNumber: 1234, content };
  const edited = { id: 'b', lineNumber: 1234, content: content + ' (ערכתי)' };
  const moved = { id: 'c', lineNumber: 99, content };
  const unknownLine = { id: 'd', content };
  assert.deepEqual(Notes.undoTargets(row, [untouched, edited, moved, unknownLine]), [untouched, unknownLine]);
  assert.deepEqual(Notes.undoTargets(row, null), []);
});

test('מפתח הספר בביטול נשלח בשני השדות', () => {
  assert.deepEqual(Notes.bookKey(['sig', 'id:42', 1, 'h']), { bookUid: 'id:42', bookId: 'id:42' });
});

test('כל סיבה לדחייה יש לה הסבר למשתמש', () => {
  for (const reason of Object.values(Notes.Reason)) {
    assert.ok(Notes.reasonLabel(reason).length > 3, reason);
  }
  assert.equal(Notes.reasonLabel('לא-מוכר'), Notes.reasonLabel(Notes.Reason.failed));
});
