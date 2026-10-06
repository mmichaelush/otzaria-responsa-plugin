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
/** בונה (ולא חיפוש רגיל), אלא אם נאמר אחרת. */
const query = (overrides) => normalize({ ...emptyQuery(), mode: 'builder', ...overrides });

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
  const q = query({ mode: 'manual', manualText: '  8: ($שומר/%מצא)   #(אכל/גנב) ' });
  assert.equal(buildQuery(q), '8: ($שומר/%מצא) #(אכל/גנב)');
  assert.equal(validate(q), null);
  assert.match(validate(query({ mode: 'manual', manualText: 'נר & שבת' })).message, /"&"/);
  assert.match(validate(query({ mode: 'manual', manualText: '[1:4]' })).message, /בעברית/);
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
  let q = { ...emptyQuery(), mode: 'builder' };
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

test('חיפוש רגיל: מילים עבריות בלבד, צמודות; ניקוד, פיסוק וסימני חיפוש נמחקים', () => {
  const simple = (text) => query({ mode: 'simple', simpleText: text });
  assert.equal(buildQuery(simple('בְּרֵאשִׁית בָּרָא, אֱלֹהִים!')), 'בראשית ברא אלהים');
  assert.equal(buildQuery(simple('״רמב״ם״ ר׳ יוסי־בן')), 'רמב"ם ר\' יוסי בן');
  // סימן חיפוש של בר אילן היה פועל כאופרטור.
  assert.equal(buildQuery(simple('#נר [1:4] שבת*')), 'נר שבת');
  assert.match(validate(simple('shabbat 123')).message, /בעברית/);
  assert.equal(validate(simple('נר שבת')), null);
  // אין "ניהול צורות" בחיפוש רגיל, גם אם נשמר מהמתקדם.
  const body = toRequest(query({ mode: 'simple', simpleText: 'נר', options: { abbreviations: true, showForms: true } }));
  assert.deepEqual(body.options, { abbreviations: true, showForms: false, allDatabases: true });
  assert.equal(body.advanced, true);
});

test('מודל מגרסה 0.4: כתיבה חופשית, או בונה שמולא, נשמרים באותו אופן', () => {
  assert.equal(normalize({ manual: true, manualText: 'נר' }).mode, 'manual');
  assert.equal(normalize({ terms: [term('נר')] }).mode, 'builder');
  assert.equal(normalize({}).mode, 'simple');
  assert.equal(normalize({ mode: 'nope' }).mode, 'simple');
});

test('מעבר מחיפוש רגיל לבונה: המילים שנכתבו הופכות למילים בבונה', () => {
  let q = { ...emptyQuery(), simpleText: 'נר של שבת' };
  q = Advanced.setMode(q, 'builder');
  assert.deepEqual(q.terms.map((entry) => entry.words[0]), ['נר', 'של', 'שבת']);
  assert.equal(buildQuery(q), 'נר של שבת');
  // בונה שכבר מולא אינו נדרס.
  const filled = Advanced.setMode({ ...q, mode: 'simple', simpleText: 'אחר' }, 'builder');
  assert.equal(buildQuery(filled), 'נר של שבת');
  // מעבר לתחביר מתחיל מהשאילתה שבבונה.
  assert.equal(Advanced.setMode(Advanced.updateGap(q, 0, { kind: 'after', distance: 2 }), 'manual').manualText, 'נר [1:2] של שבת');
});

