// אייקוני אוצריא מהגופן שבהתקנה: שם שקיים בגופן מצויר ממנו, וכל שאר
// השמות נשארים מהאייקונים שבתוסף.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/** DOM מינימלי: מספיק ל-createElementNS ול-document.fonts. */
function fakeDom() {
  const node = (tag) => ({
    tag,
    attributes: {},
    children: [],
    dataset: {},
    textContent: '',
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
    },
  });
  const added = [];
  return {
    added,
    document: { createElementNS: (_, tag) => node(tag), fonts: { add: (face) => added.push(face) } },
  };
}

function loadIcons(env) {
  const file = path.join(__dirname, '..', 'js', 'responsa-icons.js');
  delete require.cache[require.resolve(file)];
  Object.assign(globalThis, env);
  return require(file);
}

test('לפני הגופן: SVG מהאייקונים שבתוסף', () => {
  const dom = fakeDom();
  const Icons = loadIcons({ document: dom.document });
  const svg = Icons.icon('search_24_regular', 'extra');
  assert.equal(svg.attributes.class, 'icon extra');
  assert.equal(svg.children[0].tag, 'path');
  assert.equal(Icons.hostActive, false);
});

test('אחרי הגופן: שם משותף ושם מועדף מצוירים מהגופן, השאר מהתוסף', async () => {
  const dom = fakeDom();
  class FakeFontFace {
    constructor(family, buffer) {
      this.family = family;
      this.size = buffer.byteLength;
    }
    load() {
      return Promise.resolve(this);
    }
  }
  const Icons = loadIcons({ document: dom.document, FontFace: FakeFontFace, atob: (s) => Buffer.from(s, 'base64').toString('binary') });
  let changes = 0;
  Icons.onChange(() => changes++);
  const loaded = await Icons.useHostFont(Buffer.from('font').toString('base64'), {
    search_24_regular: 0xe02f,
    search_not_found_24_regular: 0xe033,
    junk: 'x',
  });
  assert.equal(loaded, true);
  assert.equal(changes, 1);
  assert.equal(dom.added[0].family, 'OtzariaIcons');
  assert.equal(dom.added[0].size, 4);

  const shared = Icons.icon('search_24_regular');
  assert.equal(shared.children[0].tag, 'text');
  assert.equal(shared.children[0].textContent, String.fromCodePoint(0xe02f));
  assert.equal(shared.dataset.icon, 'otzaria');
  // search_info אינו באוצריא; המועדף שלו (search_not_found) כן.
  assert.equal(Icons.icon('search_info_24_regular').children[0].textContent, String.fromCodePoint(0xe033));
  assert.equal(Icons.icon('settings_24_regular').children[0].tag, 'path');
});

test('בלי FontFace, או גופן שלא נטען: האייקונים שבתוסף נשארים', async () => {
  const dom = fakeDom();
  let Icons = loadIcons({ document: dom.document, FontFace: undefined });
  assert.equal(await Icons.useHostFont('AAAA', { search_24_regular: 1 }), false);
  class Broken {
    load() {
      return Promise.reject(new Error('bad font'));
    }
  }
  Icons = loadIcons({ document: dom.document, FontFace: Broken, atob: () => '' });
  assert.equal(await Icons.useHostFont('AAAA', { search_24_regular: 1 }), false);
  assert.equal(Icons.hostActive, false);
  assert.equal(Icons.icon('search_24_regular').children[0].tag, 'path');
});
