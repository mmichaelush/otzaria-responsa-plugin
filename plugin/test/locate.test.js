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
