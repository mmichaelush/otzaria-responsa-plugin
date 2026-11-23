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
  // "כמו באוצריא" בתפריט נשאר בגופן של אוצריא.
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

// מאוצריא 0.9.99 (DESIGN_GUIDE): `surfaces`, `radius`, `density` ו-`uiFont`.
// מארח ישן אינו שולח אותם, ואז נשארות ברירות המחדל ב-CSS.
const fullTheme = (extra) => ({
  mode: 'light',
  colorScheme: { primary: '#123456' },
  typography: { uiFontFamily: 'Rubik' },
  ...extra,
});

test('applyTheme: משטחים מהמארח הם רקע הלשונית, הכרטיסים והפס העליון', () => {
  const doc = fakeDocument();
  Theme.applyTheme(
    fullTheme({ surfaces: { reader: '#111111', panel: '#222222', card: '#333333', topBar: '#444444' } }),
    doc,
  );
  assert.equal(doc.props.get('--page-surface'), '#222222');
  assert.equal(doc.props.get('--card-surface'), '#333333');
  assert.equal(doc.props.get('--topbar-surface'), '#444444');
});

test('applyTheme: מארח בלי משטחים משאיר את חישוב ה-CSS, ומסיר משטחים קודמים', () => {
  const doc = fakeDocument();
  Theme.applyTheme(fullTheme({}), doc);
  for (const name of ['--page-surface', '--card-surface', '--topbar-surface']) {
    assert.equal(doc.props.has(name), false, name);
  }
  Theme.applyTheme(fullTheme({ surfaces: { panel: '#222222', card: '#333333', topBar: '#444444' } }), doc);
  Theme.applyTheme(fullTheme({}), doc);
  assert.equal(doc.props.has('--page-surface'), false);
});

test('applyTheme: משטח פגום (לא טקסט, או עם תווים שוברי CSS) מתעלמים ממנו', () => {
  const doc = fakeDocument();
  Theme.applyTheme(
    fullTheme({ surfaces: { panel: 5, card: 'red;} body{display:none', topBar: '#444444' } }),
    doc,
  );
  assert.equal(doc.props.has('--page-surface'), false);
  assert.equal(doc.props.has('--card-surface'), false);
  assert.equal(doc.props.get('--topbar-surface'), '#444444');
});

test('applyTheme: רדיוס אחד של אוצריא לכל הרכיבים, ורק ערך סביר', () => {
  const doc = fakeDocument();
  Theme.applyTheme(fullTheme({ radius: 8 }), doc);
  assert.equal(doc.props.get('--radius-sm'), '8px');
  assert.equal(doc.props.get('--radius-panel'), '8px');
  Theme.applyTheme(fullTheme({ radius: 12 }), doc);
  assert.equal(doc.props.get('--radius-sm'), '12px');
  for (const bad of [-1, 'x', NaN, 999, null]) {
    const other = fakeDocument();
    Theme.applyTheme(fullTheme({ radius: bad }), other);
    assert.equal(other.props.has('--radius-sm'), false, String(bad));
  }
});

test('applyTheme: גובה הפס העליון מצפיפות הממשק', () => {
  const doc = fakeDocument();
  Theme.applyTheme(fullTheme({ density: { compact: true, topBarHeight: 48, fieldHeight: 40 } }), doc);
  assert.equal(doc.props.get('--topbar-height'), '48px');
  const bad = fakeDocument();
  Theme.applyTheme(fullTheme({ density: { topBarHeight: 5000 } }), bad);
  assert.equal(bad.props.has('--topbar-height'), false);
  const none = fakeDocument();
  Theme.applyTheme(fullTheme({}), none);
  assert.equal(none.props.has('--topbar-height'), false);
});

test('applyTheme: גופן הממשק המלא של אוצריא (uiFont) גובר על uiFontFamily', () => {
  const stack = "'Segoe UI', 'Noto Sans Hebrew', system-ui, sans-serif";
  const doc = fakeDocument();
  Theme.applyAppearance({ font: '', scale: 1 }, doc);
  Theme.applyTheme(fullTheme({ typography: { uiFontFamily: 'Rubik', uiFont: stack } }), doc);
  assert.equal(doc.props.get('--font-host'), stack);
  assert.equal(doc.props.get('--font-ui'), stack, 'כמו באוצריא');
  // גופן שנבחר בתוסף עדיין גובר.
  Theme.applyAppearance({ font: 'Shofar', scale: 1 }, doc);
  assert.equal(doc.props.get('--font-ui'), "'Shofar', system-ui, sans-serif");
  assert.equal(doc.props.get('--font-host'), stack);
});

test('applyTheme: uiFont פגום או חסר — חוזרים ל-uiFontFamily', () => {
  const doc = fakeDocument();
  Theme.applyAppearance({ font: '', scale: 1 }, doc);
  Theme.applyTheme(fullTheme({ typography: { uiFontFamily: 'Rubik', uiFont: 'x;} body{' } }), doc);
  assert.equal(doc.props.get('--font-host'), "'Rubik', system-ui, sans-serif");
  Theme.applyTheme(fullTheme({ typography: { uiFontFamily: 'Rubik' } }), doc);
  assert.equal(doc.props.get('--font-host'), "'Rubik', system-ui, sans-serif");
});
