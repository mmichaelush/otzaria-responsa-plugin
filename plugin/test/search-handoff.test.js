// העברת חיפוש בין אוצריא לתוסף (Otzaria/otzaria#3067, #3068, אוצריא 0.9.99).
// כבוי עד שהשינויים יוצאים; הבדיקה האחרונה שומרת שהמניפסט והמתג יודלקו יחד.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Handoff = require('../js/responsa-search-handoff.js');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

const request = {
  query: 'שבת',
  mode: 'advanced',
  facets: ['/הלכה'],
  baseBooksOnly: true,
  negativeQuery: 'גוי',
  negativeOptions: { 'קידומות דקדוקיות': true },
  alternativeWords: { 0: ['שבתות'] },
  customSpacing: { 0: '0-1' },
  order: 'relevance',
  limit: 50,
  grouping: 'book',
};

test('scopeSettings: כבוי — לא נשלח כלום', () => {
  assert.deepEqual(Handoff.scopeSettings(request, false), {});
  assert.deepEqual(Handoff.scopeSettings(request), Handoff.SCOPE_ENABLED ? Handoff.scopeSettings(request, true) : {});
});

test('scopeSettings: היקף ושלילה, בלי order, limit ו-grouping', () => {
  assert.deepEqual(Handoff.scopeSettings(request, true), {
    facets: ['/הלכה'],
    baseBooksOnly: true,
    negativeQuery: 'גוי',
    negativeOptions: { 'קידומות דקדוקיות': true },
    alternativeWords: { 0: ['שבתות'] },
    customSpacing: { 0: '0-1' },
  });
});

test('scopeSettings: כל הספרייה ובלי שלילה — כלום; אפשרויות שלילה בלי שאילתה — לא', () => {
  assert.deepEqual(Handoff.scopeSettings({ query: 'שבת', facets: ['/'], categories: [], negativeQuery: '' }, true), {});
  assert.deepEqual(
    Handoff.scopeSettings({ query: 'שבת', negativeQuery: ' ', negativeOptions: { a: true } }, true),
    {},
  );
  assert.deepEqual(Handoff.scopeSettings(null, true), {});
});

test('otzariaSearchFrom מוסיף את ההיקף רק כשהמתג דלוק', () => {
  const { Advanced } = require('./helpers/load.js').loadPlugin();
  const target = Advanced.otzariaSearchFrom({ query: 'שבת', mode: 'advanced', facets: ['/הלכה'] });
  assert.deepEqual(target.settings.facets, Handoff.SCOPE_ENABLED ? ['/הלכה'] : undefined);
  assert.equal(target.settings.mode, 'advanced');
});

test('searchDialogItem: resultsAction רק כשהמתג דלוק', () => {
  const item = { id: 'x', openPluginOnSubmit: true };
  assert.deepEqual(Handoff.searchDialogItem(item, false), item);
  assert.deepEqual(Handoff.searchDialogItem(item, true), { ...item, resultsAction: Handoff.RESULTS_ACTION_TITLE });
  assert.ok(Handoff.RESULTS_ACTION_TITLE.length <= 120);
});

test('המתג והמניפסט יחד (TODO(otzaria-0.9.99))', () => {
  const item = manifest.contributes.startup.searchDialogItems.find((entry) => entry.id === Handoff.SEARCH_DIALOG_ITEM_ID);
  assert.ok(item, 'שורת הדיאלוג חסרה');
  if (!Handoff.RESULTS_ACTION_ENABLED) {
    // עד 0.9.99: אוצריא 0.9.98 דוחה שדה לא מוכר, ומשתמשיה לא יוכלו להתקין.
    assert.equal(item.resultsAction, undefined, 'resultsAction במניפסט לפני 0.9.99');
    return;
  }
  const parts = (value) => String(value).split('.').map(Number);
  const [a, b, c] = parts(manifest.minAppVersion);
  const [x, y, z] = parts(Handoff.MIN_APP_VERSION);
  assert.ok(a > x || (a === x && (b > y || (b === y && c >= z))), 'minAppVersion חייב להיות 0.9.99 לפחות');
  assert.equal(item.resultsAction, Handoff.RESULTS_ACTION_TITLE);
  assert.equal(item.openPluginOnSubmit, true);
});
