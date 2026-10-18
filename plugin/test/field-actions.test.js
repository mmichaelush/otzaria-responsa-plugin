// הכפתור "בבר אילן" בשדות החיפוש של אוצריא (0.9.99). כבוי עד שאוצריא 0.9.99
// יוצאת; הבדיקה האחרונה שומרת שהמניפסט והמתג יודלקו יחד.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FieldActions = require('../js/responsa-field-actions.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const event = (fields) => Object.assign({ actionId: 'bar-ilan', sessionId: 's', field: 'fullText', text: '' }, fields);

test('requestFor: כל שדה ללשונית שלו', () => {
  assert.equal(FieldActions.requestFor(event({ field: 'fullText', text: 'נר שבת' })).tab, 'text');
  assert.equal(FieldActions.requestFor(event({ field: 'findRef', text: 'בראשית ב ג' })).tab, 'locate');
  assert.equal(FieldActions.requestFor(event({ field: 'library', text: 'אבני נזר' })).tab, 'books');
  assert.equal(FieldActions.requestFor(event({ field: 'inBook' })), null);
  assert.equal(FieldActions.requestFor(event({ actionId: 'dictate' })), null);
  assert.equal(FieldActions.requestFor(null), null);
});

test('requestFor: טקסט מסומן בשדה — רק הוא', () => {
  const request = FieldActions.requestFor(event({ text: 'חיפוש נר שבת', selectionStart: 6, selectionEnd: 12 }));
  assert.equal(request.text, 'נר שבת');
  assert.equal(request.sessionId, 's');
  // סימון ריק (הסמן בלבד): כל השדה.
  assert.equal(FieldActions.requestFor(event({ text: ' נר שבת ', selectionStart: 2, selectionEnd: 2 })).text, 'נר שבת');
});

test('register: כבוי — לא נרשם לאירוע', () => {
  const subscribed = [];
  const registered = FieldActions.register((name) => subscribed.push(name), {});
  assert.equal(registered, FieldActions.ENABLED);
  assert.deepEqual(subscribed, FieldActions.ENABLED ? ['search.fieldAction.invoked'] : []);
});

test('המתג והמניפסט יחד (TODO(otzaria-0.9.99))', () => {
  const declared = ((manifest.contributes || {}).startup || {}).searchFieldActions;
  const permission = (manifest.permissions || []).includes(FieldActions.PERMISSION);
  if (!FieldActions.ENABLED) {
    // עד 0.9.99: משתמשי 0.9.98 לא היו יכולים להתקין גרסה עם התכונה.
    assert.equal(declared, undefined, 'searchFieldActions במניפסט לפני 0.9.99');
    assert.equal(permission, false, `${FieldActions.PERMISSION} במניפסט לפני 0.9.99`);
    return;
  }
  const parts = (value) => String(value).split('.').map(Number);
  const [a, b, c] = parts(manifest.minAppVersion);
  const [x, y, z] = parts(FieldActions.MIN_APP_VERSION);
  assert.ok(a > x || (a === x && (b > y || (b === y && c >= z))), 'minAppVersion חייב להיות 0.9.99 לפחות');
  assert.ok(permission, `חסרה ההרשאה ${FieldActions.PERMISSION}`);
  assert.deepEqual(declared, [FieldActions.CONTRIBUTION]);
});