test('הסבר במילים: מה יחופש, איפה ובאילו אפשרויות', () => {
  assert.deepEqual(Advanced.describe(query({ mode: 'simple', simpleText: 'נר שבת' }), 'בכל הספרים.'), [
    'מקורות שבהם המילים "נר שבת" מופיעות צמודות, בסדר הזה.',
    'בכל הספרים.',
  ]);
  const q = query({
    terms: [term('נר', 'prefixes'), term(['שבת', 'חנוכה']), term('יום', 'exact', true)],
    gaps: [{ kind: 'after', distance: 4 }, { kind: 'adjacent' }],
    options: { abbreviations: true, showForms: true },
  });
  assert.deepEqual(Advanced.describe(q), [
    'מקורות שבהם מופיעה המילה "נר" עם אותיות שימוש, ואחריה (עד 4 מילים ממנה) "שבת" או "חנוכה".',
    'בלי מקורות שבהם מופיעה המילה "יום".',
    'כולל ראשי תיבות: "צער בעלי חיים" ימצא גם "צעב"ח".',
    'לפני התוצאות בר אילן יציג את הצורות שנמצאו, לבחירה.',
  ]);
  const scattered = query({ terms: [term('עגונה'), term('גוי')], anyOrder: true, within: 10 });
  assert.deepEqual(Advanced.describe(scattered), [
    'מקורות שבהם מופיעות כל המילים, בכל סדר, עד 10 מילים זו מזו:',
    '• "עגונה"',
    '• "גוי"',
  ]);
});

test('תצוגה: מרחקים ופיזור מבודדים משמאל לימין, והשאילתה עצמה אינה משתנה', () => {
  assert.equal(
    Advanced.displayQuery('10: חכמים [-1:1] תקנו'),
    '\u206610:\u2069 חכמים \u2066[-1:1]\u2069 תקנו',
  );
  assert.equal(Advanced.displayQuery('#נר'), '#נר');
});

test('withAvailableScope: בלי רשימת ספרים, בחירת קטגוריות היא "כל הספרים"', () => {
  const query = Advanced.emptyQuery();
  query.mode = Advanced.Mode.simple;
  query.simpleText = 'נר שבת';
  query.scope = { mode: Advanced.Scope.pick, items: [] };

  assert.equal(Advanced.withAvailableScope(query, true), query);
  const shown = Advanced.withAvailableScope(query, false);
  assert.equal(shown.scope.mode, Advanced.Scope.all);
  assert.equal(Advanced.validate(shown), null);
  assert.equal(Advanced.toRequest(shown).options.allDatabases, true);
  // הבחירה השמורה נשארת, לפעם שהרשימה תהיה.
  assert.equal(query.scope.mode, Advanced.Scope.pick);
});

test('describe: מילה מוחרגת בין שתי מילים היא חוליה בשרשרת, לא שורה נפרדת', () => {
  let query = Advanced.setMode(Advanced.emptyQuery(), Advanced.Mode.builder);
  query = Advanced.setWord(query, 0, 0, 'נר');
  query = Advanced.addTerm(query);
  query = Advanced.setWord(query, 1, 0, 'חנוכה');
  query = Advanced.updateTerm(query, 1, { exclude: true });
  query = Advanced.addTerm(query);
  query = Advanced.setWord(query, 2, 0, 'שבת');

  const lines = Advanced.describe(query, null);

  assert.match(lines[0], /נר.*לא המילה .*חנוכה.*שבת/);
  assert.equal(lines.filter((line) => /^בלי מקורות/.test(line)).length, 0);
});

// ------------------------------------------- מדיאלוג החיפוש של אוצריא

test('fromOtzariaSearch: מדויק — חיפוש רגיל; מרווח במתקדם — בונה, באותו מרחק', () => {
  const base = { ...emptyQuery(), scope: { mode: 'pick', items: [{ type: 'category', path: 'שו"ת', name: 'שו"ת' }] } };
  const exact = Advanced.fromOtzariaSearch(base, { query: 'נֵר, שַׁבָּת', mode: 'exact', distance: 0 });
  assert.equal(exact.query.mode, 'simple');
  assert.equal(exact.query.simpleText, 'נר שבת');
  assert.equal(exact.approximate, false);
  assert.deepEqual(exact.query.scope, base.scope, 'התחום שבחורים בלשונית נשאר');

  const near = Advanced.fromOtzariaSearch(base, { query: 'נר שבת חנוכה', mode: 'advanced', distance: 2 });
  assert.equal(near.query.mode, 'builder');
  // באוצריא "2" = עד שתי מילים ביניהן; בבר אילן [1:3] = עד המילה השלישית.
  assert.equal(buildQuery(near.query), 'נר [1:3] שבת [1:3] חנוכה');
  assert.equal(near.approximate, false);
});

