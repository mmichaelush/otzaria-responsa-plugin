// יומן הפעולות של התוסף: מה קרה, מתי ובאיזה קוד שגיאה. נשמר בזיכרון בלבד
// (עד MAX_ENTRIES רשומות), מוצג ב"עזרה ← מצב המערכת" ומצורף לדיווח על בעיה.
// רשומות info ומעלה מועתקות גם ל-console, ושם אוצריא כותבת אותן ליומן שלה
// (`Plugin [com.otzaria-responsa]: ...`) — כך אפשר לדבג גם מנוע רקע בלי מסך.
(function (root) {
  'use strict';

  const LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);
  const MAX_ENTRIES = 200;
  const MAX_TEXT = 400;
  const PREFIX = '[responsa] ';

  /**
   * רשומות info ומעלה הראשונות בהפעלה (גרסאות, השירות שנמצא, המסך הראשון)
   * נשמרות גם כשהיומן מתמלא: בלעדיהן אי אפשר לקרוא את שאר הדיווח.
   */
  const STARTUP_ENTRIES = 4;

  /** מחזור ארוך יותר אינו "אותה בדיקה שחוזרת", ולא מקפלים אותו. */
  const MAX_CYCLE = 4;

  /** I18n נטען לפני היומן; בלעדיו — עברית, עם המשתנים. */
  function t(text, vars) {
    if (root.ResponsaI18n) return root.ResponsaI18n.t(text, vars);
    return String(text).replace(/\{(\w+)\}/g, (match, name) =>
      vars && name in vars ? String(vars[name]) : match,
    );
  }

  /**
   * נתיב בתיקיית משתמש מסגיר את שם המשתמש ב-Windows. הדיווח מבטיח "בלי
   * נתיבים", ולכן כל נתיב כזה מקוצר לפני שהוא יוצא מהמחשב. שם משתמש יכול
   * לכלול רווח ("Moshe Cohen"), ולכן החיתוך הוא עד המפריד הבא ולא עד רווח:
   * מוטב לקצר מעט יותר מדי מאשר לשלוח חצי שם.
   */
  function scrub(text) {
    return String(text)
      .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/"'<>|\r\n]+/gi, '$1…')
      .replace(/(file:\/\/\/[A-Za-z]:\/Users\/)[^/"'\r\n]+/gi, '$1…');
  }

  function clip(text) {
    const value = String(text);
    return value.length > MAX_TEXT ? value.slice(0, MAX_TEXT - 1) + '…' : value;
  }

  /** שגיאה בשורה אחת: סוג, קוד והודעה. אובייקט אחר — JSON מקוצר. */
  function describe(detail) {
    if (detail === undefined || detail === null) return '';
    if (detail instanceof Error || (detail && typeof detail.message === 'string')) {
      const code = detail.code ? ' [' + detail.code + ']' : '';
      return (detail.name || 'Error') + code + ': ' + detail.message;
    }
    if (typeof detail === 'string') return detail;
    try {
      return JSON.stringify(detail);
    } catch (_) {
      return String(detail);
    }
  }

  function two(value) {
    return String(value).padStart(2, '0');
  }

  function clock(time) {
    const date = new Date(time);
    return two(date.getHours()) + ':' + two(date.getMinutes()) + ':' + two(date.getSeconds());
  }

  function format(entry) {
    return (
      clock(entry.time) +
      ' ' +
      entry.level.toUpperCase().padEnd(5) +
      ' ' +
      entry.message +
      (entry.detail ? ' — ' + entry.detail : '')
    );
  }

  /** מה שמשווים בין רשומות: בלי השעה ובלי משכי זמן כמו `(21ms)`. */
  function sameness(entry) {
    return (entry.level + ' ' + entry.message + ' — ' + entry.detail).replace(/\s*\(\d+ms\)/g, '');
  }

  function repeatLine(size, repeats, time) {
    const vars = { lines: size, count: repeats, time: clock(time) };
    let text;
    if (size === 1) text = t('השורה שלמעלה חזרה עוד {count} פעמים, עד {time}', vars);
    else if (repeats === 1) text = t('{lines} השורות שלמעלה חזרו עוד פעם אחת, עד {time}', vars);
    else text = t('{lines} השורות שלמעלה חזרו עוד {count} פעמים, עד {time}', vars);
    return '   ↻ ' + text;
  }

  /**
   * שורות היומן, כשחזרה מחזורית מקופלת: גוש של 1–4 רשומות שחוזר מיד (בדיקה
   * תקופתית שנכשלת כל 10 שניות) נשאר פעם אחת, ואחריו שורה שאומרת כמה פעמים
   * חזר ועד מתי. בלי זה המחזור דוחק מהדיווח את כל השאר.
   */
  function compactLines(entries) {
    const keys = entries.map(sameness);
    const repeatsAt = (from, size) => {
      let repeats = 0;
      for (let at = from + size; at + size <= keys.length; at += size) {
        let same = true;
        for (let k = 0; k < size && same; k++) same = keys[from + k] === keys[at + k];
        if (!same) break;
        repeats++;
      }
      return repeats;
    };
    const lines = [];
    let i = 0;
    while (i < entries.length) {
      // הגוש שמכסה הכי הרבה שורות; בשוויון — הקצר.
      let best = null;
      for (let size = 1; size <= MAX_CYCLE; size++) {
        const repeats = repeatsAt(i, size);
        // שורת סיכום במקום שורה אחת אינה קיצור.
        if (repeats * size < 2) continue;
        if (!best || repeats * size > best.repeats * best.size) best = { size, repeats };
      }
      if (!best) {
        lines.push(format(entries[i++]));
        continue;
      }
      for (let k = 0; k < best.size; k++) lines.push(format(entries[i + k]));
      i += (best.repeats + 1) * best.size;
      lines.push(repeatLine(best.size, best.repeats, entries[i - 1].time));
    }
    return lines;
  }

  class Log {
    /** @param options `{ console, now, max, startup }` להחלפה בבדיקות. */
    constructor(options) {
      const opts = options || {};
      this.console = opts.console === undefined ? root.console : opts.console;
      this.now = opts.now || (() => Date.now());
      this.max = opts.max || MAX_ENTRIES;
      this.startupMax = Math.min(opts.startup === undefined ? STARTUP_ENTRIES : opts.startup, this.max - 1);
      this.list = [];
      /** רשומות ההפעלה, שאינן נדחקות החוצה. */
      this.pinned = new Set();
      this.listeners = new Set();
    }

    debug(message, detail) {
      return this.record('debug', message, detail);
    }

    info(message, detail) {
      return this.record('info', message, detail);
    }

    warn(message, detail) {
      return this.record('warn', message, detail);
    }

    error(message, detail) {
      return this.record('error', message, detail);
    }

    record(level, message, detail) {
      const text = String(message).startsWith(PREFIX)
        ? String(message).slice(PREFIX.length)
        : String(message);
      const entry = Object.freeze({
        time: this.now(),
        level: LEVELS.includes(level) ? level : 'info',
        message: clip(text),
        detail: clip(describe(detail)),
      });
      this.list.push(entry);
      if (entry.level !== 'debug' && this.pinned.size < this.startupMax) {
        this.pinned.add(entry);
      }
      while (this.list.length > this.max) {
        this.list.splice(this.list.findIndex((item) => !this.pinned.has(item)), 1);
      }
      this._mirror(entry, detail);
      for (const listener of this.listeners) {
        try {
          listener(entry);
        } catch (_) {
          // יומן שזורק היה מסתיר את השגיאה המקורית.
        }
      }
      return entry;
    }

    /** debug נשאר בזיכרון: הבדיקות התקופתיות היו מציפות את היומן של אוצריא. */
    _mirror(entry, detail) {
      const target = this.console;
      if (!target || entry.level === 'debug') return;
      const write = target[entry.level] || target.log;
      if (typeof write !== 'function') return;
      if (detail === undefined) write.call(target, PREFIX + entry.message);
      else write.call(target, PREFIX + entry.message, detail);
    }

    /** [minLevel] — סינון, למשל `info` לתצוגה בדף. */
    entries(minLevel) {
      const floor = Math.max(0, LEVELS.indexOf(minLevel || 'debug'));
      return this.list.filter((entry) => LEVELS.indexOf(entry.level) >= floor);
    }

    /**
     * היומן כטקסט, שורה לכל רשומה. `{ limit, minLevel, forReport, compact,
     * startup }`: forReport מקצר נתיבים של תיקיות משתמש; compact מקפל חזרה
     * מחזורית (`compactLines`); startup `true` — רק רשומות ההפעלה, `false` —
     * בלעדיהן.
     */
    text(options) {
      const opts = options || {};
      let entries = this.entries(opts.minLevel);
      if (typeof opts.startup === 'boolean') {
        entries = entries.filter((entry) => this.pinned.has(entry) === opts.startup);
      }
      if (opts.limit) entries = entries.slice(-opts.limit);
      const lines = opts.compact ? compactLines(entries) : entries.map(format);
      const text = lines.join('\n');
      return opts.forReport ? scrub(text) : text;
    }

    /** מאזין לכל רשומה חדשה; מחזיר פונקציית ביטול. */
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    clear() {
      this.list = [];
      this.pinned.clear();
    }
  }

  /** יומן אחד לכל דף (הלשונית, או מנוע הרקע). */
  const shared = new Log();

  const api = { LEVELS, MAX_ENTRIES, Log, shared, scrub, describe, clock, compactLines };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaLog = api;
})(typeof self !== 'undefined' ? self : globalThis);
