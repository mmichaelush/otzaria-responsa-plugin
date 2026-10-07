// איתור מקום מדויק: שם ספר ומקום בו ("בראשית ב ג"), כפי שכותבים בעמוד
// "כתיבת מקורות" של בר אילן. לוגיקה טהורה; הלשונית ב-responsa-locate-ui.js.
(function (root) {
  'use strict';

  const I18n = root.ResponsaI18n;
  const t = (text, vars) => I18n.t(text, vars);

  /** כמו בשירות (`HelperService.maxReferenceLength`). */
  const MAX_LENGTH = 200;

  /** כמו בהגדרות (`MAX_LOCATE_HISTORY`). */
  const MAX_HISTORY = 8;

  const LETTER = /[א-ת]/;

  /** דוגמאות לכתיבה, כל אחת בצורה שבר אילן מזהה. */
  const EXAMPLES = Object.freeze([
    'בראשית ב ג',
    'ברכות דף ב עמוד א',
    'משנה ברכות פרק א משנה א',
    'שולחן ערוך אורח חיים סימן א',
    'רמב"ם הלכות שבת פרק א',
  ]);

  /** ניקוד נמחק, מקף הופך לרווח, ורווחים מיותרים מתאחדים — כמו בשירות. */
  function normalize(value) {
    // כמו HelperService.normalizeReference, כדי ש"אחרונים" לא יכיל כפילויות
    // שנראות זהות (סימני כיווניות מהדבקה).
    return String(value || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .replace(/[\u0591-\u05C7]/g, (char) => (char === '\u05BE' ? ' ' : ''))
      .replace(/[\u05F3\u2018\u2019\u00B4`]/g, "'")
      .replace(/[\u05F4\u201C\u201D]|''/g, '"')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LENGTH);
  }

  /** `null`, או הסבר מה חסר. */
  function validate(value) {
    const ref = normalize(value);
    if (!LETTER.test(ref)) {
      return t('כתבו שם ספר ומקום בו, למשל "בראשית ב ג".');
    }
    if (!/\s/.test(ref)) {
      return t('חסר המקום בספר. כותבים אחרי שם הספר את הפרק, הדף או הסימן, למשל "{example}".', {
        example: ref + ' א',
      });
    }
    return null;
  }

  /** טקסט מסומן ארוך מזה הוא קטע מהספר, ולא מקום. */
  const MAX_SELECTION_LENGTH = 60;
  const MAX_SELECTION_WORDS = 8;

  const LETTER_VALUES = 'אבגדהוזחטיכלמנסעפצקרשת';

  /** ערך האות בגימטריה (סופית כרגילה). */
  function letterValue(letter) {
    const index = LETTER_VALUES.indexOf('ךםןףץ'.includes(letter) ? 'כמנפצ'['ךםןףץ'.indexOf(letter)] : letter);
    if (index < 0) return 0;
    return index < 10 ? index + 1 : index < 19 ? (index - 8) * 10 : (index - 17) * 100;
  }

  /** מספר בגימטריה (`לא`, `רצט`, `ט"ו`, `ב.`): עד ארבע אותיות, בסדר יורד. */
  function isNumeral(word) {
    const letters = word.replace(/["'.:]/g, '');
    if (!/^[א-ת]{1,4}$/.test(letters)) return false;
    if (letters === 'טו' || letters === 'טז') return true;
    for (let i = 1; i < letters.length; i++) {
      if (letterValue(letters[i]) > letterValue(letters[i - 1])) return false;
    }
    return true;
  }

  /**
   * טקסט שסומן בספר, כשהוא נראה כמקום (`ב"מ לא, א`): קצר, שם ומקום בו
   * (`validate`), ומילת מקום (`סימן`), ספרות, או מספר בגימטריה בסופו.
   * סוגריים סביבו ופסיק או נקודה-פסיק בסופו נמחקים; נקודה ונקודתיים
   * נשארים, כי הם העמוד (`ברכות ב.`). `null` — אין סימון, או קטע מהספר.
   */
  function fromSelection(text) {
    const ref = normalize(text).replace(/^[([{\s]+|[)\]}\s,;]+$/g, '');
    if (ref.length > MAX_SELECTION_LENGTH || validate(ref)) return null;
    const tokens = ref.replace(/[,;]/g, ' ').split(' ').filter(Boolean);
    if (tokens.length > MAX_SELECTION_WORDS) return null;
    const place =
      /\d/.test(ref) ||
      tokens.slice(1).some((token) => PLACE.has(wordKey(token))) ||
      isNumeral(tokens[tokens.length - 1]);
    return place ? ref : null;
  }

  /** המקום האחרון בראש הרשימה, בלי כפילויות. */
  function remember(history, value) {
    const ref = normalize(value);
    if (!ref) return history;
    return [ref, ...history.filter((entry) => entry !== ref)].slice(0, MAX_HISTORY);
  }

  /** "פתיחה במקום מסוים" מתוך ספר ברשימה: שם הספר, ואחריו רווח להמשך. */
  function startFrom(title) {
    const name = normalize(title).replace(/\s*\([^)]*\)\s*$/, '');
    return name ? name + ' ' : '';
  }

  // ------------------------------------------------ מספר שפתוח באוצריא

  /** כמה הפניות לנסות, מהמדויקת ועד הכללית (כל ניסיון כשלוש שניות). */
  const MAX_READER_REFS = 3;

  /**
   * מילים שבר אילן מוסיף לשם המקור (`תלמוד בבלי מסכת ברכות`) ואינן מבדילות
   * בין ספר לפירושו. מילה אחרי "פרשת" היא שם הפרשה, וגם היא אינה מבדילה.
   */
  const NEUTRAL_WORDS = ['תלמוד', 'בבלי', 'מסכת', 'ספר', 'תורה', 'נביאים', 'כתובים', 'פרשת'];

  /** מילה שפותחת את המקום בתוך שם המקור (`... מסכת ברכות דף ב`). */
  const PLACE_WORDS = ['פרק', 'פסוק', 'דף', 'עמוד', 'סימן', 'סעיף', 'הלכה', 'משנה', 'אות'];

  /** מילה להשוואה: בלי גרשיים ובלי אותיות סופיות. */
  function wordKey(word) {
    return word
      .replace(/["']/g, '')
      .replace(/ך/g, 'כ')
      .replace(/ם/g, 'מ')
      .replace(/ן/g, 'נ')
      .replace(/ף/g, 'פ')
      .replace(/ץ/g, 'צ');
  }

  const NEUTRAL = new Set(NEUTRAL_WORDS.map(wordKey));
  const PLACE = new Set(PLACE_WORDS.map(wordKey));
  const PARASHA = wordKey('פרשת');

  function words(text) {
    return normalize(text)
      .split(' ')
      .map(wordKey)
      .filter((word) => LETTER.test(word));
  }

  /**
   * שם ספר של אוצריא בצורה שבר אילן מכיר: `רש"י על בראשית` ← `רש"י בראשית`,
   * `משנה תורה, הלכות שבת` ← `רמב"ם הלכות שבת`. סוגריים בסוף (מהדורה) נמחקים.
   */
  function readerBook(title) {
    return normalize(title)
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/[,;]/g, ' ')
      .replace(/^משנה תורה(?= |$)/, 'רמב"ם')
      .replace(/ על /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** מילה שפותחת כותרת של מקום (`סימן לב`, `דף ב.`), ואחריה מספר. */
  const HEADING_START = /^(פרק|פסוק|דף|עמוד|סימן|סעיף|ס"ק|הלכה|משנה|שער|אות|כלל|מאמר|פרשה|חלק|תשובה) \S+/;

  /** מקף עם רווחים מפריד בין המקום לתיאור (`סימן לב - ראובן שלח…`). */
  const DESCRIPTION = /\s[-–—]\s/;

  /** כותרת שאינה מקום (`הלכות שבת`, `אורח חיים`) נחתכת: שם, לא משפט. */
  const MAX_HEADING_WORDS = 4;

  /**
   * כותרת אחת מהמקום באוצריא ← החלק שבר אילן מבין: תיאור אחרי מקף נמחק,
   * וגם סוגריים עגולים (סוגריים מרובעים — רק הסימנים: `סימן [ב]`); כותרת של מקום נשארת מילה ומספר (`סימן לב`); דף
   * בנקודה או בנקודתיים הופך לעמוד (`דף ב:` ← `דף ב עמוד ב`).
   */
  function readerHeading(heading) {
    let text = normalize(heading)
      .split(DESCRIPTION)[0]
      .replace(/\[([^\]]*)\]/g, '$1')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const amud = text.match(/^דף\s+([א-ת"']+)\s*([.:])$/);
    if (amud) return 'דף ' + amud[1] + ' עמוד ' + (amud[2] === '.' ? 'א' : 'ב');
    text = text
      .replace(/ ע"א$/, ' עמוד א')
      .replace(/ ע"ב$/, ' עמוד ב')
      .replace(/[.,;:]+$/, '')
      .trim();
    const place = text.match(/^(?:דף \S+ עמוד [אב]|(?:פרק|פסוק|דף|עמוד|סימן|סעיף|ס"ק|הלכה|משנה|שער|אות|כלל|מאמר|פרשה|חלק|תשובה) \S+)/);
    if (place) text = place[0].replace(/[.,;:]+$/, '');
    else text = text.split(' ').slice(0, MAX_HEADING_WORDS).join(' ');
    return LETTER.test(text) ? text : '';
  }

  /**
   * `currentRef` של אוצריא ← כותרות. אוצריא מחברת את הכותרות ב-", ", אבל
   * יש כותרות שהתיאור שלהן מכיל פסיקים (`סימן לב - ראובן…, והסחורה…`).
   * לכן חתיכה שבאה אחרי תיאור, ואינה פותחת במילת מקום, היא המשך התיאור.
   */
  function splitPlace(place) {
    const headings = [];
    let inDescription = false;
    for (const piece of String(place || '').split(',')) {
      const text = piece.trim();
      if (!text) continue;
      if (inDescription && !HEADING_START.test(normalize(text))) continue;
      headings.push(text);
      inDescription = DESCRIPTION.test(' ' + text + ' ');
    }
    return headings;
  }

  /**
   * הכותרות של שורה [index] לפי תוכן העניינים של אוצריא (`library.getBookToc`:
   * `[{text, index, level}]` בסדר הספר), כמו `refFromTocList` באוצריא: לכל
   * רמה הכותרת האחרונה שלפני השורה. כך המקום הוא של השורה שסומנה, ולא של
   * השורה הראשונה במסך (`currentRef`).
   */
  function headingsAt(toc, index) {
    if (!Array.isArray(toc) || !Number.isInteger(index) || index < 0) return null;
    const levels = [];
    for (const entry of toc) {
      if (!entry || typeof entry.text !== 'string' || !Number.isInteger(entry.index)) continue;
      if (entry.index > index) break;
      if (!Number.isInteger(entry.level) || entry.level <= 0 || entry.level > 20) continue;
      while (levels.length < entry.level - 1) levels.push('');
      levels[entry.level - 1] = entry.text;
      levels.length = entry.level;
    }
    const headings = levels.map((text) => text.trim()).filter(Boolean);
    return headings.length ? headings : null;
  }

  /**
   * המקום בספר שפתוח באוצריא ← הפניות לבר אילן, מהמדויקת ועד הכללית: אם
   * "סימן א סעיף ב" לא נמצא, מנסים "סימן א". [place] — כותרות (`headingsAt`),
   * או `currentRef` של לחיצה ימנית. `null` כשאין שם ספר; `refs` ריק כשאין
   * מקום, או כששם הספר אינו בעברית.
   *
   * כותרת שהיא שם הספר עצמו (`בראשית, פרק ב`) נמחקת, וכך גם פרשה: בר אילן
   * ממספר פרקים בלי קשר לפרשה.
   */
  function fromReader(book, place) {
    const title = readerBook(book);
    if (!title) return null;
    if (!LETTER.test(title)) return { title, refs: [] };
    const own = new Set(words(title));
    const parts = (Array.isArray(place) ? place : splitPlace(place))
      .map(readerHeading)
      .filter(
        (part) =>
          part && !part.startsWith('פרשת ') && !words(readerBook(part)).every((word) => own.has(word)),
      );
    const refs = [];
    for (let count = parts.length; count > 0 && refs.length < MAX_READER_REFS; count--) {
      const ref = normalize(title + ' ' + parts.slice(0, count).join(' '));
      // ארוכה מהמותר: הייתה נחתכת באמצע מילה. הכללית שאחריה קצרה יותר.
      if (ref.length >= MAX_LENGTH || refs.includes(ref)) continue;
      refs.push(ref);
    }
    return { title, refs };
  }

  /**
   * המקורות שבר אילן מצא, לפי ההתאמה לספר שפתוח באוצריא. `preferred` —
   * המקורות שכל מילות שם הספר בהם, מהקרוב ביותר; `best` — מקור יחיד שבשמו
   * (עד המקום) אין שום מילה מעבר לספר, להפניה ולמילים כלליות (`תלמוד בבלי
   * מסכת`), או `null`. כך `ברכות` בוחר את הגמרא ולא את רש"י, ו`רש"י ברכות`
   * את רש"י.
   */
  function rankChoices(choices, title, ref) {
    const own = words(title);
    const known = new Set([...own, ...words(ref)]);
    const scored = [];
    (Array.isArray(choices) ? choices : []).forEach((choice, index) => {
      const tokens = words(choice);
      const present = new Set(tokens);
      if (!own.every((word) => present.has(word))) return;
      const placeAt = tokens.findIndex((word, i) => i > 0 && PLACE.has(word));
      const name = placeAt === -1 ? tokens : tokens.slice(0, placeAt);
      let extra = 0;
      name.forEach((word, i) => {
        if (known.has(word) || NEUTRAL.has(word) || name[i - 1] === PARASHA) return;
        extra++;
      });
      scored.push({ index, extra });
    });
    scored.sort((a, b) => a.extra - b.extra || a.index - b.index);
    const exact = scored.filter((entry) => entry.extra === 0);
    return {
      preferred: scored.map((entry) => entry.index),
      best: exact.length === 1 ? exact[0].index : null,
    };
  }

  /** סדר ההצגה: המועדפים קודם, ואחריהם השאר בסדר של בר אילן. */
  function displayOrder(count, preferred) {
    const first = (Array.isArray(preferred) ? preferred : []).filter((index) => index < count);
    const chosen = new Set(first);
    const rest = [];
    for (let index = 0; index < count; index++) if (!chosen.has(index)) rest.push(index);
    return [...first, ...rest];
  }

  const api = {
    MAX_LENGTH,
    MAX_HISTORY,
    MAX_READER_REFS,
    EXAMPLES,
    normalize,
    validate,
    remember,
    startFrom,
    headingsAt,
    fromReader,
    fromSelection,
    rankChoices,
    displayOrder,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaLocate = api;
})(typeof self !== 'undefined' ? self : globalThis);