test('fromOtzariaSearch: מה שאין בבר אילן מסומן כקירוב; בלי עברית — null', () => {
  const base = emptyQuery();
  assert.equal(Advanced.fromOtzariaSearch(base, { query: 'נר', mode: 'fuzzy', distance: 1 }).approximate, true);
  // "כל אחת מהמילים" ← מילה אחת עם חלופות, בדיוק.
  const any = Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'advanced', distance: 0, wordMatchMode: 'anyWord' });
  assert.equal(buildQuery(any.query), '(נר/שבת)');
  assert.equal(any.approximate, false);
  // "באותה פסקה" ← בכל סדר בטווח הרחב ביותר: קירוב.
  const paragraph = Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'advanced', proximityScope: 'sameParagraph' });
  assert.equal(buildQuery(paragraph.query), Advanced.MAX_DISTANCE + ': נר שבת');
  assert.equal(paragraph.approximate, true);
  // סינון קטגוריות ותווים כלליים של אוצריא אינם עוברים.
  for (const extra of [{ facets: ['/תנך'] }, { query: 'נר*' }]) {
    assert.equal(Advanced.fromOtzariaSearch(base, { query: 'נר', mode: 'exact', ...extra }).approximate, true);
  }
  // "קידומות" (כל אות, עד 3) עוברת כ"מסתיימת כך", שאינה מוגבלת: רחבה יותר.
  const prefixes = Advanced.fromOtzariaSearch(base, { query: 'נר', mode: 'exact', wordOptions: { 'נר_0': { 'קידומות': true } } });
  assert.equal(buildQuery(prefixes.query), '*נר');
  assert.equal(prefixes.approximate, true);
  assert.deepEqual(prefixes.missing, ['קידומות']);
  // מרווח מעבר לטווח של בר אילן נחתך: קירוב.
  assert.equal(Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'advanced', distance: 99 }).approximate, true);
  // ברירות המחדל שאוצריא שולחת (נמצא בבדיקה חיה): כל הספרייה ואפשרויות כבויות.
  const defaults = Advanced.fromOtzariaSearch(base, {
    query: 'נר שבת',
    mode: 'exact',
    distance: 0,
    facets: ['/'],
    wordOptions: { 'נר_0': { 'קידומות דקדוקיות': false }, 'שבת_1': {} },
  });
  assert.equal(defaults.approximate, false);
  assert.equal(
    Advanced.fromOtzariaSearch(base, { query: 'נר', mode: 'exact', alternativeWords: { 0: [] }, customSpacing: {} }).approximate,
    false,
  );
  // במצב מדויק המרווח והמדיניות אינם חלים.
  assert.equal(Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'exact', distance: 5, wordMatchMode: 'anyWord' }).approximate, false);
  const negative = Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'advanced', distance: 1, negativeQuery: 'חנוכה' });
  assert.equal(negative.query.mode, 'builder');
  assert.equal(negative.approximate, true);
  // מילה אחת עם מרווח: אין בין מה למדוד, ולכן רגיל — וזה קירוב.
  assert.equal(Advanced.fromOtzariaSearch(base, { query: 'נר', mode: 'advanced', distance: 3 }).approximate, true);
  assert.equal(Advanced.fromOtzariaSearch(base, { query: 'abc' }), null);
  assert.equal(Advanced.fromOtzariaSearch(base, null), null);
  assert.equal(validate(Advanced.fromOtzariaSearch(base, { query: 'נר שבת', mode: 'exact' }).query), null);
});

// השמות של אוצריא 0.9.98 (SearchQueryBuilder): רק אפשרויות דלוקות נשלחות,
// ו"אותן אפשרויות לכל המילים" כבר פרוש לכל מילה.
const fromOtzaria = (request, base) =>
  Advanced.fromOtzariaSearch(base || emptyQuery(), { query: 'נר שבת', mode: 'exact', distance: 0, ...request });

