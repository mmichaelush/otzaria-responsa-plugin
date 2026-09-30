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

  class Log {
    /** @param options `{ console, now, max }` להחלפה בבדיקות. */
    constructor(options) {
      const opts = options || {};
      this.console = opts.console === undefined ? root.console : opts.console;
      this.now = opts.now || (() => Date.now());
      this.max = opts.max || MAX_ENTRIES;
      this.list = [];
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
      if (this.list.length > this.max) this.list.splice(0, this.list.length - this.max);
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
     * היומן כטקסט, שורה לכל רשומה. `{ limit, minLevel, forReport }`:
     * forReport מקצר נתיבים של תיקיות משתמש.
     */
    text(options) {
      const opts = options || {};
      let entries = this.entries(opts.minLevel);
      if (opts.limit) entries = entries.slice(-opts.limit);
      const lines = entries.map(
        (entry) =>
          clock(entry.time) +
          ' ' +
          entry.level.toUpperCase().padEnd(5) +
          ' ' +
          entry.message +
          (entry.detail ? ' — ' + entry.detail : ''),
      );
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
    }
  }

  /** יומן אחד לכל דף (הלשונית, או מנוע הרקע). */
  const shared = new Log();

  const api = { LEVELS, MAX_ENTRIES, Log, shared, scrub, describe, clock };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaLog = api;
})(typeof self !== 'undefined' ? self : globalThis);
