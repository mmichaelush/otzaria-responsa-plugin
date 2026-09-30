'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');
const { collectStrings } = require('./helpers/i18n-strings');

const { I18n } = loadPlugin();
const catalog = globalThis.RESPONSA_TRANSLATIONS.en;
const used = collectStrings();

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('כל מחרוזת בקוד מתורגמת לאנגלית', () => {
  const missing = [...used].filter((text) => !Object.hasOwn(catalog, text));
  assert.deepEqual(missing, []);
});

test('אין במילון מפתחות שכבר אינם בקוד', () => {
  const stale = Object.keys(catalog).filter((text) => !used.has(text));
  assert.deepEqual(stale, []);
});

test('כל תרגום שומר על המשתנים שבמקור', () => {
  for (const [source, translated] of Object.entries(catalog)) {
    assert.deepEqual(placeholders(translated), placeholders(source), source);
  }
});

test('אין תרגום ריק או זהה למקור', () => {
  for (const [source, translated] of Object.entries(catalog)) {
    assert.ok(typeof translated === 'string' && translated.trim(), source);
    assert.notEqual(translated, source, source);
  }
});

test('resolveLanguage: בחירה מפורשת גוברת, שפה בלי מילון חוזרת לעברית', () => {
  assert.equal(I18n.resolveLanguage('auto', 'en'), 'en');
  assert.equal(I18n.resolveLanguage('auto', 'en-US'), 'en');
  assert.equal(I18n.resolveLanguage('he', 'en'), 'he');
  assert.equal(I18n.resolveLanguage('en', 'he'), 'en');
  assert.equal(I18n.resolveLanguage('auto', 'fr'), 'he');
  assert.equal(I18n.resolveLanguage('auto', null), 'he');
});

test('t: תרגום, משתנים, ונפילה לעברית', () => {
  I18n.configure('en');
  try {
    assert.equal(I18n.t('הגדרות'), 'Settings');
    assert.equal(I18n.t('{count} ספרים', { count: 3 }), '3 books');
    assert.equal(I18n.t('טקסט שאין לו תרגום'), 'טקסט שאין לו תרגום');
    // מפתח מהשרשרת של Object.prototype אינו פונקציה שמוחזרת כטקסט.
    assert.equal(I18n.t('constructor'), 'constructor');
    assert.equal(I18n.locale(), 'en');
    assert.equal(I18n.directionFor(I18n.language), 'ltr');
  } finally {
    I18n.configure('he');
  }
  assert.equal(I18n.t('הגדרות'), 'הגדרות');
  assert.equal(I18n.locale(), 'he-IL');
});

test('configure מודיע למאזינים רק כשהשפה השתנתה', () => {
  const heard = [];
  const off = I18n.onChange((language) => heard.push(language));
  try {
    assert.equal(I18n.configure('he'), false);
    assert.equal(I18n.configure('en'), true);
    assert.equal(I18n.configure('he'), true);
  } finally {
    off();
  }
  assert.deepEqual(heard, ['en', 'he']);
});
