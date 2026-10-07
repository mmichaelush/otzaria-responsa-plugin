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

// הוולידטור הרשמי חוסם תיאור ארוך מזה, ושם זה מתגלה רק ב-CI.
test('תיאור קצר: עד 150 תווים', () => {
  assert.ok(manifest.description.length <= 150, String(manifest.description.length));
});

/** הנתיבים שהשירות מכיר (http_api.dart): פעולה לנתיב אחר הייתה נכשלת בשקט. */
const routes = new Set(
  [...read('..', 'helper', 'lib', 'src', 'server', 'http_api.dart').matchAll(/'(\/[a-z/]+)': _service\./g)].map(
    (m) => m[1],
  ),
);

/** התנאים ב-`when`, כ-`{ key: {operator: value} }`. */
function conditions(when) {
  const leaves = when.all || [when];
  return Object.fromEntries(
    leaves.map((leaf) => {
      const { key, ...operator } = leaf.storage;
      return [key, operator];
    }),
  );
}

/**
 * פעולה של אוצריא לשירות (`localService.post`): לפורט שהדף שמר, לנתיב שהשירות
 * מכיר, עם `notify` כדי שההודעה תהיה משפט שלם, ומוצגת רק אחרי ההבהרה.
 */
function assertServiceAction(contribution, path) {
  const action = contribution.action || contribution.openAction;
  assert.equal(action.type, 'localService.post');
  assert.deepEqual(action.args.port, { $storage: Settings.KEYS.servicePort });
  assert.equal(action.args.path, path);
  assert.ok(routes.has(path), 'השירות מכיר את ' + path);
  assert.equal(action.args.body.notify, true);
  // הגדרת "הפעלת בר אילן" עוברת גם בלי התוסף; מפתח שלא נשמר = null = מפעיל.
  assert.deepEqual(action.args.body.autoStart, { $storage: Settings.KEYS.autoStart });
  assert.ok(action.args.timeoutMs >= 115000, 'פתיחה וחיפוש עשויים להפעיל את בר אילן (עד 115 שניות)');
  const when = conditions(contribution.when);
  assert.deepEqual(when[Settings.KEYS.welcomeSeen], { equals: true }, 'אחרי ההבהרה על הרישיון');
  assert.deepEqual(when[Settings.KEYS.servicePort], { exists: true }, 'רק כשיש פורט');
}

test('פריט התפריט, הקיצור שלו והמתג שמסתיר אותו מתאימים לקוד', () => {
  const item = startup.contextMenuItems.find((i) => i.id === Domain.CONTEXT_MENU_ITEM);
  assert.ok(item, 'פריט "חיפוש בבר אילן" במניפסט');
  assert.deepEqual(conditions(item.when)[Settings.KEYS.contextMenu], { notEquals: false }, 'בלי ערך שמור — מוצג');
  assertServiceAction(item, '/text/search');
  // "חלון ניהול הצורות": מההגדרה; בלי ערך (null) השירות מכבה אותו.
  assert.deepEqual(item.action.args.body.showForms, { $storage: Settings.KEYS.showForms });
  assert.deepEqual(item.action.args.body.q, { $selection: 'selectedText' });
  const shortcut = startup.shortcuts.find((s) => s.contextMenuItemId === Domain.CONTEXT_MENU_ITEM);
  assert.ok(shortcut && shortcut.key, 'יש קיצור מקלדת לחיפוש');
});

test('הפקודות של קיצורי המקלדת הן אלה שהבקר מכיר, והקיצורים שונים זה מזה', () => {
  const commands = startup.shortcuts.filter((s) => s.command).map((s) => s.command);
  assert.deepEqual(commands.sort(), Object.values(Domain.Command).sort());
  for (const command of commands) {
    assert.ok(command === Domain.Command.openPanel || Domain.COMMAND_TABS[command], command);
  }
  const keys = startup.shortcuts.map((s) => s.key).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length);
});

