// איתור מקום: מה שהשדה שולח לבר אילן, ומה שנשמר ב"אחרונים".
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Locate } = loadPlugin();

test('ניקוד וטעמים נמחקים, מקף הופך לרווח, וגרשיים מנורמלים', () => {
  assert.equal(Locate.normalize('  בְּרֵאשִׁית  ב ג '), 'בראשית ב ג');
  assert.equal(Locate.normalize('שֻׁלְחָן־עָרוּךְ'), 'שלחן ערוך');
  assert.equal(Locate.normalize('רמב״ם הלכות שבת פרק א׳'), 'רמב"ם הלכות שבת פרק א\'');
  assert.equal(Locate.normalize('א'.repeat(300)).length, Locate.MAX_LENGTH);
});

test('בדיקה: צריך עברית, וגם מקום אחרי שם הספר', () => {
  assert.match(Locate.validate('Genesis 2:3'), /בראשית ב ג/);
  assert.match(Locate.validate('בראשית'), /חסר המקום/);
  assert.equal(Locate.validate('בראשית ב ג'), null);
});

test('"אחרונים": החדש בראש, בלי כפילויות, עד שמונה', () => {
  let history = [];
  for (let i = 0; i < 10; i++) history = Locate.remember(history, 'ברכות דף ' + i);
  history = Locate.remember(history, 'ברכות דף 5');
  assert.equal(history.length, Locate.MAX_HISTORY);
  assert.equal(history[0], 'ברכות דף 5');
  assert.equal(history.filter((entry) => entry === 'ברכות דף 5').length, 1);
  assert.equal(Locate.remember(history, '   '), history);
});

test('"פתיחה במקום מסוים": שם הספר בלי ההסתייגות שבסוגריים, ורווח להמשך', () => {
  assert.equal(Locate.startFrom('שמות רבה (וילנא)'), 'שמות רבה ');
  assert.equal(Locate.startFrom('בראשית'), 'בראשית ');
  assert.equal(Locate.startFrom(''), '');
});

test('הדוגמאות עוברות את הבדיקה', () => {
  for (const example of Locate.EXAMPLES) assert.equal(Locate.validate(example), null, example);
});

test('normalize: סימני כיווניות, גרשיים כפולים וגרש הפוך — כמו בשירות', () => {
  assert.equal(Locate.normalize('\u200Fשו\'\'ע או``ח סי\u00B4 א\u200E'), 'שו"ע או"ח סי\' א');
});

// ------------------------------------------------ מספר שפתוח באוצריא

test('fromSelection: טקסט מסומן שהוא מקום — בלי הסוגריים; קטע מהספר או שם בלבד — null', () => {
  assert.equal(Locate.fromSelection('(ב"מ לא, א)'), 'ב"מ לא, א');
  assert.equal(Locate.fromSelection(' [שו"ע או"ח סי\' רצט]; '), 'שו"ע או"ח סי\' רצט');
  assert.equal(Locate.fromSelection('ברכות ב.'), 'ברכות ב.');
  assert.equal(Locate.fromSelection('(שם)'), null);
  assert.equal(Locate.fromSelection(''), null);
  assert.equal(Locate.fromSelection(undefined), null);
  assert.equal(Locate.fromSelection('ויכל אלהים ביום השביעי מלאכתו אשר עשה וישבת ביום השביעי'), null);
  // בלי מקום בסופו: מילים מהספר.
  assert.equal(Locate.fromSelection('ויאמר משה'), null);
  assert.equal(Locate.fromSelection('אמר רבי יוחנן'), null);
  assert.equal(Locate.fromSelection('שבועות יד'), 'שבועות יד');
  assert.equal(Locate.fromSelection('יבמות ט"ו'), 'יבמות ט"ו');
  assert.equal(Locate.fromSelection('משנה ברורה סימן רצט'), 'משנה ברורה סימן רצט');
  assert.equal(Locate.fromSelection('שבת 31'), 'שבת 31');
});


