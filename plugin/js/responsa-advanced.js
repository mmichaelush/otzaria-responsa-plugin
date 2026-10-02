// החיפוש המתקדם: מודל, בניית השאילתה בתחביר של בר אילן, בדיקה ודוגמאות.
// לוגיקה טהורה בלבד; הדיאלוג נבנה ב-responsa-advanced-ui.js.
//
// התחביר נמדד מול "חיפוש מתקדם" של בר אילן (גרסה 25), והסימנים נבנו על ידי
// הכפתורים של בר אילן עצמו: `#נר` אותיות שימוש, `נר#` סיומות דקדוקיות, `!`
// כתיב מלא/חסר, `+` עם/בלי גרשיים, `$` ערך, `%` שורש, `^` תרגום לארמית,
// `-` שלילה, `<שם>` משפחה, `{שם}` חיפוש שמור, `(א/ב)` חלופות, `[1:4]` עד
// ארבע מילים אחריה, `[-2:2]` לפניה או אחריה, ו-`10:` בראש השאילתה לפיזור.
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

  const Scope = Object.freeze({ all: 'all', current: 'current', pick: 'pick' });

  const MAX_TERMS = 8;
  const MAX_ALTERNATIVES = 6;
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

  function newTerm(word) {
    return { words: [word || ''], form: 'exact', exclude: false };
  }

  function newGap() {
    return { kind: 'adjacent', distance: 3 };
  }

  function emptyQuery() {
    return {
      terms: [newTerm()],
      gaps: [],
      anyOrder: false,
      within: 10,
      manual: false,
      manualText: '',
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
          .map((word) => text(word, 60));
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
    result.anyOrder = value.anyOrder === true;
    result.within = clampInt(value.within, 1, MAX_DISTANCE, 10);
    result.manual = value.manual === true;
    result.manualText = text(value.manualText, MAX_QUERY_LENGTH);
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

  /** מילה אחת כפי שתישלח: שלילה, ואז הסימנים לפני המילה, החלופות ואחריה. */
  function termText(term) {
    const words = wordsOf(term);
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

  /** השאילתה בתחביר של בר אילן. מילה ריקה מדולגת, יחד עם המרחק שלפניה. */
  function buildQuery(query) {
    if (query.manual) return query.manualText.replace(/\s+/g, ' ').trim();
    const parts = [];
    query.terms.forEach((term, i) => {
      const value = termText(term);
      if (!value) return;
      if (parts.length) parts.push(query.anyOrder ? ' ' : gapText(query.gaps[i - 1]));
      parts.push(value);
    });
    const body = parts.join('');
    if (!body) return '';
    return query.anyOrder && query.terms.filter((term) => wordsOf(term).length).length > 1
      ? query.within + ': ' + body
      : body;
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
    if (query.manual) {
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
          if (/\s/.test(word)) {
            return {
              message: t('בכל שדה כותבים מילה אחת. לביטוי של כמה מילים מוסיפים מילה לכל אחת מהן.'),
              term: i,
            };
          }
          if (!WORD.test(word) || !LETTER.test(word)) {
            return {
              message: t('"{word}" אינה מילה בעברית. מותר להוסיף בה רק את סימני החיפוש ? ~ * @.', { word }),
              term: i,
            };
          }
        }
        if (form.single && words.length > 1) {
          return { message: t('משפחה וחיפוש שמור הם שם אחד, בלי מילים חלופיות.'), term: i };
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

  /** גוף הבקשה ל-`POST /text/search` (docs/PROTOCOL.md). */
  function toRequest(query) {
    const options = {
      abbreviations: query.options.abbreviations,
      showForms: query.options.showForms,
    };
    const body = { q: buildQuery(query), advanced: true, options };
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
    const words = term.words.map((word, i) => (i === alternative ? String(value).slice(0, 60) : word));
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

  /** מהעזרה של בר אילן. כל דוגמה מחליפה רק את המילים, לא את התחום. */
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
      query: { terms: [term('עגונה'), term('גוי'), term('עדות')], anyOrder: true, within: 10 },
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
    const example = EXAMPLES.find((entry) => entry.id === id);
    if (!example) return query;
    const next = normalize({ ...emptyQuery(), ...example.query });
    return { ...next, scope: query.scope, options: query.options };
  }

  /** מקרא הסימנים, לעזרה שבדיאלוג ולמי שכותב את השאילתה בעצמו. */
  const SYNTAX = Object.freeze([
    { sign: 'נר שבת', meaning: N('המילים צמודות, בסדר הזה') },
    { sign: 'נר [1:4] שבת', meaning: N('"שבת" עד ארבע מילים אחרי "נר"') },
    { sign: 'חכמים [-1:1] תקנו', meaning: N('לפניה או אחריה') },
    { sign: '10: א ב ג', meaning: N('כל המילים, בכל סדר, עד עשר מילים זו מזו') },
    { sign: '(עץ/אילן)', meaning: N('אחת מהמילים') },
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
    Scope,
    EXAMPLES,
    SYNTAX,
    MAX_TERMS,
    MAX_ALTERNATIVES,
    MAX_DISTANCE,
    MAX_SCOPE_ITEMS,
    MAX_QUERY_LENGTH,
    emptyQuery,
    normalize,
    buildQuery,
    displayQuery,
    termText,
    validate,
    toRequest,
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