test('"איתור המקום בבר אילן" פותח את הלשונית, באותו מתג של הלחיצה הימנית', () => {
  const item = startup.contextMenuItems.find((i) => i.id === Domain.LOCATE_MENU_ITEM);
  assert.ok(item, 'פריט האיתור במניפסט');
  assert.equal(item.openPlugin, true);
  assert.equal(item.action, undefined, 'בוחרים בין המקורות בלשונית, ולכן לא פעולה ישירה');
  assert.equal(item.onClickEvent, undefined, 'האירוע הוא contextMenu.itemClicked');
  const when = conditions(item.when);
  assert.deepEqual(when[Settings.KEYS.contextMenu], { notEquals: false });
  assert.deepEqual(when[Settings.KEYS.welcomeSeen], { equals: true });
  // אוצריא מגבילה כל תוסף לשני פריטים עליונים בתפריט.
  assert.ok(startup.contextMenuItems.length <= 2);
});

test('שורת דיאלוג החיפוש: כבויה כברירת מחדל, ומנתבת את החיפוש לתוסף', () => {
  const [item, ...rest] = startup.searchDialogItems;
  assert.equal(rest.length, 0);
  assert.equal(item.type, 'checkbox');
  // הסימון נשמר בין חיפושים, וכשהוא מסומן אוצריא אינה מחפשת בעצמה.
  assert.equal(item.defaultValue, false);
  assert.equal(item.openPluginOnSubmit, true);
  assert.match(item.title, /במקום באוצריא/);
  assert.deepEqual(item.visibleInModes, ['exact', 'advanced'], 'אין בבר אילן חיפוש מקורב');
  const when = conditions(item.when);
  assert.deepEqual(when[Settings.KEYS.searchDialog], { notEquals: false });
  assert.deepEqual(when[Settings.KEYS.welcomeSeen], { equals: true });
  assert.ok(manifest.permissions.includes('search.dialog'));
});

test('ספק חיפוש הספרייה מתאים לקוד, ופותח דרך השירות', () => {
  const provider = startup.libraryBooks[0];
  assert.equal(provider.provider, Domain.LIBRARY_PROVIDER);
  assert.deepEqual(conditions(provider.when)[Settings.KEYS.libraryBooks], { notEquals: false });
  assertServiceAction(provider, '/book/open');
  assert.deepEqual(provider.openAction.args.body.key, { $book: 'id' });
  assert.ok(manifest.permissions.includes(Domain.LIBRARY_PERMISSION));
  assert.equal(manifest.minAppVersion, '0.9.98');
});

test('בלי מנוע רקע: לא מוצהר, ואין בקשה להפעלה ברקע', () => {
  assert.equal(manifest.contributes.background, undefined);
  assert.ok(!manifest.permissions.includes('app.run_on_startup'));
  assert.ok(!fs.existsSync(path.join(root, 'background.html')));
});

test('כל סקריפט ב-HTML קיים, והסדר מקיים את התלויות', () => {
  const scripts = [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) assert.ok(fs.existsSync(path.join(root, src)), src);
  for (const name of fs.readdirSync(path.join(root, 'js'))) {
    assert.ok(scripts.includes('js/' + name), 'נטען ב-index.html: ' + name);
  }
  const order = (name) => scripts.findIndex((src) => src.endsWith(name));
  const before = (a, b) => assert.ok(order(a) < order(b), a + ' לפני ' + b);
  before('responsa-i18n.js', 'en.js');
  before('en.js', 'responsa-domain.js');
  before('responsa-domain.js', 'responsa-advanced.js');
  before('responsa-domain.js', 'responsa-locate.js');
  before('responsa-domain.js', 'responsa-engine.js');
  before('responsa-ui.js', 'responsa-panels.js');
  before('responsa-panels.js', 'responsa-advanced-ui.js');
  before('responsa-locate.js', 'responsa-locate-ui.js');
  before('responsa-locate-ui.js', 'responsa-view.js');
  before('responsa-view.js', 'responsa-app.js');
});

test('אין בחבילה קבצי פיתוח', () => {
  const ignore = read('.otzignore');
  assert.match(ignore, /^test\/$/m);
});
