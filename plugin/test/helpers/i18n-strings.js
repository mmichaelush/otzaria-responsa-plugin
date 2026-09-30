// אוסף את כל המחרוזות שעוברות תרגום: ליטרל שהוא הארגומנט הראשון של `t(`,
// `I18n.t(` או `N(` (סימון לתרגום מאוחר), כולל שרשור `'א' + 'ב'`. כך בדיקת
// המילון יודעת מה חסר בו, ומה בו כבר אינו בשימוש.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const JS_DIR = path.join(__dirname, '..', '..', 'js');

/** ליטרל בגרש יחיד או כפול, עם תווים מוברחים. */
const LITERAL = String.raw`'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"`;
const CALL = new RegExp(
  String.raw`(?:^|[^\w.])(?:I18n\.)?(?:t|N)\(\s*((?:${LITERAL})(?:\s*\+\s*(?:${LITERAL}))*)\s*[,)]`,
  'g',
);

function unquote(literal) {
  // הליטרלים שלנו לא מכילים רצפים מיוחדים מלבד גרש וגרשיים מוברחים.
  return literal.slice(1, -1).replace(/\\(['"\\])/g, '$1');
}

function stringsIn(source) {
  const found = [];
  for (const match of source.matchAll(CALL)) {
    const parts = match[1].match(new RegExp(LITERAL, 'g'));
    found.push(parts.map(unquote).join(''));
  }
  return found;
}

/** כל המחרוזות לתרגום בקבצי js/, בלי כפילויות. */
function collectStrings() {
  const strings = new Set();
  for (const name of fs.readdirSync(JS_DIR)) {
    if (!name.endsWith('.js')) continue;
    for (const text of stringsIn(fs.readFileSync(path.join(JS_DIR, name), 'utf8'))) {
      strings.add(text);
    }
  }
  return strings;
}

module.exports = { collectStrings, stringsIn };
