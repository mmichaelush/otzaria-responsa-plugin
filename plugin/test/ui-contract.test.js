// חוזה סטטי בין הקוד שבונה את ה-DOM לבין style.css: מחלקה בלי עיצוב היא
// רכיב שנראה שבור, ועיצוב בלי מחלקה הוא קוד מת שמטעה את הקורא הבא.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const css = read('css', 'style.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('index.html');
const scripts = fs
  .readdirSync(path.join(root, 'js'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => read('js', name))
  .join('\n')
  // דוגמאות בהערות אינן שימוש.
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** מחלקות שמשמשות רק כווי לקוד (querySelector), ואין להן עיצוב משלהן. */
const HOOKS = new Set(['help-toggle', 'settings-toggle', 'live-region', 'banner-host', 'notice-host', 'activity-host', 'results-host', 'help-guide', 'help-faq', 'help-status', 'help-about', 'tab-label']);

function classesUsed() {
  const used = new Set();
  const add = (list) => list.split(/\s+/).filter(Boolean).forEach((name) => used.add(name));
  for (const m of html.matchAll(/class="([^"]+)"/g)) add(m[1]);
  for (const m of scripts.matchAll(/class:\s*'([^']+)'/g)) add(m[1]);
  // מחלקת מצב שמצורפת בתנאי: `' is-error'`.
  for (const m of scripts.matchAll(/' (is-[a-z-]+)'/g)) add(m[1]);
  for (const m of scripts.matchAll(/classList\.toggle\('([^']+)'/g)) add(m[1]);
  // השם השני של `icon(name, 'class')` / `className: 'x'`.
  for (const m of scripts.matchAll(/icon\([^()]*?,\s*'([a-z-]+)'\)/g)) add(m[1]);
  for (const m of scripts.matchAll(/className:\s*'([a-z-]+)'/g)) add(m[1]);
  // אלמנטים של SVG (האייקונים) מקבלים מחלקה ב-setAttribute.
  for (const m of scripts.matchAll(/setAttribute\('class', '([a-z-]+)'\)/g)) add(m[1]);
  for (const kind of ['filled', 'tonal', 'outlined', 'text']) used.add('button-' + kind);
  used.add('button');
  used.add('icon');
  // `'button button-' + kind`: הקידומת אינה מחלקה בפני עצמה.
  for (const name of used) if (name.endsWith('-')) used.delete(name);
  return used;
}

function classesStyled() {
  return new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((m) => m[1]));
}

test('כל מחלקה שהקוד משתמש בה מעוצבת', () => {
  const styled = classesStyled();
  const missing = [...classesUsed()].filter((name) => !styled.has(name) && !HOOKS.has(name));
  assert.deepEqual(missing, []);
});

test('אין ב-style.css מחלקות שאף רכיב אינו משתמש בהן', () => {
  const used = classesUsed();
  const orphans = [...classesStyled()].filter((name) => !used.has(name));
  assert.deepEqual(orphans, []);
});

test('כל אייקון שהקוד מבקש קיים בקובץ האייקונים', () => {
  const available = new Set(
    [...read('js', 'responsa-icons.js').matchAll(/^ {4}([a-z0-9_]+): \{ path/gm)].map((m) => m[1]),
  );
  const requested = new Set(
    [...scripts.matchAll(/'([a-z0-9_]+_24_regular)'/g)].map((m) => m[1]),
  );
  // השם במניפסט הוא של אוצריא, לא של הדף; וכך גם יעדי PREFERRED, שמגיעים
  // רק מהגופן של האוצריא המותקנת ויש להם תמיד אייקון חלופי בקובץ.
  const hostOnly = new Set(Object.values(require('../js/responsa-icons.js').PREFERRED));
  const missing = [...requested].filter((name) => !available.has(name) && !hostOnly.has(name));
  assert.deepEqual(missing, []);
});

test('לכל כפתור אייקון יש תווית נגישה', () => {
  for (const m of scripts.matchAll(/iconButton\('([^']+)',\s*([^,]+),/g)) {
    assert.ok(m[2].trim() !== "''", m[0]);
  }
  assert.match(scripts, /'aria-label': label/);
});
