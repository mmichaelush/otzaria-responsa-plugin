// הכפתור "בבר אילן" בשדות החיפוש של אוצריא (0.9.98.1): מה שהמניפסט מצהיר,
// ומה שהלחיצה מעבירה ללשונית.
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

test('register: האירוע של הלחיצה מגיע לבקר', () => {
  const subscribed = {};
  FieldActions.register((name, handler) => (subscribed[name] = handler), { fieldActionInvoked: (e) => e });
  assert.deepEqual(Object.keys(subscribed), ['search.fieldAction.invoked']);
  const click = event({ text: 'נר' });
  assert.equal(subscribed['search.fieldAction.invoked'](click), click);
});

test('המניפסט מצהיר על הכפתור ועל ההרשאה שלו, ובגרסה שמכירה אותו', () => {
  const declared = manifest.contributes.startup.searchFieldActions;
  assert.deepEqual(declared, [FieldActions.CONTRIBUTION]);
  assert.ok(manifest.permissions.includes(FieldActions.PERMISSION), `חסרה ההרשאה ${FieldActions.PERMISSION}`);
  // אוצריא 0.9.98 קוראת את 0.9.98.1 כ-0.9.98 ואינה מכירה את הכפתור.
  assert.equal(FieldActions.MIN_APP_VERSION, '0.9.98.1');
  // אין מנוע רקע: הלחיצה פותחת את הדף ומוסרת אליו את האירוע.
  assert.ok(!manifest.permissions.includes('app.run_on_startup'));
});