test('fromOtzariaSearch: אפשרויות דקדוקיות וכתיב עוברות במדויק, צמודות, גם במצב מדויק', () => {
  const grammatical = fromOtzaria({
    wordOptions: { 'נר_0': { 'קידומות דקדוקיות': true }, 'שבת_1': { 'סיומות דקדוקיות': true } },
  });
  assert.equal(grammatical.query.mode, 'builder');
  assert.equal(buildQuery(grammatical.query), '#נר שבת#');
  assert.equal(toRequest(grammatical.query).q, '#נר שבת#');
  assert.equal(validate(grammatical.query), null);
  assert.equal(grammatical.approximate, false);
  assert.deepEqual(grammatical.missing, []);

  const expected = [
    [{ 'קידומות דקדוקיות': true, 'סיומות דקדוקיות': true }, '#נר# שבת'],
    [{ 'כתיב מלא/חסר': true }, '!נר שבת'],
    [{ 'כתיב מלא/חסר': true, 'קידומות דקדוקיות': true }, '#!נר שבת'],
  ];
  for (const [options, text] of expected) {
    const mapped = fromOtzaria({ wordOptions: { 'נר_0': options } });
    assert.equal(buildQuery(mapped.query), text, text);
    assert.equal(mapped.approximate, false, text);
  }
  // ניקוד במפתח של אוצריא אינו מפריע להתאמה.
  assert.equal(buildQuery(fromOtzaria({ query: 'נֵר שבת', wordOptions: { 'נֵר_0': { 'כתיב מלא/חסר': true } } }).query), '!נר שבת');
});

test('fromOtzariaSearch: כל אות ("קידומות", "סיומות", "חלק ממילה") — רחב יותר, ולכן קירוב עם שם', () => {
  const expected = [
    [{ 'סיומות': true }, 'נר* שבת', ['סיומות']],
    [{ 'חלק ממילה': true }, '*נר* שבת', ['חלק ממילה']],
    [{ 'קידומות דקדוקיות': true, 'סיומות': true }, '#נר* שבת', ['סיומות']],
    // `*נר#` אינו מוכר: "מכילה".
    [{ 'קידומות': true, 'סיומות דקדוקיות': true }, '*נר* שבת', ['קידומות']],
  ];
  for (const [options, text, missing] of expected) {
    const mapped = fromOtzaria({ mode: 'advanced', wordOptions: { 'נר_0': options } });
    assert.equal(buildQuery(mapped.query), text, text);
    assert.equal(mapped.approximate, true, text);
    assert.deepEqual(mapped.missing, missing, text);
  }
});

test('fromOtzariaSearch: צירוף שבר אילן אינו מקבל, ואפשרות בלי מקבילה — נשמטים ונקראים בשם', () => {
  const mapped = fromOtzaria({
    mode: 'advanced',
    wordOptions: {
      'נר_0': { 'סיומות דקדוקיות': true, 'כתיב מלא/חסר': true, 'שגיאות כתיב': true },
      'שבת_1': { 'ניקוד': true, 'קידומות ארמיות': true },
    },
  });
  assert.equal(buildQuery(mapped.query), 'נר# שבת');
  assert.equal(mapped.approximate, true);
  assert.deepEqual(mapped.missing, ['כתיב מלא/חסר', 'שגיאות כתיב', 'ניקוד', 'קידומות ארמיות']);

  // גרשיים ותרגום: רק כשהם האפשרות היחידה של המילה. `+` נמדד בלי הגרשיים.
  const alone = fromOtzaria({
    query: 'רמב"ם אמר',
    mode: 'advanced',
    wordOptions: { 'רמב"ם_0': { 'התעלם מגרשיים': true }, 'אמר_1': { 'תרגום ארמי': true } },
  });
  assert.equal(buildQuery(alone.query), '+רמבם ^אמר');
  assert.equal(alone.approximate, false);
  const together = fromOtzaria({
    query: 'רמב"ם אמר',
    mode: 'advanced',
    wordOptions: { 'רמב"ם_0': { 'התעלם מגרשיים': true, 'כתיב מלא/חסר': true }, 'אמר_1': { 'תרגום ארמי': true, 'קידומות דקדוקיות': true } },
  });
  assert.equal(buildQuery(together.query), '!רמב"ם #אמר');
  assert.deepEqual(together.missing, ['התעלם מגרשיים', 'תרגום ארמי']);
  assert.equal(validate(together.query), null);
  // בלי גרשיים במילה, "התעלם מגרשיים" אינו משנה דבר.
  const noQuotes = fromOtzaria({ wordOptions: { 'נר_0': { 'התעלם מגרשיים': true } } });
  assert.equal(noQuotes.query.mode, 'simple');
  assert.equal(noQuotes.approximate, false);
});