test('fromReader: שם הספר בצורה של בר אילן, וכותרת שהיא שם הספר נמחקת', () => {
  assert.deepEqual(Locate.fromReader('בראשית', 'בראשית, פרק ב'), { title: 'בראשית', refs: ['בראשית פרק ב'] });
  assert.deepEqual(Locate.fromReader('רש"י על בראשית', 'רש"י על בראשית, פרשת בראשית, פרק ב').refs, ['רש"י בראשית פרק ב']);
  assert.equal(Locate.fromReader('משנה תורה, הלכות שבת', 'פרק א').title, 'רמב"ם הלכות שבת');
  assert.equal(Locate.fromReader('אבני נזר (מהדורת תשכ"ד)', 'סימן א').title, 'אבני נזר');
});

test('fromReader: דף בנקודה או בנקודתיים הופך לעמוד, ותיאור אחרי מקף נמחק', () => {
  assert.deepEqual(Locate.fromReader('ברכות', 'ברכות, דף ב.').refs, ['ברכות דף ב עמוד א']);
  assert.deepEqual(Locate.fromReader('ברכות', 'דף ב:').refs, ['ברכות דף ב עמוד ב']);
  assert.deepEqual(Locate.fromReader('ברכות', 'דף ב ע"ב').refs, ['ברכות דף ב עמוד ב']);
  // "א." בלי "דף" אינו דף: בספרים אחרים זה מספור של סעיף.
  assert.deepEqual(Locate.fromReader('ספר', 'א.').refs, ['ספר א']);
  assert.deepEqual(
    Locate.fromReader('שולחן ערוך, אורח חיים', 'סימן א - דין השכמת הבוקר, סעיף ב').refs,
    ['שולחן ערוך אורח חיים סימן א סעיף ב', 'שולחן ערוך אורח חיים סימן א'],
  );
});

test('fromReader: עד שלוש הפניות מהמדויקת לכללית; בלי מקום או בלי ספר', () => {
  const deep = Locate.fromReader('ספר', 'חלק א, שער ב, פרק ג, סימן ד, סעיף ה');
  assert.equal(deep.refs.length, Locate.MAX_READER_REFS);
  assert.equal(deep.refs[0], 'ספר חלק א שער ב פרק ג סימן ד סעיף ה');
  assert.equal(deep.refs.at(-1), 'ספר חלק א שער ב פרק ג');
  assert.deepEqual(Locate.fromReader('אבות', ''), { title: 'אבות', refs: [] });
  assert.deepEqual(Locate.fromReader('אבות', null).refs, []);
  assert.equal(Locate.fromReader('', 'פרק א'), null);
  // ספר שאינו בעברית: אין לו מקבילה בבר אילן, ואין מה לנסות.
  assert.deepEqual(Locate.fromReader('Genesis', 'פרק א'), { title: 'Genesis', refs: [] });
});

test('rankChoices: הספר עצמו לפני מפרשיו, ומקור ודאי רק כשהוא יחיד', () => {
  const choices = ['רש"י מסכת ברכות דף ב עמוד א', 'תלמוד בבלי מסכת ברכות דף ב עמוד א', 'מאירי מסכת שבת דף ב עמוד א'];
  assert.deepEqual(Locate.rankChoices(choices, 'ברכות', 'ברכות דף ב עמוד א'), { preferred: [1, 0], best: 1 });
  assert.deepEqual(Locate.rankChoices(choices, 'רש"י ברכות', 'רש"י ברכות דף ב עמוד א'), { preferred: [0], best: 0 });
  // שם הפרשה ופרטי מקום שאינם בהפניה אינם נחשבים תוספת.
  assert.equal(Locate.rankChoices(['בראשית פרשת נח פרק ו פסוק ט', 'רש"י בראשית פרשת נח פרק ו'], 'בראשית', 'בראשית פרק ו').best, 0);
  // שני מקורות בלי תוספת: אין ודאות, ושניהם מועדפים.
  assert.deepEqual(Locate.rankChoices(['בראשית פרק א', 'ספר בראשית פרק א'], 'בראשית', 'בראשית פרק א'), {
    preferred: [0, 1],
    best: null,
  });
  // סופיות וגרשיים אינם משנים.
  assert.equal(Locate.rankChoices(['שולחן ערוך אורח חיים סימן א'], 'שולחן ערוך אורח חיים', 'x').best, 0);
  assert.deepEqual(Locate.rankChoices(null, 'בראשית', ''), { preferred: [], best: null });
});

