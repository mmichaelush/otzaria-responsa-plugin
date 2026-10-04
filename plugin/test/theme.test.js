'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Theme = require('../js/responsa-theme.js');

/** מסמך מינימלי: רק המשתנים על `documentElement.style`. */
function fakeDocument() {
  const props = new Map();
  return {
    props,
    documentElement: {
      dataset: {},
      style: {
        setProperty: (name, value) => props.set(name, value),
        removeProperty: (name) => props.delete(name),
      },
    },
  };
}

const theme = (uiFontFamily) => ({
  mode: 'dark',
  colorScheme: { primary: '#123456', surfaceContainerHigh: '#abcdef', bad: 7 },
  typography: uiFontFamily ? { uiFontFamily } : {},
});

test('applyTheme: תפקידי צבע כמשתנים, מצב כהה, וגופן הממשק של אוצריא', () => {
  const doc = fakeDocument();
  Theme.applyAppearance({ font: '', scale: 1 }, doc);
  assert.equal(Theme.applyTheme(theme('Rubik'), doc), true);
  assert.equal(doc.props.get('--color-primary'), '#123456');
  assert.equal(doc.props.get('--color-surface-container-high'), '#abcdef');
  assert.equal(doc.props.has('--color-bad'), false);
  assert.equal(doc.documentElement.dataset.mode, 'dark');
  assert.equal(doc.props.get('--font-ui'), "'Rubik', system-ui, sans-serif");
  assert.equal(doc.props.get('--font-host'), "'Rubik', system-ui, sans-serif");
  assert.equal(Theme.applyTheme(null, doc), false);
});

test('applyAppearance: הגופן שנבחר גובר על אוצריא, גם אחרי theme.changed', () => {
  const doc = fakeDocument();
  Theme.applyTheme(theme('Rubik'), doc);
  Theme.applyAppearance({ font: 'Shofar', scale: 1.3 }, doc);
  assert.equal(doc.props.get('--font-ui'), "'Shofar', system-ui, sans-serif");
  assert.equal(doc.props.get('--ui-scale'), '1.3');
  Theme.applyTheme(theme('Tinos'), doc);
  assert.equal(doc.props.get('--font-ui'), "'Shofar', system-ui, sans-serif");
  // האריח "כמו באוצריא" נשאר בגופן של אוצריא.
  assert.equal(doc.props.get('--font-host'), "'Tinos', system-ui, sans-serif");
  Theme.applyAppearance({ font: 'KeterYG', scale: 1 }, doc);
  assert.equal(doc.props.get('--font-ui'), "'KeterYG', 'David', serif");
  // "כמו באוצריא": חוזר לגופן האחרון שאוצריא שלחה.
  Theme.applyAppearance({ font: '', scale: 1 }, doc);
  assert.equal(doc.props.get('--font-ui'), "'Tinos', system-ui, sans-serif");
  assert.equal(doc.props.get('--ui-scale'), '1');
});

test('applyAppearance: ערך פגום — גודל רגיל, ומרכאות לא שוברות את ה-CSS', () => {
  const doc = fakeDocument();
  Theme.applyAppearance({ font: "a'b\"c\\", scale: -2 }, doc);
  assert.equal(doc.props.get('--ui-scale'), '1');
  assert.equal(doc.props.get('--font-ui'), "'abc', 'David', serif");
  Theme.applyAppearance(null, doc);
  assert.equal(doc.props.get('--ui-scale'), '1');
});