test('fromOtzariaSearch: "ראשי תיבות" מדליק את "כולל ראשי תיבות", ולעולם אינו מכבה', () => {
  const both = fromOtzaria({ wordOptions: { 'נר_0': { 'ראשי תיבות': true }, 'שבת_1': { 'ראשי תיבות': true } } });
  assert.equal(both.query.mode, 'simple');
  assert.equal(toRequest(both.query).options.abbreviations, true);
  assert.equal(both.approximate, false);
  // בבר אילן האפשרות חלה על כל השאילתה.
  const one = fromOtzaria({ wordOptions: { 'נר_0': { 'ראשי תיבות': true } } });
  assert.equal(one.query.options.abbreviations, true);
  assert.deepEqual(one.missing, ['ראשי תיבות']);
  const kept = fromOtzaria({}, { ...emptyQuery(), options: { abbreviations: true, showForms: false } });
  assert.equal(kept.query.options.abbreviations, true);
});

test('fromOtzariaSearch: מילים חלופיות ← (א/ב); ביטוי ולועזית נשמטים, עם הצורה של המילה', () => {
  const plain = fromOtzaria({ mode: 'advanced', alternativeWords: { 0: ['אור'] } });
  assert.equal(buildQuery(plain.query), '(נר/אור) שבת');
  assert.equal(toRequest(plain.query).q, '(נר/אור) שבת');
  assert.equal(plain.approximate, false);

  const mixed = fromOtzaria({
    mode: 'advanced',
    alternativeWords: { 0: ['אור', 'אוֹר', 'נר גדול', 'light'] },
    wordOptions: { 'נר_0': { 'קידומות דקדוקיות': true } },
  });
  assert.equal(buildQuery(mixed.query), '#(נר/אור) שבת');
  assert.deepEqual(mixed.missing, ['"נר גדול"', '"light"']);
  assert.equal(mixed.approximate, true);

  // עד MAX_ALTERNATIVES מילים בשדה.
  const many = fromOtzaria({ mode: 'advanced', alternativeWords: { 1: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] } });
  assert.deepEqual(many.query.terms[1].words, ['שבת', 'א', 'ב', 'ג', 'ד', 'ה']);
  assert.deepEqual(many.missing, ['"ו"']);

  // "כל אחת מהמילים": קבוצה אחת; צורה משותפת נשארת, צורות שונות — המילים בלבד.
  const anyWord = { mode: 'advanced', wordMatchMode: 'anyWord' };
  const same = fromOtzaria({
    ...anyWord,
    alternativeWords: { 0: ['אור'] },
    wordOptions: { 'נר_0': { 'קידומות דקדוקיות': true }, 'שבת_1': { 'קידומות דקדוקיות': true } },
  });
  assert.equal(buildQuery(same.query), '#(נר/שבת/אור)');
  assert.equal(same.approximate, false);
  const different = fromOtzaria({ ...anyWord, wordOptions: { 'נר_0': { 'קידומות דקדוקיות': true } } });
  assert.equal(buildQuery(different.query), '(נר/שבת)');
  assert.equal(different.approximate, true);
});