test('displayOrder: המועדפים ראשונים, השאר בסדר של בר אילן, בלי כפילויות', () => {
  assert.deepEqual(Locate.displayOrder(4, [2, 0]), [2, 0, 1, 3]);
  assert.deepEqual(Locate.displayOrder(3, null), [0, 1, 2]);
  assert.deepEqual(Locate.displayOrder(2, [5, 1]), [1, 0]);
});

test('fromReader: כותרת שהתיאור שלה מכיל פסיקים אינה מתפרקת לכמה כותרות', () => {
  // מתוך ספרי אוצריא: התיאור אחרי המקף מכיל פסיקים, ואוצריא מחברת כותרות ב-", ".
  assert.deepEqual(
    Locate.fromReader('תנא ושייר', 'תנא ושייר, סימן לב - ראובן שלח סחורה ביד שמעון, והסחורה לא נמכרה, וראובן תבע').refs,
    ['תנא ושייר סימן לב'],
  );
  // אחרי תיאור, חתיכה שפותחת במילת מקום היא כותרת חדשה.
  assert.deepEqual(Locate.fromReader('ספר', 'סימן א - דין, ועוד, סעיף ג').refs, ['ספר סימן א סעיף ג', 'ספר סימן א']);
  // בלי תיאור, כל חתיכה היא כותרת.
  assert.deepEqual(Locate.fromReader('טור', 'טור, אורח חיים, סימן א').refs, ['טור אורח חיים סימן א', 'טור אורח חיים']);
});

test('fromReader: כותרות מתוכן העניינים, סוגריים, ומקום ארוך מדי', () => {
  assert.deepEqual(Locate.fromReader('ספר', ['חלק א', 'סימן [ב] (הגהה)', 'סעיף ג']).refs, [
    'ספר חלק א סימן ב סעיף ג',
    'ספר חלק א סימן ב',
    'ספר חלק א',
  ]);
  // כותרת שאינה מקום נחתכת לארבע מילים; הפניה לא נחתכת באמצע מילה.
  const long = Locate.fromReader('ספר', ['הלכות ' + 'מילה '.repeat(80), 'פרק א']);
  assert.deepEqual(long.refs, ['ספר הלכות מילה מילה מילה פרק א', 'ספר הלכות מילה מילה מילה']);
  for (const ref of Locate.fromReader('א'.repeat(190), 'סימן א, סעיף ב').refs) {
    assert.ok(ref.length < Locate.MAX_LENGTH);
  }
});

test('headingsAt: לכל רמה הכותרת האחרונה שלפני השורה', () => {
  const toc = [
    { text: 'בראשית', index: 0, level: 1 },
    { text: 'פרק א', index: 1, level: 2 },
    { text: 'פרק ב', index: 40, level: 2 },
    { text: 'שמות', index: 100, level: 1 },
    { text: 'פרק א', index: 101, level: 2 },
  ];
  assert.deepEqual(Locate.headingsAt(toc, 45), ['בראשית', 'פרק ב']);
  assert.deepEqual(Locate.headingsAt(toc, 40), ['בראשית', 'פרק ב']);
  assert.deepEqual(Locate.headingsAt(toc, 100), ['שמות']);
  // רמה חסרה (ספר שמתחיל ברמה 2) אינה מזיזה את האחרות.
  assert.deepEqual(Locate.headingsAt([{ text: 'סימן א', index: 0, level: 2 }], 5), ['סימן א']);
  assert.equal(Locate.headingsAt(toc, -1), null);
  assert.equal(Locate.headingsAt([], 3), null);
  assert.equal(Locate.headingsAt(null, 3), null);
});
