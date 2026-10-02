// החיפוש המתקדם: השאילתות כאן נבדקו חי מול "חיפוש מתקדם" של בר אילן 25
// (2.10.2026), והסימנים נבנו בכפתורים של בר אילן עצמו.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Advanced } = loadPlugin();
const { buildQuery, validate, toRequest, normalize, emptyQuery } = Advanced;

const term = (words, form, exclude) => ({
  words: Array.isArray(words) ? words : [words],
  form: form || 'exact',
  exclude: Boolean(exclude),
});
const query = (overrides) => normalize({ ...emptyQuery(), ...overrides });

test('מילים צמודות, מרחק אחריה ומרחק לשני הכיוונים', () => {
  assert.equal(buildQuery(query({ terms: [term('נר'), term('שבת')] })), 'נר שבת');
  assert.equal(
    buildQuery(query({ terms: [term('נר'), term('שבת')], gaps: [{ kind: 'after', distance: 4 }] })),
    'נר [1:4] שבת',
  );
  assert.equal(
    buildQuery(query({ terms: [term('חכמים'), term('תקנו')], gaps: [{ kind: 'around', distance: 1 }] })),
    'חכמים [-1:1] תקנו',
  );
});

test('פיזור בכל סדר: המספר בראש השאילתה', () => {
  const q = query({ terms: [term('עגונה'), term('גוי'), term('עדות')], anyOrder: true, within: 10 });
  assert.equal(buildQuery(q), '10: עגונה גוי עדות');
  // מילה אחת אינה צריכה טווח.
  assert.equal(buildQuery(query({ terms: [term('עגונה')], anyOrder: true })), 'עגונה');
});

test('חלופות, ומאפיין מחוץ לסוגריים', () => {
  const q = query({
    terms: [term(['קוצץ', 'עוקר', 'משחית']), term(['פקדון', 'אבידה'], 'contains')],
    gaps: [{ kind: 'after', distance: 3 }],
  });
  assert.equal(buildQuery(q), '(קוצץ/עוקר/משחית) [1:3] *(פקדון/אבידה)*');
});

test('כל צורה בסימנים שבר אילן עצמו בונה', () => {
  const expected = {
    exact: 'אהרון',
    prefixes: '#אהרון',
    suffixes: 'אהרון#',
    affixes: '#אהרון#',
    startsWith: 'אהרון*',
    endsWith: '*אהרון',
    contains: '*אהרון*',
    prefixesAny: '#אהרון*',
    spelling: '!אהרון',
    spellingPrefixes: '#!אהרון',
    quotes: '+אהרון',
    entry: '$אהרון',
    root: '%אהרון',
    aramaic: '^אהרון',
    family: '<אהרון>',
    saved: '{אהרון}',
  };
  assert.deepEqual(Object.keys(expected).sort(), Advanced.FORMS.map((f) => f.id).sort());
  for (const [form, text] of Object.entries(expected)) {
    assert.equal(Advanced.termText(term('אהרון', form)), text, form);
  }
  // שלילה לפני כל סימן אחר (כך בר אילן בונה: `-#אהרון`).
  assert.equal(Advanced.termText(term('אהרון', 'prefixes', true)), '-#אהרון');
});

test('מילה ריקה מדולגת עם המרחק שלפניה', () => {
  const q = query({
    terms: [term('נר'), term(''), term('שבת')],
    gaps: [{ kind: 'after', distance: 2 }, { kind: 'adjacent' }],
  });
  assert.equal(buildQuery(q), 'נר שבת');
});

test('בדיקה: מה חסר או שגוי, ובאיזו מילה', () => {
  assert.match(validate(query({ terms: [term('')] })).message, /לפחות מילה אחת/);
  assert.match(validate(query({ terms: [term('בני', 'exact', true)] })).message, /שאינה מסומנת/);
  const phrase = validate(query({ terms: [term('נר'), term('צער בעלי')] }));
  assert.equal(phrase.term, 1);
  assert.match(phrase.message, /מילה אחת/);
  assert.equal(validate(query({ terms: [term('shabbat')] })).term, 0);
  assert.match(validate(query({ terms: [term(['שבט', 'לוי'], 'family')] })).message, /שם אחד/);
  assert.equal(validate(query({ terms: [term('*ט(ע/י/@)ל*')] })), null);
  assert.match(
    validate(query({ terms: [term('נר')], scope: { mode: 'pick', items: [] } })).message,
    /לפחות קטגוריה/,
  );
});

test('כתיבה חופשית: נשלחת כמות שהיא, אחרי בדיקת תווים', () => {
  const q = query({ manual: true, manualText: '  8: ($שומר/%מצא)   #(אכל/גנב) ' });
  assert.equal(buildQuery(q), '8: ($שומר/%מצא) #(אכל/גנב)');
  assert.equal(validate(q), null);
  assert.match(validate(query({ manual: true, manualText: 'נר & שבת' })).message, /"&"/);
  assert.match(validate(query({ manual: true, manualText: '[1:4]' })).message, /בעברית/);
});

