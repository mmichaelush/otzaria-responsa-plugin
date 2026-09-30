// מה שהמניפסט, הקוד, השירות וה-HTML חייבים להסכים עליו. כל אחד מהם נכתב
// במקום אחר, ושגיאה ביניהם שקטה: פריט תפריט שלא מגיע, מתג שלא מסתיר.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPlugin } = require('./helpers/load');

const { Domain, Settings } = loadPlugin();
const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const startup = manifest.contributes.startup;

test('גרסת התוסף זהה לגרסת השירות (AGENTS.md)', () => {
  const service = read('..', 'helper', 'lib', 'src', 'server', 'helper_service.dart');
  const version = service.match(/serverVersion = '([^']+)'/)[1];
  assert.equal(manifest.version, version);
});

test('פריט התפריט, הקיצור שלו והמתג שמסתיר אותו מתאימים לקוד', () => {
  const item = startup.contextMenuItems.find((i) => i.id === Domain.CONTEXT_MENU_ITEM);
  assert.ok(item, 'פריט "חיפוש בבר אילן" במניפסט');
  assert.equal(item.when.storage.key, Settings.KEYS.contextMenu);
  assert.equal(item.when.storage.notEquals, false, 'בלי ערך שמור — הפריט מוצג');
  assert.equal(item.openPlugin, undefined, 'בלי openPlugin: עם ההרשאה, מנוע הרקע מטפל');
  const shortcut = startup.shortcuts.find((s) => s.contextMenuItemId === Domain.CONTEXT_MENU_ITEM);
  assert.ok(shortcut && shortcut.key, 'יש קיצור מקלדת לחיפוש');
});

test('הפקודה של קיצור המקלדת היא זו שהמנוע מכיר', () => {
  const commands = startup.shortcuts.filter((s) => s.command).map((s) => s.command);
  assert.deepEqual(commands, [Domain.Command.openPanel]);
});

test('ספק חיפוש הספרייה, כשמוצהר, מתאים לקוד', () => {
  if (!startup.libraryBooks) return;
  const provider = startup.libraryBooks[0];
  assert.equal(provider.provider, Domain.LIBRARY_PROVIDER);
  assert.equal(provider.when.storage.key, Settings.KEYS.libraryBooks);
  assert.ok(manifest.permissions.includes(Domain.LIBRARY_PERMISSION));
  assert.equal(manifest.minAppVersion, '0.9.98');
});

test('כל סקריפט ב-HTML קיים, והסדר מקיים את התלויות', () => {
  for (const page of ['index.html', 'background.html']) {
    const scripts = [...read(page).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    for (const src of scripts) assert.ok(fs.existsSync(path.join(root, src)), page + ': ' + src);
    const order = (name) => scripts.findIndex((src) => src.endsWith(name));
    assert.ok(order('responsa-i18n.js') < order('en.js'), page);
    assert.ok(order('en.js') < order('responsa-domain.js'), page);
    assert.ok(order('responsa-domain.js') < order('responsa-engine.js'), page);
  }
  assert.ok(fs.existsSync(path.join(root, manifest.contributes.background.entrypoint)));
});

test('אין בחבילה קבצי פיתוח', () => {
  const ignore = read('.otzignore');
  assert.match(ignore, /^test\/$/m);
});
