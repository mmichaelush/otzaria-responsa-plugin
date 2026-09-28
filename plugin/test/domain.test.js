'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPlugin } = require('./helpers/load');

const { Domain } = loadPlugin();
const { Screen } = Domain;

const health = { ok: true, service: 'otzaria-responsa', apiVersion: 1 };
const catalogReady = { exists: true, bookCount: 8402, matchesInstallation: true };
const status = (overrides) =>
  Object.assign(
    { installed: true, catalog: { exists: false, bookCount: 0 }, build: { state: 'idle' } },
    overrides,
  );

test('screenFor: פלטפורמה שאינה Windows', () => {
  assert.equal(Domain.screenFor({ platform: 'linux' }), Screen.unsupported);
});

test('screenFor: אין שירות מאזין', () => {
  assert.equal(
    Domain.screenFor({ platform: 'windows', failure: { code: 'serviceUnavailable' } }),
    Screen.serviceMissing,
  );
});

test('screenFor: תוכנה אחרת בפורט, ושירות בגרסה אחרת', () => {
  assert.equal(
    Domain.screenFor({ health: { service: 'other' }, status: null }),
    Screen.portTaken,
  );
  assert.equal(
    Domain.screenFor({ health: { service: 'otzaria-responsa', apiVersion: 2 } }),
    Screen.serviceOutdated,
  );
});

test('screenFor: בר אילן לא מותקן', () => {
  assert.equal(
    Domain.screenFor({ health, status: status({ installed: false }) }),
    Screen.notInstalled,
  );
});

test('screenFor: צריך קטלוג, בונה, נכשל', () => {
  assert.equal(Domain.screenFor({ health, status: status() }), Screen.needsCatalog);
  assert.equal(
    Domain.screenFor({ health, status: status({ build: { state: 'running' } }) }),
    Screen.building,
  );
  assert.equal(
    Domain.screenFor({ health, status: status({ build: { state: 'failed' } }) }),
    Screen.buildFailed,
  );
});

test('screenFor: קטלוג קיים נשאר שמיש גם בזמן בנייה מחדש', () => {
  assert.equal(
    Domain.screenFor({
      health,
      status: status({ catalog: catalogReady, build: { state: 'running' } }),
    }),
    Screen.ready,
  );
});

test('screenFor: קטלוג קיים גם כשבר אילן הוסר (רק הפתיחה תיכשל)', () => {
  assert.equal(
    Domain.screenFor({ health, status: status({ installed: false, catalog: catalogReady }) }),
    Screen.ready,
  );
});

test('catalogNotice', () => {
  assert.equal(Domain.catalogNotice(status({ catalog: catalogReady })), null);
  assert.equal(
    Domain.catalogNotice(
      status({ catalog: Object.assign({}, catalogReady, { matchesInstallation: false }) }),
    ).kind,
    'otherInstallation',
  );
  assert.equal(
    Domain.catalogNotice(status({ catalog: Object.assign({}, catalogReady, { outdated: true }) }))
      .kind,
    'outdated',
  );
  assert.equal(Domain.catalogNotice(status()), null);
});

test('buildProgress: עם מכנה', () => {
  const p = Domain.buildProgress(
    { stage: 'scanning', scanned: 625944, expected: 1251889 },
    150000,
  );
  assert.equal(p.percent, 50);
  assert.match(p.detail, /מתוך כ-/);
  assert.equal(p.remaining, 'נותרו כ-3 דקות');
});

test('buildProgress: לעולם לא 100% לפני הסיום', () => {
  const p = Domain.buildProgress({ stage: 'scanning', scanned: 2000000, expected: 1000 }, 1000);
  assert.equal(p.percent, 98);
});

test('buildProgress: בלי מכנה אין אחוז, רק חלקים', () => {
  const p = Domain.buildProgress(
    { stage: 'scanning', scanned: 1000, sectionsDone: 3, sectionsTotal: 20 },
    60000,
  );
  assert.equal(p.fraction, null);
  assert.equal(p.remaining, '');
  assert.match(p.detail, /חלק 3 מתוך 20/);
});

test('buildProgress: התחלה ומיון', () => {
  assert.equal(Domain.buildProgress(null, 0).fraction, null);
  assert.equal(Domain.buildProgress({ stage: 'classifying', scanned: 10 }, 1).percent, 99);
});

test('remainingLabel', () => {
  assert.equal(Domain.remainingLabel(0.01, 60000), '');
  assert.equal(Domain.remainingLabel(0.9, 60000), 'פחות מדקה');
  assert.equal(Domain.remainingLabel(0.5, 60000), 'נותרה כדקה');
});

test('bookMeta ו-bookContext', () => {
  assert.equal(
    Domain.bookMeta({ author: 'ר\' שמואל', pubPlace: '', pubDate: 'תש"מ' }),
    'ר\' שמואל · תש"מ',
  );
  assert.equal(Domain.bookMeta({}), '');
  assert.equal(Domain.bookContext({ contextPath: 'א/ב/ג' }), 'א › ב › ג');
  assert.equal(Domain.bookContext({ contextPath: '' }), '');
});

test('booksLabel', () => {
  assert.equal(Domain.booksLabel(1), 'ספר אחד');
  assert.equal(Domain.booksLabel(8402), '8,402 ספרים');
});

test('errorAdvice', () => {
  assert.deepEqual(Domain.errorAdvice('catalogMissing'), { refresh: true, rebuild: false });
  assert.deepEqual(Domain.errorAdvice('referenceNotFound'), { refresh: false, rebuild: true });
  assert.deepEqual(Domain.errorAdvice('wrongBook'), { refresh: false, rebuild: false });
});

test('formatBuiltAt', () => {
  assert.equal(Domain.formatBuiltAt(''), '');
  assert.equal(Domain.formatBuiltAt('not a date'), '');
  assert.match(Domain.formatBuiltAt('2026-09-28T19:13:04'), /2026/);
});