test('גוף הבקשה: כל הספרים, הבחירה שבבר אילן, או תחום', () => {
  const base = { terms: [term('נר')], options: { abbreviations: true, showForms: false } };
  assert.deepEqual(toRequest(query(base)), {
    q: 'נר',
    advanced: true,
    options: { abbreviations: true, showForms: false, allDatabases: true },
  });
  assert.equal(toRequest(query({ ...base, scope: { mode: 'current' } })).options.allDatabases, false);
  const picked = toRequest(
    query({
      ...base,
      scope: {
        mode: 'pick',
        items: [
          { type: 'category', path: 'שו"ת/ראשונים', name: 'ראשונים' },
          { type: 'book', key: '90', name: 'אבני נזר', path: 'שו"ת' },
        ],
      },
    }),
  );
  assert.deepEqual(picked.scope, { paths: ['שו"ת/ראשונים'], books: ['90'] });
  assert.equal('allDatabases' in picked.options, false);
});

test('תחום: קטגוריה בולעת את מה שתחתיה, ובחירה חוזרת מבטלת', () => {
  let q = query({ scope: { mode: 'pick', items: [] } });
  const book = { type: 'book', key: '90', name: 'אבני נזר', path: 'שו"ת/אחרונים' };
  const category = { type: 'category', path: 'שו"ת', name: 'שו"ת' };
  q = Advanced.toggleScopeItem(q, book);
  assert.equal(q.scope.items.length, 1);
  q = Advanced.toggleScopeItem(q, category);
  assert.deepEqual(q.scope.items, [category]);
  assert.equal(Advanced.scopeIncludes(q, book), true);
  q = Advanced.toggleScopeItem(q, category);
  assert.deepEqual(q.scope.items, []);
});

test('עריכה: הוספה והסרה של מילים, חלופות ומרחקים', () => {
  let q = emptyQuery();
  q = Advanced.setWord(q, 0, 0, 'נר');
  q = Advanced.addTerm(q);
  q = Advanced.setWord(q, 1, 0, 'שבת');
  q = Advanced.updateGap(q, 0, { kind: 'after', distance: 99 });
  assert.equal(buildQuery(q), 'נר [1:' + Advanced.MAX_DISTANCE + '] שבת');
  q = Advanced.addAlternative(q, 1);
  q = Advanced.setWord(q, 1, 1, 'חנוכה');
  assert.equal(buildQuery(q), 'נר [1:30] (שבת/חנוכה)');
  q = Advanced.removeAlternative(q, 1, 0);
  q = Advanced.removeTerm(q, 0);
  assert.equal(buildQuery(q), 'חנוכה');
  assert.equal(q.gaps.length, 0);
  // המילה האחרונה אינה נמחקת אלא מתרוקנת.
  assert.equal(buildQuery(Advanced.removeTerm(q, 0)), '');
});

test('מודל שנשמר פגום חוזר לברירות המחדל', () => {
  const q = normalize({
    terms: [{ words: ['נר', 5], form: 'nope', exclude: 'yes' }, null],
    gaps: [{ kind: 'far', distance: -4 }],
    within: 'x',
    scope: { mode: 'pick', items: [{ type: 'category' }, { type: 'book', key: '1', name: 'x' }] },
    options: { abbreviations: 'yes' },
  });
  assert.deepEqual(q.terms[0], { words: ['נר', ''], form: 'exact', exclude: false });
  assert.deepEqual(q.gaps[0], { kind: 'adjacent', distance: 1 });
  assert.equal(q.within, 10);
  assert.equal(q.scope.items.length, 1);
  assert.equal(q.options.abbreviations, false);
});

test('כל דוגמה נבנית לשאילתה תקינה', () => {
  for (const example of Advanced.EXAMPLES) {
    const q = Advanced.applyExample(emptyQuery(), example.id);
    assert.equal(validate(q), null, example.id);
    assert.ok(buildQuery(q).length > 0, example.id);
  }
  assert.equal(buildQuery(Advanced.applyExample(emptyQuery(), 'spelling')), '#!אהרון הכהן');
  assert.equal(buildQuery(Advanced.applyExample(emptyQuery(), 'exclude')), '-בני ישראל');
});

test('תצוגה: מרחקים ופיזור מבודדים משמאל לימין, והשאילתה עצמה אינה משתנה', () => {
  assert.equal(
    Advanced.displayQuery('10: חכמים [-1:1] תקנו'),
    '\u206610:\u2069 חכמים \u2066[-1:1]\u2069 תקנו',
  );
  assert.equal(Advanced.displayQuery('#נר'), '#נר');
});
