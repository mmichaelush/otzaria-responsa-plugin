// החיפוש בטקסט: מודל, בניית השאילתה בתחביר של בר אילן, הסבר במילים, בדיקה
// ודוגמאות. לוגיקה טהורה בלבד; הלשונית נבנית ב-responsa-advanced-ui.js.
//
// ארבעה אופנים, כמו חלונות החיפוש של בר אילן:
// - **חיפוש רגיל** — "חיפוש קל": שדה אחד, וההגדרות שלו (בלי תוספות, או עם
//   אותיות שימוש, מרחק וכתיב מלא) — כפי שבחר המשתמש בבר אילן, או מכאן;
// - **בונה** — "חיפוש מתקדם" ו"חיפוש טבלאי": מילה או ביטוי בכל שדה, חלופות,
//   איך לחפש כל מילה, ואיפה המילים צריכות להופיע זו ביחס לזו;
// - **תחביר של בר אילן** שנכתב ביד;
// - **ניסוח חופשי** — "חיפוש בניסוח חופשי": שאלה או משפט.
//
// התחביר נמדד מול "חיפוש מתקדם" של בר אילן (גרסה 25), והסימנים נבנו על ידי
// הכפתורים של בר אילן עצמו: `#נר` אותיות שימוש, `נר#` סיומות דקדוקיות, `!`
// כתיב מלא/חסר, `+` עם/בלי גרשיים, `$` ערך, `%` שורש, `^` תרגום לארמית,
// `-` שלילה, `<שם>` משפחה, `{שם}` חיפוש שמור, `(א/ב)` חלופות, `{{א ב}}`
// ביטוי (גם כחלופה), `[1:4]` עד ארבע מילים אחריה, `[-2:2]` לפניה או אחריה.
// בראש השאילתה: `10:` — כל המילים בכל סדר בטווח עשר מילים; `משפט:`,
// `פסקה:`, `מסמך:` — כולן באותו משפט, פסקה או מסמך. את אלה בונה "חיפוש
// טבלאי" של בר אילן (נקרא מ"שאילתות קודמות" שלו).
(function (root) {
  'use strict';

  const I18n = root.ResponsaI18n;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /**
   * איך לחפש מילה. רק צירופים שבר אילן מקבל: הכפתורים שלו מחליפים כל
   * מאפיין אחר ב-`+ $ % ^`, ו-`!` מתחבר רק לאותיות שימוש (`#!`; `!#` נדחה).
   */
  const FORMS = Object.freeze([
    { id: 'exact', group: N('המילה עצמה'), label: N('בדיוק כפי שנכתבה'), before: '', after: '' },
    { id: 'prefixes', group: N('תוספות דקדוקיות'), label: N('עם אותיות שימוש לפניה (הנר, ובנר)'), before: '#', after: '' },
    { id: 'suffixes', group: N('תוספות דקדוקיות'), label: N('עם סיומות (נרות, נרו)'), before: '', after: '#' },
    { id: 'affixes', group: N('תוספות דקדוקיות'), label: N('עם אותיות שימוש וסיומות (והנרות)'), before: '#', after: '#' },
    { id: 'startsWith', group: N('כל אות'), label: N('מילה שמתחילה כך'), before: '', after: '*' },
    { id: 'endsWith', group: N('כל אות'), label: N('מילה שמסתיימת כך'), before: '*', after: '' },
    { id: 'contains', group: N('כל אות'), label: N('מילה שמכילה את האותיות'), before: '*', after: '*' },
    { id: 'prefixesAny', group: N('כל אות'), label: N('אותיות שימוש לפניה, וכל סיומת'), before: '#', after: '*' },
    { id: 'spelling', group: N('כתיב'), label: N('בכתיב מלא או חסר (אהרון, אהרן)'), before: '!', after: '' },
    { id: 'spellingPrefixes', group: N('כתיב'), label: N('כתיב מלא או חסר, עם אותיות שימוש'), before: '#!', after: '' },
    { id: 'quotes', group: N('כתיב'), label: N('עם או בלי גרשיים (רמב"ם, רמבם)'), before: '+', after: '' },
    { id: 'entry', group: N('צורות'), label: N('כל צורות הערך המילוני (מדרגה, ממדרגתו)'), before: '$', after: '' },
    { id: 'root', group: N('צורות'), label: N('כל המילים מאותו שורש (שומר, שמירה)'), before: '%', after: '' },
    { id: 'aramaic', group: N('צורות'), label: N('כולל התרגום לארמית'), before: '^', after: '' },
    { id: 'family', group: N('רשימות שלי בבר אילן'), label: N('משפחת מילים שהגדרתי'), before: '<', after: '>', single: true },
    { id: 'saved', group: N('רשימות שלי בבר אילן'), label: N('חיפוש שמור'), before: '{', after: '}', single: true },
  ]);

  const FORM_BY_ID = Object.freeze(Object.fromEntries(FORMS.map((form) => [form.id, form])));

  /** המרחק בין מילה לזו שאחריה. */
  const GAPS = Object.freeze(['adjacent', 'after', 'around']);

  /**
   * איפה המילים צריכות להופיע זו ביחס לזו, כמו "מרחקים" בחיפוש הטבלאי של
   * בר אילן: `chain` — בסדר ובמרחקים שבין השדות; `words` — בכל סדר, בטווח
   * מילים; `sentence` / `paragraph` / `document` — כולן באותו משפט, פסקה
   * (הלכה, סעיף, דיבור המתחיל) או מסמך (פרק, סימן).
   */
  const Span = Object.freeze({
    chain: 'chain',
    words: 'words',
    sentence: 'sentence',
    paragraph: 'paragraph',
    document: 'document',
  });

  /** הקידומת של כל טווח, כפי שהחיפוש הטבלאי של בר אילן בונה אותה (נמדד). */
  const SPAN_PREFIX = Object.freeze({ sentence: 'משפט:', paragraph: 'פסקה:', document: 'מסמך:' });

  /**
   * "חיפוש קל" של בר אילן: `mine` — ההגדרות שהמשתמש בחר בבר אילן; `exact`
   * — "ללא תוספות"; `additions` — "עם תוספות", ואילו מהן.
   */
  const Easy = Object.freeze({ mine: 'mine', exact: 'exact', additions: 'additions' });

  const Scope = Object.freeze({ all: 'all', current: 'current', pick: 'pick' });

  const Mode = Object.freeze({ simple: 'simple', builder: 'builder', manual: 'manual', free: 'free' });

  const MAX_TERMS = 8;
  const MAX_ALTERNATIVES = 6;
  /** מילה או ביטוי בשדה. השדה עצמו אינו מקבל יותר (`maxlength`). */
  const MAX_WORD_LENGTH = 120;
  const MAX_DISTANCE = 30;
  /** כמו בשירות (`HelperService.maxScopeItems`). */
  const MAX_SCOPE_ITEMS = 40;
  /** כמו בשירות (`ResponsaAdvancedQuery.maxLength`). */
  const MAX_QUERY_LENGTH = 300;

  /** אותיות, ספרות, גרש, גרשיים ותווים כלליים בתוך מילה (`*ט(ע/י/@)ל*`). */
  const WORD = /^[א-ת0-9"'?~*@()/]+$/;
  const LETTER = /[א-ת]/;
  /** כל מה שהשירות מקבל בשאילתה. */
  const QUERY = /^[א-ת0-9"' #*!+$\-%^<>{}?~@()/[\]:]+$/;
  /** הפיסוק שנשאר במשפט של ניסוח חופשי. */
  const PUNCTUATION = /([.,;:?!()])/;

  function newTerm(word) {
    return { words: [word || ''], form: 'exact', exclude: false };
  }

  function newGap() {
    return { kind: 'adjacent', distance: 3 };
  }

  /** ברירת המחדל של "עם תוספות" היא ברירת המחדל של בר אילן. */
  function newEasy() {
    return { how: Easy.mine, prefixes: true, distance: true, spelling: false };
  }

  function emptyQuery() {
    return {
      mode: Mode.simple,
      simpleText: '',
      easy: newEasy(),
      terms: [newTerm()],
      gaps: [],
      span: Span.chain,
      within: 10,
      manualText: '',
      freeText: '',
      scope: { mode: Scope.all, items: [] },
      options: { abbreviations: false, showForms: false },
    };
  }

  function clampInt(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function text(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  /** מודל שנשמר (או פגום) ← מודל תקין. כל שדה לא מוכר חוזר לברירת המחדל. */
  function normalize(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const base = emptyQuery();
    const terms = (Array.isArray(value.terms) ? value.terms : [])
      .slice(0, MAX_TERMS)
      .map((term) => {
        const source = term && typeof term === 'object' ? term : {};
        const words = (Array.isArray(source.words) ? source.words : [])
          .slice(0, MAX_ALTERNATIVES)
          .map((word) => text(word, MAX_WORD_LENGTH));
        return {
          words: words.length ? words : [''],
          form: FORM_BY_ID[source.form] ? source.form : 'exact',
          exclude: source.exclude === true,
        };
      });
    const result = { ...base, terms: terms.length ? terms : base.terms };
    const gaps = Array.isArray(value.gaps) ? value.gaps : [];
    result.gaps = result.terms.slice(1).map((_, i) => {
      const gap = gaps[i] && typeof gaps[i] === 'object' ? gaps[i] : {};
      return {
        kind: GAPS.includes(gap.kind) ? gap.kind : 'adjacent',
        distance: clampInt(gap.distance, 1, MAX_DISTANCE, 3),
      };
    });
    // שמור לפני 0.6.0: `anyOrder: true` ← בכל סדר, בטווח מילים.
    result.span = Object.values(Span).includes(value.span)
      ? value.span
      : value.anyOrder === true
        ? Span.words
        : Span.chain;
    result.within = clampInt(value.within, 1, MAX_DISTANCE, 10);
    const easy = value.easy && typeof value.easy === 'object' ? value.easy : {};
    result.easy = {
      how: Object.values(Easy).includes(easy.how) ? easy.how : Easy.mine,
      prefixes: easy.prefixes !== false,
      distance: easy.distance !== false,
      spelling: easy.spelling === true,
    };
    result.manualText = text(value.manualText, MAX_QUERY_LENGTH);
    result.simpleText = text(value.simpleText, MAX_QUERY_LENGTH);
    result.freeText = text(value.freeText, MAX_QUERY_LENGTH);
    // שמור מגרסה 0.4: `manual: true`, או בונה שכבר מולא.
    result.mode = Object.values(Mode).includes(value.mode)
      ? value.mode
      : value.manual === true
        ? Mode.manual
        : result.terms.some((term) => wordsOf(term).length)
          ? Mode.builder
          : Mode.simple;
    const scope = value.scope && typeof value.scope === 'object' ? value.scope : {};
    result.scope = {
      mode: Object.values(Scope).includes(scope.mode) ? scope.mode : Scope.all,
      items: (Array.isArray(scope.items) ? scope.items : [])
        .filter(
          (item) =>
            item &&
            (item.type === 'category' || item.type === 'book') &&
            typeof item.name === 'string' &&
            (item.type === 'category' ? typeof item.path === 'string' && item.path : typeof item.key === 'string'),
        )
        .slice(0, MAX_SCOPE_ITEMS)
        .map((item) =>
          item.type === 'category'
            ? { type: 'category', path: text(item.path, 1000), name: text(item.name, 200) }
            : { type: 'book', key: text(item.key, 100), name: text(item.name, 200), path: text(item.path || '', 1000) },
        ),
    };
    const options = value.options && typeof value.options === 'object' ? value.options : {};
    result.options = {
      abbreviations: options.abbreviations === true,
      showForms: options.showForms === true,
    };
    return result;
  }

  function wordsOf(term) {
    return term.words.map((word) => word.trim()).filter(Boolean);
  }

  /** ביטוי של כמה מילים בשדה אחד. */
  function isPhrase(word) {
    return /\s/.test(word.trim());
  }

  /**
   * מילה או ביטוי כפי שיישלחו: ביטוי בתוך `{{ }}`, כמו "ביטוי" בחיפוש
   * הטבלאי של בר אילן. `({{צער בעלי חיים}}/צעב"ח)` נמדד: 3,974 = 2,686 +
   * 1,288; ביטוי בלי `{{ }}` בתוך חלופות נדחה.
   */
  function wordText(word) {
    const value = word.trim().replace(/\s+/g, ' ');
    return isPhrase(value) ? '{{' + value + '}}' : value;
  }

  /** מילה אחת כפי שתישלח: שלילה, ואז הסימנים לפני המילה, החלופות ואחריה. */
  function termText(term) {
    const words = wordsOf(term).map(wordText);
    if (!words.length) return '';
    const form = FORM_BY_ID[term.form] || FORM_BY_ID.exact;
    const core = words.length > 1 ? '(' + words.join('/') + ')' : words[0];
    return (term.exclude ? '-' : '') + form.before + core + form.after;
  }

  function gapText(gap) {
    if (!gap || gap.kind === 'adjacent') return ' ';
    const distance = clampInt(gap.distance, 1, MAX_DISTANCE, 3);
    return gap.kind === 'around' ? ' [-' + distance + ':' + distance + '] ' : ' [1:' + distance + '] ';
  }

  /**
   * המילים של חיפוש רגיל: אותיות עבריות, גרשיים וגרש בתוך מילה. ניקוד,
   * פיסוק וסימני החיפוש של בר אילן נמחקים, כדי שלא יפעלו כאופרטורים; מקף
   * מפריד בין מילים.
   */
  function simpleWords(value) {
    return String(value || '')
      // אות עם ניקוד בתו אחד (`שׁ`, `בּ`) ← האות וסימניה; CGJ ושאר הבלתי-נראים
      // נמחקים בלי רווח (CGJ בא בתנ"ך באמצע מילה). כמו בשירות.
      .replace(/[\uFB1D-\uFB4F]/g, (char) => char.normalize('NFKD'))
      .replace(/\u05F0/g, 'וו')
      .replace(/\u05F1/g, 'וי')
      .replace(/\u05F2/g, 'יי')
      .replace(/[\u00AD\u034F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '')
      .replace(/[\u0591-\u05C7]/g, (char) => ('\u05BE\u05C0\u05C3'.includes(char) ? ' ' : ''))
      .replace(/[\u05F4\u201C\u201D]/g, '"')
      .replace(/[\u05F3\u2018\u2019]/g, "'")
      .replace(/[^א-ת"']+/g, ' ')
      .split(' ')
      .map((word) => word.replace(/^["']+|"+$/g, ''))
      .filter((word) => LETTER.test(word));
  }

  /**
   * המשפט של ניסוח חופשי: כל מילה מנוקה כמו בחיפוש רגיל (`simpleWords`),
   * והפיסוק הבסיסי נשאר במקומו. לועזית, ספרות וסימני חיפוש נמחקים. בלי
   * מילה עברית — ריק.
   */
  function freeText(value) {
    const sentence = String(value || '')
      .split(PUNCTUATION)
      .map((part, i) => (i % 2 ? part : ' ' + simpleWords(part).join(' ') + ' '))
      .join('')
      .replace(/\s+/g, ' ')
      .replace(/ ([.,;:?!)])/g, '$1')
      .replace(/\( /g, '(')
      .trim();
    return LETTER.test(sentence) ? sentence : '';
  }

  // ------------------------------------------------------ מדיאלוג החיפוש של אוצריא

  /**
   * שמות אפשרויות המילה של אוצריא, כפי שהן מגיעות ב-`wordOptions`
   * (`SearchQueryBuilder` ו-`hebrew_query.rs` באוצריא 0.9.98).
   */
  const OTZARIA = Object.freeze({
    gramPrefixes: 'קידומות דקדוקיות',
    gramSuffixes: 'סיומות דקדוקיות',
    prefixes: 'קידומות',
    suffixes: 'סיומות',
    spelling: 'כתיב מלא/חסר',
    partial: 'חלק ממילה',
    quotes: 'התעלם מגרשיים',
    translation: 'תרגום ארמי',
    acronyms: 'ראשי תיבות',
  });

  /**
   * הצורה לפי מה שמותר לפני המילה ואחריה: '' כלום, `gram` אותיות שימוש או
   * סיומות דקדוקיות (`#`), `any` כל אות (`*`).
   */
  const AFFIX_FORMS = Object.freeze({
    '|': 'exact',
    'gram|': 'prefixes',
    '|gram': 'suffixes',
    'gram|gram': 'affixes',
    'any|': 'endsWith',
    '|any': 'startsWith',
    'any|any': 'contains',
    'gram|any': 'prefixesAny',
    // `*נר#` לא נמדד בבר אילן; "מכילה" רחבה ממנו.
    'any|gram': 'contains',
  });

  const unique = (values) => [...new Set(values)];

  /** האם ערך מהבקשה של אוצריא מבקש משהו: אוצריא שולחת גם ברירות מחדל כבויות. */
  function filled(value) {
    if (Array.isArray(value)) return value.some(filled);
    if (value && typeof value === 'object') return Object.values(value).some(filled);
    return typeof value === 'string' ? value.trim() !== '' : Boolean(value);
  }

  /**
   * אפשרויות של מילה אחת ← צורה כאן, ו-`missing`: שמות האפשרויות שלא עברו
   * במדויק. בר אילן אינו מצרף סימנים (רק `#!`), ולכן מצירוף נשארת צורה אחת.
   * "קידומות", "סיומות" ו"חלק ממילה" של אוצריא מוגבלות בכמה אותיות, ו-`*`
   * אינו מוגבל: הן עוברות, רחבות יותר.
   */
  function otzariaTerm(words, options) {
    const on = (name) => options[name] === true;
    const missing = [];
    const before = on(OTZARIA.partial) || on(OTZARIA.prefixes) ? 'any' : on(OTZARIA.gramPrefixes) ? 'gram' : '';
    const after = on(OTZARIA.partial) || on(OTZARIA.suffixes) ? 'any' : on(OTZARIA.gramSuffixes) ? 'gram' : '';
    let form = AFFIX_FORMS[before + '|' + after];
    missing.push(...[OTZARIA.partial, OTZARIA.prefixes, OTZARIA.suffixes].filter(on));
    if (on(OTZARIA.spelling)) {
      if (form === 'exact') form = 'spelling';
      else if (form === 'prefixes') form = 'spellingPrefixes';
      else missing.push(OTZARIA.spelling);
    }
    let result = words;
    // בלי גרש או גרשיים במילה, "התעלם מגרשיים" אינו משנה דבר.
    if (on(OTZARIA.quotes) && words.some((word) => /["']/.test(word))) {
      if (form === 'exact' && !on(OTZARIA.translation)) {
        form = 'quotes';
        result = unique(words.map((word) => word.replace(/["']/g, ''))).filter((word) => LETTER.test(word));
      } else missing.push(OTZARIA.quotes);
    }
    if (on(OTZARIA.translation)) {
      if (form === 'exact') form = 'aramaic';
      else missing.push(OTZARIA.translation);
    }
    // אין מקבילה: שגיאות כתיב, קידומות וסיומות ארמיות, ניקוד, טעמים.
    const known = new Set(Object.values(OTZARIA));
    missing.push(...Object.keys(options).filter((name) => on(name) && !known.has(name)));
    return { words: result, form, missing, acronyms: on(OTZARIA.acronyms) };
  }

  /**
   * ההגדרות לכל מילה (`wordOptions` לפי `"{מילה}_{מקום}"`, `alternativeWords`
   * ו-`customSpacing` לפי מקום) לפי המקומות כאן, או `null` כשהמקומות אינם
   * בטוחים. אוצריא מפצלת בעצמה: מילה שאינה בעברית היא אצלה מקום וכאן היא
   * נמחקת, ואז כל מה שאחריה היה עובר למילה הלא נכונה.
   */
  function otzariaPositions(source, all) {
    const tokens = String(source.query || '').split(/[\s־-]+/);
    if (tokens.some((token) => /[\p{L}\p{N}]/u.test(token) && simpleWords(token).length !== 1)) return null;
    const plain = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
    const index = (value) => (/^\d+$/.test(value) ? Number(value) : -1);
    const options = [];
    for (const [key, value] of Object.entries(plain(source.wordOptions))) {
      if (!filled(value)) continue;
      const sep = key.lastIndexOf('_');
      const at = sep > 0 ? index(key.slice(sep + 1)) : -1;
      const words = simpleWords(key.slice(0, sep));
      if (at < 0 || at >= all.length || words.length !== 1 || words[0] !== all[at]) return null;
      options[at] = plain(value);
    }
    const alternatives = [];
    for (const [key, value] of Object.entries(plain(source.alternativeWords))) {
      if (!filled(value)) continue;
      const at = index(key);
      if (at < 0 || at >= all.length || !Array.isArray(value)) return null;
      alternatives[at] = value.filter((word) => typeof word === 'string' && word.trim());
    }
    const spacing = plain(source.customSpacing);
    for (const key of Object.keys(spacing)) {
      const pair = /^(\d+)-(\d+)$/.exec(key);
      if (!pair || Number(pair[2]) !== Number(pair[1]) + 1 || Number(pair[2]) >= all.length) return null;
    }
    return { options, alternatives, spacing };
  }

  /**
   * המילים שבין כל שתי מילים, כמו `resolve_gaps` באוצריא: בלי מרווחים
   * ידניים — `distance` לכולן; עם מרווחים — זוג בלי ערך מקבל את הגדול שבהם.
   */
  function otzariaGaps(spacing, distance, count) {
    const values = spacing || {};
    const parse = (value) => (/^-?\d+$/.test(String(value).trim()) ? Math.max(0, Number.parseInt(value, 10)) : null);
    const widest = Math.max(0, ...Object.values(values).map(parse).filter((value) => value !== null));
    return Array.from({ length: Math.max(0, count - 1) }, (_, i) => {
      if (!Object.keys(values).length) return Math.max(0, distance);
      const value = parse(values[i + '-' + (i + 1)] ?? '');
      return value === null ? widest : value;
    });
  }

  /** חלופה של אוצריא ← מילה אחת כאן, או `null` (ביטוי, לועזית, תווים כלליים). */
  function otzariaAlternative(value) {
    if (/[*?~]/.test(value)) return null;
    const words = simpleWords(value);
    return words.length === 1 ? words[0] : null;
  }

  /**
   * חיפוש מדיאלוג החיפוש של אוצריא (`search.requested`, בחוזה של
   * `search.query`) ← חיפוש כאן, מעל [query] הנוכחי (התחום והאפשרויות
   * נשארים; "ראשי תיבות" רק מדליק). `null` כשאין מילה עברית.
   * `approximate` — חלק מהבקשה לא עבר כמו שהוא, וההודעה אומרת זאת;
   * `missing` — מה בדיוק, בשמות של אוצריא (או החלופה במירכאות), כשידוע.
   * - אפשרויות מילה ← צורה (`otzariaTerm`), חלופות ← `(א/ב)`;
   * - מרווח במצב מתקדם (כל המילים) ← "עד N+1 מילים אחריה": באוצריא
   *   המרווח הוא המילים *שבין* המילים; מרווח ידני לכל זוג בנפרד;
   * - "כל אחת מהמילים" ← מילה אחת עם חלופות (עד MAX_ALTERNATIVES);
   * - "באותה פסקה" ← כולן באותה פסקה של בר אילן (`פסקה:`); "תחת אותה
   *   כותרת" ← כולן באותו מסמך (`מסמך:`, פרק או סימן) — קירוב, כי כותרת
   *   של אוצריא אינה בהכרח מסמך של בר אילן;
   * - כל השאר ← צמודות: בונה כשיש צורה או חלופה, אחרת חיפוש רגיל. קירוב
   *   גם כשנשלחו סינון קטגוריות, שלילה או תווים כלליים, שאין להם מקבילה.
   */
  function fromOtzariaSearch(query, request) {
    const source = request && typeof request === 'object' ? request : {};
    const all = simpleWords(source.query);
    const found = all.slice(0, MAX_TERMS);
    if (!found.length) return null;
    const advanced = source.mode === 'advanced';
    const rawDistance = Number.parseInt(source.distance, 10) || 0;
    const scope = advanced ? source.proximityScope || 'wordDistance' : 'wordDistance';
    const match = advanced ? source.wordMatchMode || 'all' : 'all';
    const missing = [];
    let lost =
      source.mode === 'fuzzy' ||
      all.length > MAX_TERMS ||
      /[*?~]/.test(String(source.query || '')) ||
      (typeof source.negativeQuery === 'string' && LETTER.test(source.negativeQuery)) ||
      (Array.isArray(source.facets) && source.facets.some((facet) => facet !== '/')) ||
      filled(source.options);
    const perWord = filled(source.wordOptions) || filled(source.alternativeWords) || filled(source.customSpacing);
    const positions = perWord ? otzariaPositions(source, all) : null;
    if (perWord && !positions) lost = true;

    const terms = found.map((word) => newTerm(word));
    const originals = found.map((word) => [word]);
    let acronyms = 0;
    if (positions) {
      found.forEach((word, i) => {
        const words = [word];
        for (const value of positions.alternatives[i] || []) {
          const alternative = otzariaAlternative(value);
          if (alternative === null || (words.length >= MAX_ALTERNATIVES && !words.includes(alternative))) {
            missing.push('"' + value.trim().slice(0, 40) + '"');
          } else if (!words.includes(alternative)) words.push(alternative);
        }
        const mapped = otzariaTerm(words, positions.options[i] || {});
        terms[i] = { words: mapped.words, form: mapped.form, exclude: false };
        originals[i] = words;
        missing.push(...mapped.missing);
        if (mapped.acronyms) acronyms += 1;
      });
    }
    // "כולל ראשי תיבות" של בר אילן חל על כל השאילתה.
    if (acronyms && acronyms < found.length) missing.push(OTZARIA.acronyms);

    const base = normalize(query);
    const options = acronyms ? { ...base.options, abbreviations: true } : base.options;
    const shaped = terms.some((term) => term.form !== 'exact' || term.words.length > 1);
    const builder = (fields) => fit({ ...base, options, mode: Mode.builder, span: Span.chain, ...fields }, missing);
    const result = (built, approximate) => {
      const names = unique(missing).slice(0, 8);
      return { query: built, approximate: Boolean(approximate || names.length), missing: names };
    };

    if (found.length > 1 && match === 'anyWord' && found.length <= MAX_ALTERNATIVES) {
      // צורה אחת לכל הקבוצה: כשהצורות שונות, המילים כפי שנשלחו.
      const forms = unique(terms.map((term) => term.form));
      const group = forms.length === 1 ? terms : originals.map((words) => ({ words }));
      const words = unique([...group.map((term) => term.words[0]), ...group.flatMap((term) => term.words.slice(1))]);
      words.slice(MAX_ALTERNATIVES).forEach((word) => missing.push('"' + word + '"'));
      const merged = { words: words.slice(0, MAX_ALTERNATIVES), form: forms.length === 1 ? forms[0] : 'exact', exclude: false };
      return result(builder({ terms: [merged], gaps: [] }), lost || forms.length > 1);
    }
    if (found.length > 1 && match === 'all' && scope !== 'wordDistance') {
      const paragraph = scope === 'sameParagraph';
      return result(
        builder({ terms, gaps: found.slice(1).map(() => newGap()), span: paragraph ? Span.paragraph : Span.document }),
        lost || !paragraph,
      );
    }
    const distances =
      advanced && match === 'all' ? otzariaGaps(positions && positions.spacing, rawDistance, found.length) : [];
    if (distances.some((distance) => distance > 0)) {
      return result(
        builder({
          terms,
          gaps: distances.map((distance) =>
            distance > 0 ? { kind: 'after', distance: Math.min(distance + 1, MAX_DISTANCE) } : newGap(),
          ),
        }),
        lost || distances.some((distance) => distance + 1 > MAX_DISTANCE),
      );
    }
    const approximate = lost || match !== 'all' || (advanced && rawDistance > 0 && found.length === 1);
    if (shaped) return result(builder({ terms, gaps: found.slice(1).map(() => newGap()) }), approximate);
    return result({ ...base, options, mode: Mode.simple, simpleText: found.join(' ') }, approximate);
  }

  // ------------------------------------------------------ גם באוצריא

  /** הצורה של בר אילן ← אפשרויות המילה של אוצריא (ההפך של `otzariaTerm`). */
  const OTZARIA_FORMS = Object.freeze({
    prefixes: [OTZARIA.gramPrefixes],
    suffixes: [OTZARIA.gramSuffixes],
    affixes: [OTZARIA.gramPrefixes, OTZARIA.gramSuffixes],
    startsWith: [OTZARIA.suffixes],
    endsWith: [OTZARIA.prefixes],
    contains: [OTZARIA.partial],
    prefixesAny: [OTZARIA.gramPrefixes, OTZARIA.suffixes],
    spelling: [OTZARIA.spelling],
    spellingPrefixes: [OTZARIA.spelling, OTZARIA.gramPrefixes],
    quotes: [OTZARIA.quotes],
    aramaic: [OTZARIA.translation],
  });

  /**
   * אותו חיפוש באוצריא (`reader.openSearchTab`): `{ query, settings? }`, או
   * `null` כשאין מילה בעברית. בלי `settings` אוצריא מחפשת בהגדרות שלה.
   * מהבונה: המילה הראשונה בכל שדה (אוצריא אינה מקבלת חלופות כאן), בלי
   * "בלי המילה הזו"; הצורות ← אפשרויות מילה; המרחק הגדול ← `distance` (מספר
   * המילים *שבין* המילים); משפט ופסקה ← "באותה פסקה", מסמך ← "תחת אותה
   * כותרת". זה קירוב, ולכן המילים נשארות בשדה של אוצריא לעריכה.
   */
  function toOtzariaSearch(query) {
    if (query.mode !== Mode.builder) {
      const source =
        query.mode === Mode.simple ? query.simpleText : query.mode === Mode.free ? query.freeText : query.manualText;
      const words = simpleWords(source);
      return words.length ? { query: words.join(' ') } : null;
    }
    const words = [];
    const wordOptions = {};
    const distances = [];
    query.terms.forEach((term, i) => {
      if (term.exclude) return;
      const first = wordsOf(term)[0];
      if (!first) return;
      const parts = simpleWords(first);
      if (!parts.length) return;
      if (words.length && i > 0) {
        const gap = query.gaps[i - 1];
        distances.push(gap && gap.kind !== 'adjacent' ? Math.max(0, clampInt(gap.distance, 1, MAX_DISTANCE, 3) - 1) : 0);
      }
      const options = OTZARIA_FORMS[term.form] || [];
      for (const word of parts) {
        if (options.length) {
          wordOptions[word + '_' + words.length] = Object.fromEntries(options.map((name) => [name, true]));
        }
        words.push(word);
      }
    });
    if (!words.length) return null;
    const settings = {};
    const span = query.span !== Span.chain && words.length > 1;
    const distance = span && query.span === Span.words ? Math.max(0, query.within - 1) : Math.max(0, ...distances);
    if (span && query.span !== Span.words) {
      settings.mode = 'advanced';
      settings.proximityScope = query.span === Span.document ? 'sameSection' : 'sameParagraph';
    } else if (distance > 0 || Object.keys(wordOptions).length || query.options.abbreviations) {
      settings.mode = 'advanced';
      settings.distance = distance;
    } else {
      settings.mode = 'exact';
    }
    if (Object.keys(wordOptions).length) settings.wordOptions = wordOptions;
    if (query.options.abbreviations) settings.options = { [OTZARIA.acronyms]: true };
    return { query: words.join(' '), settings };
  }

  /**
   * בקשה שהגיעה מדיאלוג החיפוש של אוצריא ← אותו חיפוש באוצריא, בהגדרות
   * שנבחרו שם. רק השדות ש-`reader.openSearchTab` מקבל ב-`settings`; ההיקף
   * והשלילה רק מ-0.9.99 (`ResponsaSearchHandoff.SCOPE_ENABLED`).
   */
  function otzariaSearchFrom(request) {
    const source = request && typeof request === 'object' ? request : {};
    const query = typeof source.query === 'string' ? source.query.trim() : '';
    if (!LETTER.test(query)) return null;
    const settings = {};
    for (const key of ['mode', 'distance', 'proximityScope', 'wordMatchMode', 'wordMatchCount', 'options', 'wordOptions']) {
      if (source[key] !== undefined && source[key] !== null) settings[key] = source[key];
    }
    // TODO(otzaria-0.9.99): היקף ושלילה (Otzaria/otzaria#3067), כבוי עד שיצא.
    Object.assign(settings, (root.ResponsaSearchHandoff || { scopeSettings: () => ({}) }).scopeSettings(source));
    return Object.keys(settings).length ? { query, settings } : { query };
  }

  /**
   * שאילתה ארוכה מהמותר בבר אילן מאבדת חלופות מהסוף, מהמילה שיש לה הכי
   * הרבה, עד שהיא נכנסת. מה שנשמט נוסף ל-[missing].
   */
  function fit(query, missing) {
    let next = query;
    while (buildQuery(next).length > MAX_QUERY_LENGTH) {
      const widest = next.terms.reduce((best, term, i) => (term.words.length > next.terms[best].words.length ? i : best), 0);
      const words = next.terms[widest].words;
      if (words.length < 2) break;
      missing.push('"' + words[words.length - 1] + '"');
      next = updateTerm(next, widest, { words: words.slice(0, -1) });
    }
    return next;
  }

  /** השאילתה בתחביר של בר אילן. מילה ריקה מדולגת, יחד עם המרחק שלפניה. */
  function buildQuery(query) {
    if (query.mode === Mode.simple) return simpleWords(query.simpleText).join(' ');
    if (query.mode === Mode.manual) return query.manualText.replace(/\s+/g, ' ').trim();
    if (query.mode === Mode.free) return freeText(query.freeText);
    const span = query.span !== Span.chain;
    const parts = [];
    query.terms.forEach((term, i) => {
      const value = termText(term);
      if (!value) return;
      if (parts.length) parts.push(span ? ' ' : gapText(query.gaps[i - 1]));
      parts.push(value);
    });
    const body = parts.join('');
    if (!body) return '';
    // טווח צריך לפחות שתי מילים; מילה אחת נשלחת בלי קידומת.
    if (!span || query.terms.filter((term) => wordsOf(term).length).length < 2) return body;
    return (query.span === Span.words ? query.within + ':' : SPAN_PREFIX[query.span]) + ' ' + body;
  }

  /**
   * השאילתה לתצוגה: מרחקים (`[-1:1]`) ופיזור (`10:`) מבודדים משמאל לימין,
   * אחרת בשורה מימין לשמאל המינוס והמספרים מתהפכים (`[1:1-]`). רק לתצוגה;
   * לבר אילן נשלחת [buildQuery].
   */
  function displayQuery(text) {
    return String(text).replace(/\[[^\]]*\]|^\d+:/g, (part) => '\u2066' + part + '\u2069');
  }

  /**
   * בדיקה לפני שליחה: `null`, או `{ message, term }` (term = אינדקס המילה
   * הבעייתית, כשיש). התחביר עצמו נבדק בבר אילן; כאן מה שהדיאלוג יכול לדעת.
   */
  function validate(query) {
    if (query.mode === Mode.simple) {
      if (!simpleWords(query.simpleText).length) {
        return { message: t('כתבו מילה אחת או יותר בעברית לחיפוש.') };
      }
      if (buildQuery(query).length > MAX_QUERY_LENGTH) {
        return { message: t('הטקסט ארוך מדי. אפשר עד {max} תווים.', { max: MAX_QUERY_LENGTH }) };
      }
    } else if (query.mode === Mode.free) {
      const value = buildQuery(query);
      if (!LETTER.test(value)) return { message: t('כתבו שאלה או משפט בעברית.') };
      if (value.length > MAX_QUERY_LENGTH) {
        return { message: t('הטקסט ארוך מדי. אפשר עד {max} תווים.', { max: MAX_QUERY_LENGTH }) };
      }
    } else if (query.mode === Mode.manual) {
      const value = buildQuery(query);
      if (!LETTER.test(value)) return { message: t('כתבו את השאילתה, עם לפחות מילה אחת בעברית.') };
      if (value.length > MAX_QUERY_LENGTH) {
        return { message: t('השאילתה ארוכה מדי. אפשר עד {max} תווים.', { max: MAX_QUERY_LENGTH }) };
      }
      const bad = [...value].find((char) => !QUERY.test(char));
      if (bad) return { message: t('התו "{char}" אינו חלק מהתחביר של בר אילן.', { char: bad }) };
    } else {
      const filled = query.terms.filter((term) => wordsOf(term).length);
      if (!filled.length) return { message: t('כתבו לפחות מילה אחת לחיפוש.') };
      if (filled.every((term) => term.exclude)) {
        return { message: t('צריך לפחות מילה אחת שאינה מסומנת "בלי המילה הזו".') };
      }
      for (let i = 0; i < query.terms.length; i++) {
        const term = query.terms[i];
        const words = wordsOf(term);
        const form = FORM_BY_ID[term.form] || FORM_BY_ID.exact;
        for (const word of words) {
          for (const part of word.split(/\s+/)) {
            if (!WORD.test(part) || !LETTER.test(part)) {
              return {
                message: t('"{word}" אינה מילה בעברית. מותר להוסיף בה רק את סימני החיפוש ? ~ * @.', { word: part }),
                term: i,
              };
            }
          }
        }
        if (form.single && words.length > 1) {
          return { message: t('משפחה וחיפוש שמור הם שם אחד, בלי מילים חלופיות.'), term: i };
        }
        // בר אילן מחפש ביטוי כמו שהוא; סימן לפניו או אחריו לא נמדד.
        if (words.some(isPhrase) && (term.form !== 'exact' || form.single)) {
          return {
            message: t('ביטוי של כמה מילים מחופש כמו שנכתב. לחיפוש בצורות אחרות — מילה בכל שדה.'),
            term: i,
          };
        }
      }
      if (buildQuery(query).length > MAX_QUERY_LENGTH) {
        return { message: t('השאילתה ארוכה מדי. אפשר עד {max} תווים.', { max: MAX_QUERY_LENGTH }) };
      }
    }
    if (query.scope.mode === Scope.pick && !query.scope.items.length) {
      return { message: t('בחרו לפחות קטגוריה או ספר אחד, או חפשו בכל הספרים.') };
    }
    return null;
  }

  /**
   * החיפוש כפי שהמסך מציג אותו: בלי רשימת ספרים אין בחירת קטגוריות, ותחום
   * "קטגוריות וספרים שאבחר" שנשמר קודם הוא "כל הספרים". כך גם נבדק ונשלח.
   */
  function withAvailableScope(query, catalogReady) {
    if (catalogReady || query.scope.mode !== Scope.pick) return query;
    return { ...query, scope: { ...query.scope, mode: Scope.all } };
  }

  /**
   * גוף הבקשה ל-`POST /text/search` (docs/PROTOCOL.md). ניסוח חופשי נשלח
   * עם `freeForm` ובלי `advanced`, ובלי ראשי תיבות וצורות: אין להם מקום בו.
   * [how] — מה השירות מכיר: `easy` ("חיפוש קל", 0.5.6) ו-`easyOptions`
   * (ההגדרות שלו מכאן, 0.6.0).
   */
  function toRequest(query, how) {
    const free = query.mode === Mode.free;
    // חיפוש רגיל ב"חיפוש קל" של בר אילן. בלי `easySearch` — חיפוש מתקדם,
    // המילים צמודות.
    const easy = query.mode === Mode.simple && Boolean(how && how.easy);
    const options =
      free || easy
        ? {}
        : {
            abbreviations: query.options.abbreviations,
            // בחיפוש רגיל אין "ניהול הצורות": המילים נשלחות כפי שנכתבו.
            showForms: query.mode !== Mode.simple && query.options.showForms,
          };
    // ההגדרות של "חיפוש קל": בלי `additions` — מה שהמשתמש בחר בבר אילן.
    if (easy && how.easyOptions && query.easy.how !== Easy.mine) {
      options.additions = query.easy.how === Easy.additions;
      if (options.additions) {
        options.prefixes = query.easy.prefixes;
        options.distance = query.easy.distance;
        options.spelling = query.easy.spelling;
      }
    }
    const body = easy
      ? { q: simpleWords(query.simpleText).join(' '), easy: true, options }
      : { q: buildQuery(query), ...(free ? { freeForm: true } : { advanced: true }), options };
    if (query.scope.mode === Scope.all) options.allDatabases = true;
    else if (query.scope.mode === Scope.current) options.allDatabases = false;
    else {
      body.scope = {
        paths: query.scope.items.filter((item) => item.type === 'category').map((item) => item.path),
        books: query.scope.items.filter((item) => item.type === 'book').map((item) => item.key),
      };
    }
    return body;
  }

  // ------------------------------------------------------ הסבר במילים

  /** איך כל צורה נקראת בתוך משפט ההסבר. */
  const FORM_PHRASES = Object.freeze({
    exact: '',
    prefixes: N('עם אותיות שימוש'),
    suffixes: N('עם סיומות'),
    affixes: N('עם אותיות שימוש וסיומות'),
    startsWith: N('או מילה שמתחילה כך'),
    endsWith: N('או מילה שמסתיימת כך'),
    contains: N('או מילה שמכילה את האותיות'),
    prefixesAny: N('עם אותיות שימוש וכל סיומת'),
    spelling: N('בכתיב מלא או חסר'),
    spellingPrefixes: N('בכתיב מלא או חסר, עם אותיות שימוש'),
    quotes: N('עם או בלי גרשיים'),
    entry: N('בכל צורות הערך'),
    root: N('וכל המילים מהשורש'),
    aramaic: N('כולל התרגום לארמית'),
    family: N('(משפחת מילים)'),
    saved: N('(חיפוש שמור)'),
  });

  /** פתיחת ההסבר כשהמילים בטווח, לפי [Span]. */
  const SPAN_SENTENCES = Object.freeze({
    words: N('מקורות שבהם מופיעות כל המילים, בכל סדר, עד {count} מילים זו מזו:'),
    sentence: N('מקורות שבהם כל המילים מופיעות באותו משפט, בכל סדר:'),
    paragraph: N('מקורות שבהם כל המילים מופיעות באותה פסקה (הלכה, סעיף או דיבור המתחיל), בכל סדר:'),
    document: N('מקורות שבהם כל המילים מופיעות באותו מסמך (פרק, סימן או תשובה), בכל סדר:'),
  });

  /** ההסבר של "חיפוש קל", לפי ההגדרות שלו. */
  function easyLines(words, easy) {
    const text = words.join(' ');
    if (easy.how === Easy.mine) {
      return [
        t('בר אילן יחפש את "{words}" ב"חיפוש קל", לפי ההגדרות שבחרתם שם (למשל אותיות שימוש ומרחק בין המילים).', {
          words: text,
        }),
      ];
    }
    // מרחק בין מילים אינו חל על מילה אחת.
    const extras =
      easy.how === Easy.additions
        ? [
            easy.prefixes
              ? t('עם אותיות שימוש לפני המילה הראשונה (ו, ה, ב, כ, ל, מ, ש): "ו{word}", "ב{word}"', { word: words[0] })
              : null,
            easy.distance && words.length > 1 ? t('עם עד שתי מילים אחרות בין המילים') : null,
            easy.spelling ? t('בכתיב מלא או חסר: מילה עם ו\' או י\' תימצא גם בלעדיהן') : null,
          ].filter(Boolean)
        : [];
    if (!extras.length) {
      return [
        words.length > 1
          ? t('מקורות שבהם המילים "{words}" מופיעות צמודות, בסדר הזה, בדיוק כפי שנכתבו.', { words: text })
          : t('מקורות שבהם מופיעה המילה "{words}" בדיוק כפי שנכתבה.', { words: text }),
      ];
    }
    return [
      words.length > 1
        ? t('מקורות שבהם מופיעות המילים "{words}", בסדר הזה, וגם:', { words: text })
        : t('מקורות שבהם מופיעה המילה "{words}", וגם:', { words: text }),
      ...extras.map((line) => '• ' + line),
    ];
  }

  /** `"נר" או "אור"`, ואחריהם איך לחפש. */
  function termPhrase(term) {
    const words = wordsOf(term).map((word) => '"' + word + '"');
    const joined = words.length > 1 ? words.slice(0, -1).join(', ') + ' ' + t('או') + ' ' + words[words.length - 1] : words[0];
    const form = FORM_PHRASES[term.form];
    return form ? joined + ' ' + t(form) : joined;
  }

  function gapPhrase(gap) {
    if (!gap || gap.kind === 'adjacent') return t('ומיד אחריה');
    return gap.kind === 'around'
      ? t('ולפניה או אחריה (עד {count} מילים ממנה)', { count: gap.distance })
      : t('ואחריה (עד {count} מילים ממנה)', { count: gap.distance });
  }

  /**
   * מה יחופש, במשפטים פשוטים, למי שאינו מכיר את התחביר: המילים, המקום
   * והאפשרויות. בכתיבה ידנית — רק המקום והאפשרויות; בניסוח חופשי — המשפט
   * והמקום.
   */
  function describe(query, scopeLabel, how) {
    const lines = [];
    if (query.mode === Mode.simple && how && how.easy) {
      const words = simpleWords(query.simpleText);
      if (words.length) lines.push(...easyLines(words, how.easyOptions ? query.easy : newEasy()));
      if (scopeLabel) lines.push(scopeLabel);
      return lines;
    }
    if (query.mode === Mode.free) {
      const sentence = freeText(query.freeText);
      if (sentence) lines.push(t('בר אילן יחפש מקורות לפי הניסוח: "{text}"', { text: sentence }));
      if (scopeLabel) lines.push(scopeLabel);
      return lines;
    }
    if (query.mode === Mode.simple) {
      const words = simpleWords(query.simpleText);
      if (words.length === 1) lines.push(t('מקורות שבהם מופיעה המילה "{word}".', { word: words[0] }));
      else if (words.length > 1) {
        lines.push(t('מקורות שבהם המילים "{words}" מופיעות צמודות, בסדר הזה.', { words: words.join(' ') }));
      }
    } else if (query.mode === Mode.builder) {
      const filled = query.terms
        .map((term, index) => ({ term, index }))
        .filter((entry) => wordsOf(entry.term).length);
      const wanted = filled.filter((entry) => !entry.term.exclude);
      const excluded = filled.filter((entry) => entry.term.exclude);
      const spanned = query.span !== Span.chain && wanted.length > 1;
      if (wanted.length) {
        if (spanned) {
          lines.push(t(SPAN_SENTENCES[query.span], { count: query.within }));
          wanted.forEach((entry) => lines.push('• ' + termPhrase(entry.term)));
        } else {
          // השרשרת היא בסדר השדות: מילה מוחרגת בין שתי מילים היא חוליה בה,
          // והמרחק של המילה שאחריה נמדד ממנה.
          const first = wanted[0].index;
          const last = wanted[wanted.length - 1].index;
          let sentence = t('מקורות שבהם מופיעה המילה {term}', { term: termPhrase(wanted[0].term) });
          filled
            .filter((entry) => entry.index > first && entry.index <= last)
            .forEach((entry) => {
              const word = entry.term.exclude
                ? t('לא המילה {term}', { term: termPhrase(entry.term) })
                : termPhrase(entry.term);
              sentence += ', ' + gapPhrase(query.gaps[entry.index - 1]) + ' ' + word;
            });
          lines.push(sentence + '.');
        }
      }
      const inChain = (entry) =>
        !spanned && wanted.length && entry.index > wanted[0].index && entry.index < wanted[wanted.length - 1].index;
      excluded
        .filter((entry) => !inChain(entry))
        .forEach((entry) => {
          lines.push(t('בלי מקורות שבהם מופיעה המילה {term}.', { term: termPhrase(entry.term) }));
        });
    }
    if (scopeLabel) lines.push(scopeLabel);
    if (query.options.abbreviations) lines.push(t('כולל ראשי תיבות: "צער בעלי חיים" ימצא גם "צעב"ח".'));
    if (query.mode !== Mode.simple && query.options.showForms) {
      lines.push(t('לפני התוצאות בר אילן יציג את הצורות שנמצאו, לבחירה.'));
    }
    return lines;
  }

  /**
   * מעבר לבונה מחיפוש רגיל: אם הבונה ריק, המילים שנכתבו הופכות למילים בו,
   * צמודות. כך מי שמתחיל ברגיל ממשיך מאותו מקום.
   */
  function setMode(query, mode) {
    if (!Object.values(Mode).includes(mode) || query.mode === mode) return query;
    const next = { ...query, mode };
    const builderEmpty = !query.terms.some((term) => wordsOf(term).length);
    if (mode === Mode.builder && builderEmpty) {
      // המילים שנכתבו באופן שהיה פתוח; ואם הוא ריק, באחר.
      const sources = { [Mode.simple]: query.simpleText, [Mode.manual]: query.manualText, [Mode.free]: query.freeText };
      const written = [sources[query.mode], query.simpleText, query.manualText, query.freeText].find((text) => simpleWords(text).length);
      const words = simpleWords(written).slice(0, MAX_TERMS);
      if (words.length) {
        next.terms = words.map((word) => newTerm(word));
        next.gaps = words.slice(1).map(() => newGap());
      }
    }
    if (mode === Mode.manual && !query.manualText.trim()) next.manualText = buildQuery(query);
    return next;
  }

  /** היכולת שהשירות צריך כדי לחפש באופן של [query] (`/health`). */
  function capability(query) {
    return query.mode === Mode.free ? 'freeFormSearch' : 'advancedSearch';
  }

  /**
   * הערה כשהשירות שבמחשב אינו מכיר את האופן שנבחר, או `null`. [can] — שם
   * יכולת ← האם השירות מכיר אותה (`Domain.serviceCan`). כשאין גם
   * `advancedSearch`, הלשונית כולה מציגה הערה משלה.
   */
  function serviceNote(query, can) {
    if (capability(query) === 'advancedSearch' || can(capability(query))) return null;
    return t('שירות בר אילן שבמחשב ישן ואינו מכיר את החיפוש הזה. כדאי להוריד את הגרסה החדשה.');
  }

  // ------------------------------------------------------ עריכה

  /** כל פעולת עריכה מחזירה מודל חדש, כדי שהבקר יוכל לשמור ולצייר. */
  function addTerm(query) {
    if (query.terms.length >= MAX_TERMS) return query;
    return { ...query, terms: [...query.terms, newTerm()], gaps: [...query.gaps, newGap()] };
  }

  function removeTerm(query, index) {
    if (query.terms.length <= 1) return { ...query, terms: [newTerm()], gaps: [] };
    const terms = query.terms.filter((_, i) => i !== index);
    // המרחק שלפני המילה שהוסרה (או שאחריה, כשהיא הראשונה) הולך איתה.
    const gaps = query.gaps.filter((_, i) => i !== Math.max(0, index - 1));
    return { ...query, terms, gaps };
  }

  function updateTerm(query, index, patch) {
    return { ...query, terms: query.terms.map((term, i) => (i === index ? { ...term, ...patch } : term)) };
  }

  function setWord(query, index, alternative, value) {
    const term = query.terms[index];
    if (!term) return query;
    const words = term.words.map((word, i) => (i === alternative ? String(value).slice(0, MAX_WORD_LENGTH) : word));
    return updateTerm(query, index, { words });
  }

  function addAlternative(query, index) {
    const term = query.terms[index];
    if (!term || term.words.length >= MAX_ALTERNATIVES) return query;
    return updateTerm(query, index, { words: [...term.words, ''] });
  }

  function removeAlternative(query, index, alternative) {
    const term = query.terms[index];
    if (!term || term.words.length <= 1) return query;
    return updateTerm(query, index, { words: term.words.filter((_, i) => i !== alternative) });
  }

  function updateGap(query, index, patch) {
    const gaps = query.gaps.map((gap, i) =>
      i === index
        ? {
            kind: GAPS.includes(patch.kind) ? patch.kind : gap.kind,
            distance: patch.distance === undefined ? gap.distance : clampInt(patch.distance, 1, MAX_DISTANCE, gap.distance),
          }
        : gap,
    );
    return { ...query, gaps };
  }

  function sameItem(a, b) {
    return a.type === b.type && (a.type === 'book' ? a.key === b.key : a.path === b.path);
  }

  /** בחירה או ביטול של קטגוריה/ספר בתחום. קטגוריה בולעת את מה שתחתיה. */
  function toggleScopeItem(query, item) {
    const items = query.scope.items;
    if (items.some((existing) => sameItem(existing, item))) {
      return { ...query, scope: { ...query.scope, items: items.filter((existing) => !sameItem(existing, item)) } };
    }
    if (items.length >= MAX_SCOPE_ITEMS) return query;
    const under = (path) => item.type === 'category' && (path === item.path || path.startsWith(item.path + '/'));
    const kept = items.filter((existing) => !under(existing.path || ''));
    return { ...query, scope: { ...query.scope, items: [...kept, item] } };
  }

  /** האם [item] כבר בתחום, ישירות או דרך קטגוריה שמעליו. */
  function scopeIncludes(query, item) {
    return query.scope.items.some(
      (existing) =>
        sameItem(existing, item) ||
        (existing.type === 'category' &&
          (item.path === existing.path || (item.path || '').startsWith(existing.path + '/'))),
    );
  }

  // ------------------------------------------------------ דוגמאות

  function term(words, form, exclude) {
    return { words: Array.isArray(words) ? words : [words], form: form || 'exact', exclude: Boolean(exclude) };
  }

  /**
   * דוגמאות לכל אופן: לחיצה טוענת אותן. רובן מהעזרה ומחלונות החיפוש של בר
   * אילן. כל דוגמה מחליפה רק את מה שמחפשים, לא את התחום ואת האפשרויות.
   */
  const SIMPLE_EXAMPLES = Object.freeze([
    { id: 'simple-chanukah', label: N('נר חנוכה'), text: 'נר חנוכה' },
    { id: 'simple-shema', label: N('קריאת שמע'), text: 'קריאת שמע' },
    { id: 'simple-maaser', label: N('מעשר כספים'), text: 'מעשר כספים' },
    { id: 'simple-agunah', label: N('עדות אשה'), text: 'עדות אשה' },
  ]);

  /** מחלון "חיפוש בניסוח חופשי" של בר אילן. */
  const FREE_EXAMPLES = Object.freeze([
    { id: 'free-kidney', label: N('האם יש חיוב לתרום כליה לחולה מסוכן'), text: 'האם יש חיוב לתרום כליה לחולה מסוכן' },
    { id: 'free-shul', label: N('פתיחת בית כנסת בבנין מגורים'), text: 'פתיחת בית כנסת בבנין מגורים' },
    { id: 'free-phone', label: N('מצות ביקור חולים באמצעות הטלפון'), text: 'מצות ביקור חולים באמצעות הטלפון' },
    { id: 'free-maaser', label: N('קניית ספרים ממעשר כספים'), text: 'קניית ספרים ממעשר כספים' },
    { id: 'free-elevator', label: N('האם חייבים כל השכנים להשתתף בהוצאות המעלית'), text: 'האם חייבים כל השכנים להשתתף בהוצאות המעלית' },
  ]);

  /** לבונה, מהעזרה של בר אילן ומהחיפוש הטבלאי שלו. */
  const EXAMPLES = Object.freeze([
    {
      id: 'distance',
      label: N('נר ושבת, עד ארבע מילים זו מזו'),
      query: { terms: [term('נר'), term('שבת')], gaps: [{ kind: 'after', distance: 4 }] },
    },
    {
      id: 'order',
      label: N('חכמים תקנו, או תקנו חכמים'),
      query: { terms: [term('חכמים'), term('תקנו')], gaps: [{ kind: 'around', distance: 1 }] },
    },
    {
      id: 'scattered',
      label: N('עגונה, גוי ועדות, בכל סדר ובטווח של עשר מילים'),
      query: { terms: [term('עגונה'), term('גוי'), term('עדות')], span: Span.words, within: 10 },
    },
    {
      id: 'sentence',
      label: N('שליח ציבור וטעות, באותו משפט'),
      query: { terms: [term('שליח', 'prefixes'), term('ציבור'), term('טעה', 'root')], span: Span.sentence },
    },
    {
      id: 'paragraph',
      label: N('מעלית ושבת, באותה פסקה'),
      query: { terms: [term('מעלית', 'affixes'), term('שבת', 'prefixes')], span: Span.paragraph },
    },
    {
      id: 'phrase',
      label: N('צער בעלי חיים, או בקיצור צעב"ח'),
      query: { terms: [term(['צער בעלי חיים', 'צעב"ח'])] },
    },
    {
      id: 'alternatives',
      label: N('השחתת עצים: קוצץ, עוקר או משחית, ליד עץ, אילן או נטיעה'),
      query: {
        terms: [term(['קוצץ', 'עוקר', 'משחית']), term(['עץ', 'אילן', 'נטיעה'])],
        gaps: [{ kind: 'after', distance: 3 }],
      },
    },
    {
      id: 'spelling',
      label: N('אהרון הכהן, בכתיב מלא או חסר ועם אותיות שימוש'),
      query: { terms: [term('אהרון', 'spellingPrefixes'), term('הכהן')], gaps: [{ kind: 'adjacent' }] },
    },
    {
      id: 'wildcards',
      label: N('טלפון בכל צורות הכתיב (טליפון, טעלעפאן)'),
      query: { terms: [term('*ט*ל*פ*ן*')] },
    },
    {
      id: 'exclude',
      label: N('ישראל, בלי "בני ישראל"'),
      query: { terms: [term('בני', 'exact', true), term('ישראל')], gaps: [{ kind: 'adjacent' }] },
    },
  ]);

  function applyExample(query, id) {
    const simple = SIMPLE_EXAMPLES.find((entry) => entry.id === id);
    if (simple) return { ...query, mode: Mode.simple, simpleText: simple.text };
    const free = FREE_EXAMPLES.find((entry) => entry.id === id);
    if (free) return { ...query, mode: Mode.free, freeText: free.text };
    const example = EXAMPLES.find((entry) => entry.id === id);
    if (!example) return query;
    const next = normalize({ ...emptyQuery(), ...example.query, mode: Mode.builder });
    return {
      ...next,
      simpleText: query.simpleText,
      freeText: query.freeText,
      easy: query.easy,
      scope: query.scope,
      options: query.options,
    };
  }

  /** מקרא הסימנים, לעזרה שבדיאלוג ולמי שכותב את השאילתה בעצמו. */
  const SYNTAX = Object.freeze([
    { sign: 'נר שבת', meaning: N('המילים צמודות, בסדר הזה') },
    { sign: 'נר [1:4] שבת', meaning: N('"שבת" עד ארבע מילים אחרי "נר"') },
    { sign: 'חכמים [-1:1] תקנו', meaning: N('לפניה או אחריה') },
    { sign: '10: א ב ג', meaning: N('כל המילים, בכל סדר, עד עשר מילים זו מזו') },
    { sign: 'משפט: א ב', meaning: N('כל המילים באותו משפט, בכל סדר') },
    { sign: 'פסקה: א ב', meaning: N('כל המילים באותה פסקה: הלכה, סעיף או דיבור המתחיל') },
    { sign: 'מסמך: א ב', meaning: N('כל המילים באותו מסמך: פרק, סימן או תשובה') },
    { sign: '(עץ/אילן)', meaning: N('אחת מהמילים') },
    { sign: '({{צער בעלי חיים}}/צעב"ח)', meaning: N('ביטוי של כמה מילים, גם כחלופה') },
    { sign: '#נר  נר#', meaning: N('אותיות שימוש לפני המילה, סיומות דקדוקיות אחריה') },
    { sign: '*נר  נר*', meaning: N('כל אותיות לפני המילה או אחריה') },
    { sign: '!אהרון', meaning: N('כתיב מלא או חסר') },
    { sign: '+רמבם', meaning: N('עם או בלי גרשיים') },
    { sign: '$מדרגה  %שמר', meaning: N('כל צורות הערך, כל המילים מהשורש') },
    { sign: '^אמר', meaning: N('כולל התרגום לארמית') },
    { sign: '-בני', meaning: N('בלי מקורות שבהם המילה מופיעה') },
    { sign: '<שם>  {שם}', meaning: N('משפחת מילים, חיפוש שמור') },
    { sign: '? ~ * @', meaning: N('בתוך מילה: אות אחת, עד אות אחת, כל מספר אותיות, בלי אות') },
  ]);

  const api = {
    FORMS,
    FORM_BY_ID,
    GAPS,
    Span,
    Easy,
    Scope,
    Mode,
    EXAMPLES,
    SIMPLE_EXAMPLES,
    FREE_EXAMPLES,
    SYNTAX,
    MAX_TERMS,
    MAX_ALTERNATIVES,
    MAX_WORD_LENGTH,
    MAX_DISTANCE,
    MAX_SCOPE_ITEMS,
    MAX_QUERY_LENGTH,
    emptyQuery,
    normalize,
    simpleWords,
    freeText,
    buildQuery,
    describe,
    setMode,
    fromOtzariaSearch,
    toOtzariaSearch,
    otzariaSearchFrom,
    displayQuery,
    termText,
    isPhrase,
    validate,
    withAvailableScope,
    toRequest,
    capability,
    serviceNote,
    addTerm,
    removeTerm,
    updateTerm,
    setWord,
    addAlternative,
    removeAlternative,
    updateGap,
    toggleScopeItem,
    scopeIncludes,
    applyExample,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaAdvanced = api;
})(typeof self !== 'undefined' ? self : globalThis);
