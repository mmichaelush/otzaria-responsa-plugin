// ייבוא ההערות האישיות של בר אילן לאוצריא: ההחלטות בלבד, בלי DOM, SDK וטיימרים.
// הקריאה מהשירות והכתיבה לאוצריא ב-responsa-notes-flow.js.
//
// מה מיובא ולאן: הערה בבר אילן מוצמדת למילה בספר של בר אילן, וקואורדינטות
// המיקום שלה אינן מזהות ספר באוצריא. מה שכן משותף הוא "מראה המקום" (`source`),
// שנכתב כמו הפניה ("ברכות דף ב עמוד א"). אותו מפענח "איתור מקורות" של אוצריא
// (`library.resolveRef`), והערה מיובאת רק כשהוא מזהה את הספר בוודאות
// (`Locate.otzariaHit`); כל השאר נשארות בבר אילן, עם הסיבה. הערה שמוצמדת
// לכותרת (פרק, דף) ולא לשורה מדויקת מסומנת כך, והמשתמש רואה כמה כאלה יש
// לפני שמאשר.
(function (root) {
  'use strict';

  const I18n = root.ResponsaI18n;
  const Locate = root.ResponsaLocate;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /**
   * השורה הראשונה בכל הערה מיובאת. אינה משתנה: היא מה שהמשתמש מחפש כדי לראות
   * מה הגיע מבר אילן.
   */
  const MARKER = 'יובא מבר אילן';

  /** כמה הערות בעמוד אחד ברשימה, וכמה נקראות בבקשה אחת מהשירות. */
  const PAGE_SIZE = 50;
  const FETCH_SIZE = 200;

  /** כמה בקשות `library.resolveRef` רצות במקביל בבדיקה. */
  const CHECK_CONCURRENCY = 4;

  /** מראה מקום ארוך מזה אינו הפניה אלא טקסט, ו-`resolveRef` אינו נועד לו. */
  const MAX_PLACE_LENGTH = 200;

  /** סיבות שבגללן הערה אינה מיובאת. */
  const Reason = Object.freeze({
    noPlace: 'noPlace',
    notFound: 'notFound',
    unsure: 'unsure',
    failed: 'failed',
  });

  const REASON_LABELS = Object.freeze({
    [Reason.noPlace]: N('אין להערה מראה מקום'),
    [Reason.notFound]: N('אוצריא לא מצאה את המקום'),
    [Reason.unsure]: N('אוצריא לא בטוחה איזה ספר'),
    [Reason.failed]: N('הקריאה לאוצריא נכשלה'),
  });

  function reasonLabel(reason) {
    return t(REASON_LABELS[reason] || REASON_LABELS[Reason.failed]);
  }

  /**
   * מראה המקום של הערה כהפניה ש"איתור מקורות" מבין, או `null`. בר אילן כותבת
   * `בבלי ברכות ב, א` ו-`שולחן ערוך אורח חיים א, א` (נמדד חי): הפסיקים הופכים
   * לרווחים, והתווית "בבלי" נשמטת, כי באוצריא זה שם הספר ("ברכות") ולא תווית.
   * בגמרא נוספת המילה "דף" (`ברכות דף ב א`): בלעדיה דף בן אות אחת ("ב א")
   * אינו מזוהה כציטוט גמרא ב"איתור מקורות" ועלול להיקרא כפרק ומשנה (בקוד של
   * אוצריא, `queryLooksDafCitation` דורש "דף" או מספר דף של 2–4 אותיות).
   */
  function placeOf(note) {
    let text = String((note && note.source) || '')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const bavli = /^בבלי\s+/.test(text);
    text = text.replace(/^בבלי\s+/, '');
    // מסכת, דף ועמוד: "ברכות ב א" ← "ברכות דף ב א".
    if (bavli) text = text.replace(/^(.+\S)\s+(\S+)\s+([אב])$/, '$1 דף $2 $3');
    return text.length >= 2 && text.length <= MAX_PLACE_LENGTH ? text : null;
  }

  /** `9.11.2026` ← `2026-11-09`; תאריך בצורה אחרת כמות שהוא. */
  function displayDate(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    return match ? Number(match[3]) + '.' + Number(match[2]) + '.' + match[1] : date || '';
  }

  /** התוכן שנכתב באוצריא: סימון מקור, כותרת, המילה שההערה מוצמדת אליה, והגוף. */
  function contentFor(note) {
    const head = note.date ? MARKER + ' · ' + displayDate(note.date) : MARKER;
    const lines = [head];
    // בר אילן מציעה כותרת ברירת מחדל מהמילים שסומנו: אין טעם לכתוב אותן פעמיים.
    if (note.title && note.title.trim() !== (note.quote || '').trim()) lines.push(note.title);
    if (note.quote) lines.push('«' + note.quote + '»');
    if (note.text) lines.push('', note.text);
    return lines.join('\n');
  }

  /**
   * שני FNV-1a ב-32 ביט עם ערכי פתיחה שונים, בהקסה (64 ביט): קצר, יציב, ואינו
   * אבטחה. 32 ביט לבדם נתנו התנגשות אחת מכל כמה אלפי הערות בקירוב, והתנגשות
   * הייתה מדלגת בשקט על הערה.
   */
  function hash(text) {
    let first = 0x811c9dc5;
    let second = 0x9747b28c;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      first = Math.imul(first ^ code, 0x01000193) >>> 0;
      second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
    }
    return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
  }

  /** מה שמזהה הערה שנכתבה באוצריא: התוכן והשורה. */
  function noteKey(content, lineNumber) {
    return hash(content) + '@' + lineNumber;
  }

  /**
   * זהות הערה בין ריצות: התוכן שלה, ולא מספר. מספר השורה בשירות משתנה אם בר
   * אילן מדחסת את הקובץ, ו-`id` שלה מתחיל מ-1 לכל מחבר. שתי הערות זהות לגמרי
   * (אותו מקום, אותו טקסט, אותו תאריך) הן כפילות: שתיהן מקבלות את אותה חתימה,
   * והייבוא כותב רק אחת (הוא בודק מה כבר קיים לפני כל כתיבה).
   */
  function signature(note) {
    return hash([note.text, note.source, note.quote, note.title, note.date].join('\u0001'));
  }

  /**
   * מה אוצריא ענתה ל-`library.resolveRef` עבור [note], או הסיבה שאין מה
   * לבדוק. `{ status: 'matched', hit, precision }` כש-`precision` הוא `line`
   * (שורת מקור מדויקת) או `section` (כותרת: פרק או דף).
   */
  function resolution(note, hits) {
    const place = placeOf(note);
    if (!place) return { status: 'unmatched', reason: Reason.noPlace };
    if (!Array.isArray(hits) || !hits.length) return { status: 'unmatched', reason: Reason.notFound };
    const hit = Locate.otzariaHit(place, hits);
    if (!hit || !Number.isInteger(hit.index) || hit.index < 0) {
      return { status: 'unmatched', reason: Reason.unsure };
    }
    // PDF (גם מהספרייה): `index` הוא מספר עמוד ולא שורה, ואין בו הערות שורה.
    if (hit.isPdf === true || hit.isUserBook === true || hit.type === 'pdf') {
      return { status: 'unmatched', reason: Reason.unsure };
    }
    return { status: 'matched', hit, precision: hit.isSourceLine ? 'line' : 'section' };
  }

  /** ההערה ב-`notes.add`: המספר של אוצריא הוא של שורה, ומבוסס־1. */
  function addRequest(item) {
    const { hit } = item.resolution;
    return {
      ...(hit.bookUid ? { bookUid: hit.bookUid } : { bookId: hit.bookId }),
      lineNumber: hit.index + 1,
      content: contentFor(item.note),
    };
  }

  /** הספרות של הבדיקה, למסך: כמה נמצא להן מקום, ובאיזו דיוק, וכמה לא ולמה. */
  function summarize(items) {
    const counts = { total: items.length, matched: 0, line: 0, section: 0, imported: 0, unmatched: {} };
    for (const item of items) {
      if (item.imported) {
        counts.imported += 1;
      } else if (item.resolution.status === 'matched') {
        counts.matched += 1;
        counts[item.resolution.precision] += 1;
      } else {
        const reason = item.resolution.reason;
        counts.unmatched[reason] = (counts.unmatched[reason] || 0) + 1;
      }
    }
    counts.skipped = Object.values(counts.unmatched).reduce((sum, value) => sum + value, 0);
    return counts;
  }

  // ----------------------------------------------------------- יומן ייבוא

  /**
   * היומן: מה יובא ולאן, כדי שייבוא חוזר לא יכפיל הערות ושאפשר יהיה לבטל.
   * שורה: `[חתימה, ספר, שורה, בדיקת תוכן]`. נשמר בצורה קומפקטית, כי אלפי
   * הערות הן מאות קילובייט.
   */
  function normalizeLedger(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (row) =>
        Array.isArray(row) &&
        row.length === 4 &&
        typeof row[0] === 'string' &&
        typeof row[1] === 'string' &&
        Number.isInteger(row[2]) &&
        typeof row[3] === 'string',
    );
  }

  function importedSignatures(ledger) {
    return new Set(ledger.map((row) => row[0]));
  }

  /** שורת יומן להערה שנכתבה ל-[request] (גוף `notes.add`). */
  function ledgerRow(note, request) {
    return [signature(note), request.bookUid || request.bookId, request.lineNumber, hash(request.content)];
  }

  /**
   * הספר של שורת יומן, כפרמטרים של `notes.*`. אוצריא פותרת `bookUid` לספר, ואם
   * הוא אינו מזהה כזה — משתמשת ב-`bookId`; השורה שומרת רק אחד משניהם, ולכן
   * שולחים אותו בשני השדות.
   */
  function bookKey(row) {
    return { bookUid: row[1], bookId: row[1] };
  }

  /**
   * ההערות שאפשר למחוק בביטול: אלה שנמצאות עדיין, באותה שורה ובתוכן שנכתב.
   * הערה שהמשתמש ערך כבר אינה שלנו, ונשארת. [existing] — `notes.list` של הספר.
   */
  function undoTargets(row, existing) {
    return (Array.isArray(existing) ? existing : []).filter(
      (note) =>
        note &&
        typeof note.content === 'string' &&
        hash(note.content) === row[3] &&
        (!Number.isInteger(note.lineNumber) || note.lineNumber === row[2]),
    );
  }

  const api = {
    MARKER,
    PAGE_SIZE,
    FETCH_SIZE,
    CHECK_CONCURRENCY,
    MAX_PLACE_LENGTH,
    Reason,
    reasonLabel,
    placeOf,
    displayDate,
    contentFor,
    hash,
    noteKey,
    signature,
    resolution,
    addRequest,
    summarize,
    normalizeLedger,
    importedSignatures,
    ledgerRow,
    bookKey,
    undoTargets,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaNotes = api;
})(typeof self !== 'undefined' ? self : globalThis);
