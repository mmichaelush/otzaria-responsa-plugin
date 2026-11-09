// העברת חיפוש בין אוצריא לתוסף (Otzaria/otzaria#3067 מאוצריא 0.9.98.1: היקף
// ושלילה; #3068 מאוצריא 0.9.98.3: כפתור בתוצאות).
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

test('scopeSettings: היקף ושלילה, בלי order, limit ו-grouping', () => {
  assert.deepEqual(Handoff.scopeSettings(request), {
    facets: ['/הלכה'],
    baseBooksOnly: true,
    negativeQuery: 'גוי',
    negativeOptions: { 'קידומות דקדוקיות': true },
    alternativeWords: { 0: ['שבתות'] },
    customSpacing: { 0: '0-1' },
  });
});

test('scopeSettings: כל הספרייה ובלי שלילה — כלום; אפשרויות שלילה בלי שאילתה — לא', () => {
  assert.deepEqual(Handoff.scopeSettings({ query: 'שבת', facets: ['/'], categories: [], negativeQuery: '' }), {});
  assert.deepEqual(Handoff.scopeSettings({ query: 'שבת', negativeQuery: ' ', negativeOptions: { a: true } }), {});
  assert.deepEqual(Handoff.scopeSettings(null), {});
});

test('scopeSettings: מילים בכל סדר (anyOrder, מאוצריא 0.9.98.1)', () => {
  assert.deepEqual(Handoff.scopeSettings({ query: 'נר שבת', anyOrder: true }), { anyOrder: true });
  assert.deepEqual(Handoff.scopeSettings({ query: 'נר שבת', anyOrder: false }), {});
});

test('otzariaSearchFrom מוסיף את ההיקף והשלילה', () => {
  const { Advanced } = require('./helpers/load.js').loadPlugin();
  const target = Advanced.otzariaSearchFrom({ query: 'שבת', mode: 'advanced', facets: ['/הלכה'], negativeQuery: 'גוי' });
  assert.deepEqual(target.settings.facets, ['/הלכה']);
  assert.equal(target.settings.negativeQuery, 'גוי');
  assert.equal(target.settings.mode, 'advanced');
});

test('searchDialogItem: resultsAction רק כשהמתג דלוק', () => {
  const item = { id: 'x', openPluginOnSubmit: true };
  assert.deepEqual(Handoff.searchDialogItem(item, false), item);
  assert.deepEqual(Handoff.searchDialogItem(item, true), { ...item, resultsAction: Handoff.RESULTS_ACTION_TITLE });
  assert.ok(Handoff.RESULTS_ACTION_TITLE.length <= 120);
});

test('המתג והמניפסט יחד: resultsAction דורש את הגרסה שהוולידטור של אוצריא מכיר', () => {
  const item = manifest.contributes.startup.searchDialogItems.find((entry) => entry.id === Handoff.SEARCH_DIALOG_ITEM_ID);
  assert.ok(item, 'שורת הדיאלוג חסרה');
  assert.equal(Handoff.RESULTS_ACTION_ENABLED, true);
  const parts = (value) => String(value).split('.').map(Number);
  const wanted = parts(Handoff.MIN_APP_VERSION);
  const actual = parts(manifest.minAppVersion);
  const atLeast = actual.every((n, i) => n > (wanted[i] || 0)) ||
    (() => {
      for (let i = 0; i < Math.max(actual.length, wanted.length); i++) {
        if ((actual[i] || 0) !== (wanted[i] || 0)) return (actual[i] || 0) > (wanted[i] || 0);
      }
      return true;
    })();
  assert.ok(atLeast, 'minAppVersion חייב להיות ' + Handoff.MIN_APP_VERSION + ' לפחות');
  assert.equal(item.resultsAction, Handoff.RESULTS_ACTION_TITLE);
  assert.equal(item.openPluginOnSubmit, true);
});
