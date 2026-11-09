// "ביוגרפיה" בפרטי ספר: המאמר שבר אילן מציגה ב"כלים ← ביוגרפיה", לבקשת
// המשתמש, ספר אחד בכל פעם. בקר קטן משלו: למצב הזה (בקשה ארוכה, תוצאה "יש",
// "אין" או כשל) אין קשר לשאר המסך. הציור ב-responsa-biography-ui.js.
//
// וגם "קריאת כל הביוגרפיות": הפעלה וסטטוס של הקריאה ברקע שהשירות מריץ (בהגדרות).
// היא לא מתחילה לבד אף פעם; כאן רק מפעילים, עוצרים ועוקבים אחריה.
(function (root) {
  'use strict';

  /** תשובות שכבר הגיעו (כולל "אין ביוגרפיה"), כדי שפתיחה שנייה לא תמתין. */
  const CACHE_LIMIT = 50;

  /** כל כמה זמן שואלים את השירות מה מצב הקריאה ברקע. */
  const POLL_MS = 4000;

  /** בר אילן עסוקה (מאמר אחר נקרא ברקע, או ספר נפתח): מנסים שוב מעט. */
  const BUSY_RETRIES = 3;
  const BUSY_WAIT_MS = 2500;

  class BiographyFlow {
    /** @param deps `{ service, log, changed, schedule?, cancel? }` */
    constructor(deps) {
      this.service = deps.service;
      this.log = deps.log;
      this.changed = deps.changed || (() => {});
      // ניתנים להחלפה בבדיקות. הטיימר אינו מחזיק תהליך חי (Node), ובדפדפן אין unref.
      this._schedule =
        deps.schedule ||
        ((fn, ms) => {
          const handle = setTimeout(fn, ms);
          if (handle && typeof handle.unref === 'function') handle.unref();
          return handle;
        });
      this._cancel = deps.cancel || clearTimeout;
      /**
       * `key` — הספר שמוצג. `result` — תשובת השירות (`found`, `heading`, `text`);
       * `error` — כשל, כמו שהשירות דיווח (`code`, `message`).
       * `harvest` — מצב "קריאת כל הביוגרפיות" כמו שהשירות דיווח (`state`, `total`,
       * `stored`, `failed`, `current`, `message`), או `null` כשעוד לא נשאל.
       * `harvestBusy` — הפעלה או עצירה בדרך; `harvestError` — הכשל האחרון.
       */
      this.state = {
        key: null,
        loading: false,
        result: null,
        error: null,
        harvest: null,
        harvestBusy: false,
        harvestError: null,
      };
      this._cache = new Map();
      this._pollTimer = null;
    }

    /** "ביוגרפיה": מבקש את המאמר של [book], או מציג את מה שכבר הגיע. */
    async show(book) {
      const state = this.state;
      if (state.loading) return;
      state.key = book.key;
      state.error = null;
      const cached = this._cache.get(book.key);
      if (cached) {
        state.result = cached;
        this.changed();
        return;
      }
      state.result = null;
      state.loading = true;
      this.changed();
      try {
        const result = await this._readWithRetry(book.key);
        this._remember(book.key, result);
        // המשתמש עבר בינתיים לספר אחר או סגר: התשובה אינה שלו עוד.
        if (state.key === book.key) state.result = result;
        this.log.info('ביוגרפיה: ' + book.title + (result.found ? '' : ' — אין'));
      } catch (error) {
        this.log.warn('קריאת הביוגרפיה נכשלה', error);
        if (state.key === book.key) state.error = error;
      } finally {
        state.loading = false;
        this.changed();
      }
    }

    /**
     * קריאה אחת. כשבר אילן עסוקה ברגע הזה (למשל קוראת ברקע מאמר אחר) מנסים שוב
     * כמה פעמים, ורק אז מראים שגיאה: המשתמש לא ביקש לחכות, והעסוקה חולפת.
     */
    async _readWithRetry(key) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.service.biography(key);
        } catch (error) {
          if (!error || error.code !== 'busy' || attempt >= BUSY_RETRIES) throw error;
          await new Promise((resolve) => this._schedule(resolve, BUSY_WAIT_MS));
        }
      }
    }

    // ---------------------------------------------------- קריאת כל הביוגרפיות

    /** מה מצב הקריאה ברקע (לא מפעיל שום דבר, ולא פונה לבר אילן). */
    loadHarvest() {
      return this._harvest('status');
    }

    /** "התחלה": הקריאה ברקע מתחילה, ועוצרת כשהמשתמש מבקש או כשהכול נשמר. */
    startHarvest() {
      return this._harvest('start');
    }

    /** "עצירה": עוצרת אחרי המאמר הנוכחי; ההמשך מאותו מקום. */
    stopHarvest() {
      return this._harvest('stop');
    }

    /** עוצר את המעקב (התוסף נסגר או הוסתר). הקריאה עצמה ממשיכה בשירות. */
    stopPolling() {
      if (this._pollTimer !== null) this._cancel(this._pollTimer);
      this._pollTimer = null;
    }

    async _harvest(action) {
      const state = this.state;
      if (state.harvestBusy) return;
      state.harvestBusy = true;
      this.changed();
      await this._askHarvest(action);
      state.harvestBusy = false;
      this.changed();
    }

    /** שואל את השירות, מעדכן את המצב, ואם הקריאה רצה — קובע מתי לשאול שוב. */
    async _askHarvest(action) {
      const state = this.state;
      this.stopPolling();
      try {
        state.harvest = await this.service.biographyHarvest(action);
        state.harvestError = null;
        if (action !== 'status') this.log.info('ביוגרפיות: ' + action + ' — ' + state.harvest.state);
      } catch (error) {
        this.log.warn('קריאת הביוגרפיות נכשלה', error);
        state.harvestError = error;
      }
      if (state.harvest && state.harvest.state === 'running') {
        this._pollTimer = this._schedule(() => this._poll(), POLL_MS);
      }
    }

    async _poll() {
      this._pollTimer = null;
      await this._askHarvest('status');
      this.changed();
    }

    /** "סגירה". */
    close() {
      const state = this.state;
      if (state.loading) return;
      state.key = null;
      state.result = null;
      state.error = null;
      this.changed();
    }

    /** האם הלוח מציג משהו על [book]. */
    isShown(book) {
      return this.state.key === book.key;
    }

    _remember(key, result) {
      this._cache.set(key, result);
      if (this._cache.size > CACHE_LIMIT) this._cache.delete(this._cache.keys().next().value);
    }
  }

  const api = { BiographyFlow, CACHE_LIMIT, POLL_MS, BUSY_RETRIES, BUSY_WAIT_MS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaBiographyFlow = api;
})(typeof self !== 'undefined' ? self : globalThis);
