// מראה של בדיקת העיצוב של אוצריא (`_checkDesignCompliance` ב-
// lib/plugins/services/plugin_extended_validator.dart). החנות דוחה פרסום
// (HTTP 400) על הפרות שהאריזה מציגה רק כ-notice, ולכן הן נתפסות כאן.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/** כמו הבודק: בלי הערות ובלי הגדרות משתנים (שם מותרים ערכים קבועים). */
const stripped = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--[a-zA-Z_][\w-]*\s*:\s*[^;}]+;?/g, '');

/** הסלקטור של הכלל שבו נמצא [index]. */
function selectorAt(text, index) {
  const open = text.lastIndexOf('{', index);
  const before = text.slice(0, open);
  const start = Math.max(before.lastIndexOf('}'), before.lastIndexOf(';')) + 1;
  return before.slice(start).trim();
}

test('html: dir="rtl" ו-lang="he"', () => {
  const tag = html.match(/<html\b([^>]*)>/i)[1];
  assert.match(tag, /\bdir\s*=\s*["']rtl["']/i);
  assert.match(tag, /\blang\s*=\s*["']he["']/i);
});

test('אין צבעי hex מחוץ להגדרות משתנים (כולל סלקטור שנראה כ-hex)', () => {
  assert.deepEqual(stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
});

test('אין rgb()/hsl()', () => {
  assert.equal(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i.test(stripped), false);
});

test('אין שמות צבעים באנגלית בתכונות צבע', () => {
  const named =
    /\b(black|white|red|green|blue|yellow|gray|grey|purple|orange|pink|brown|cyan|magenta|silver|gold|maroon|navy|teal|olive|aqua|fuchsia|lime|violet|indigo|coral|crimson|salmon|khaki|beige|ivory|wheat|tan|chocolate|tomato|turquoise|orchid)\b/i;
  const prop =
    /(?:^|[\s;{])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?|fill|stroke)\s*:\s*([^;}]+)/gi;
  for (const match of stripped.matchAll(prop)) {
    const value = match[2].trim();
    if (/var\s*\(/.test(value)) continue;
    assert.equal(named.test(value), false, `${match[1]}: ${value}`);
  }
});

test('font-family רק דרך var(--font-*)', () => {
  for (const match of stripped.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    assert.match(match[1], /var\s*\(\s*--font/i, match[1]);
  }
});

test('font-size ב-px רק בפס הכותרת', () => {
  for (const match of stripped.matchAll(/font-size\s*:\s*([^;}]+)/gi)) {
    const value = match[1].trim();
    if (/var\s*\(/.test(value) || /^\d+(?:\.\d+)?\s*(?:em|rem|%)$/i.test(value)) continue;
    const selector = selectorAt(stripped, match.index);
    assert.match(selector, /top-?bar/i, `${selector} { font-size: ${value} }`);
  }
});

test('border-radius רק דרך var() או %', () => {
  for (const match of stripped.matchAll(/border-radius\s*:\s*([^;}]+)/gi)) {
    const value = match[1].trim();
    if (/var\s*\(/.test(value) || /^\d+(?:\.\d+)?\s*%$/.test(value) || /^0(?:px)?$/.test(value)) {
      continue;
    }
    assert.fail(`border-radius: ${value}`);
  }
});

test('שימוש ב-var(--color-*)', () => {
  assert.match(css, /var\s*\(\s*--color-/);
});

test('ה-CSS לא משתמש בסלקטורי מזהה בכלל', () => {
  assert.equal(/(^|[\s,>+~}])#[\w-]+/m.test(stripped), false);
});