test('fromOtzariaSearch: מרווח ידני לכל זוג; זוג בלי ערך מקבל את הגדול שבהם', () => {
  const advanced = { query: 'נר שבת חנוכה', mode: 'advanced', distance: 1 };
  const missingPair = fromOtzaria({ ...advanced, customSpacing: { '1-2': '3' } });
  assert.equal(buildQuery(missingPair.query), 'נר [1:4] שבת [1:4] חנוכה');
  assert.equal(missingPair.approximate, false);
  const mixed = fromOtzaria({ ...advanced, customSpacing: { '0-1': '0', '1-2': '2' } });
  assert.equal(buildQuery(mixed.query), 'נר שבת [1:3] חנוכה');
  assert.equal(toRequest(mixed.query).q, 'נר שבת [1:3] חנוכה');
  // מרווח ידני גובר על המרווח הכללי: כולם 0 ← צמודות, בדיוק.
  const adjacent = fromOtzaria({ ...advanced, distance: 5, customSpacing: { '0-1': '0', '1-2': '0' } });
  assert.equal(adjacent.query.mode, 'simple');
  assert.equal(adjacent.approximate, false);
  const far = fromOtzaria({ ...advanced, customSpacing: { '0-1': '40' } });
  assert.equal(buildQuery(far.query), 'נר [1:30] שבת [1:30] חנוכה');
  assert.equal(far.approximate, true);
  // במצב מדויק אוצריא אינה שולחת מרווחים, וכאן הם אינם חלים.
  assert.equal(fromOtzaria({ customSpacing: { '0-1': '3' } }).query.mode, 'simple');
});

test('fromOtzariaSearch: מקומות המילים אינם תואמים ← בלי ההגדרות לכל מילה, וקירוב', () => {
  // "abc" היא מילה באוצריא ונמחקת כאן: "נר" הוא 1 שם ו-0 כאן.
  const dropped = fromOtzaria({
    query: 'abc נר שבת',
    mode: 'advanced',
    wordOptions: { 'נר_1': { 'קידומות דקדוקיות': true } },
    alternativeWords: { 1: ['אור'] },
    customSpacing: { '1-2': '3' },
  });
  assert.equal(dropped.query.mode, 'simple');
  assert.equal(buildQuery(dropped.query), 'נר שבת');
  assert.equal(dropped.approximate, true);
  assert.deepEqual(dropped.missing, []);
  // מילה במפתח שאינה המילה במקום הזה, או מפתח פגום.
  for (const wordOptions of [{ 'שבת_0': { 'קידומות דקדוקיות': true } }, { 'נר': { 'קידומות דקדוקיות': true } }]) {
    const mismatch = fromOtzaria({ wordOptions });
    assert.equal(mismatch.query.mode, 'simple');
    assert.equal(mismatch.approximate, true);
  }
  assert.equal(fromOtzaria({ mode: 'advanced', alternativeWords: { 5: ['אור'] } }).query.mode, 'simple');
});

test('fromOtzariaSearch: שאילתה ארוכה מ-300 תווים מאבדת חלופות מהסוף, עד שהיא נכנסת', () => {
  const words = ['אאאאאאאא', 'בבבבבבבב', 'גגגגגגגג', 'דדדדדדדד', 'הההההההה', 'וווווווו', 'זזזזזזזז', 'חחחחחחחח'];
  const alternatives = Object.fromEntries(
    words.map((word, i) => [i, ['ט', 'י', 'כ', 'ל', 'מ'].map((letter) => letter.repeat(8) + word.slice(0, 1))]),
  );
  const mapped = fromOtzaria({ query: words.join(' '), mode: 'advanced', alternativeWords: alternatives });
  assert.ok(buildQuery(mapped.query).length <= Advanced.MAX_QUERY_LENGTH);
  assert.equal(validate(mapped.query), null);
  assert.equal(mapped.approximate, true);
  assert.ok(mapped.missing.length > 0);
});
