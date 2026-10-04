// מה שהלשונית עושה מול אוצריא ולא מול המסך: שליחת רשימת הספרים לחיפוש
// הספרייה, שמירת הפורט של השירות, כותרות פריטי התפריט בשפה הנוכחית, והבאת
// הלשונית לחזית אחרי קיצור מקלדת. "חיפוש בבר אילן" בלחיצה ימנית ופתיחה מחיפוש הספרייה אינם
// כאן: אוצריא פונה בהם לשירות בעצמה (`localService.post` במניפסט), בלי
// להעיר את התוסף.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const { KEYS } = root.ResponsaSettings;
  const t = (text, vars) => I18n.t(text, vars);

  /** אחרי כשל בשליחת הרשימה: לא לנסות שוב בכל רענון (כמיליון בייטים). */
  const LIBRARY_RETRY_MS = 10 * 60 * 1000;

  class Engine {
    /**
     * @param runtime  responsa-runtime.js.
     * @param service  `ServiceClient` מ-responsa-service.js.
     * @param options  `{ permissions, pluginVersion, now, log }`, מ-`plugin.boot`.
     */
    constructor(runtime, service, options) {
      const opts = options || {};
      this.runtime = runtime;
      this.service = service;
      this.permissions = opts.permissions || null;
      this.pluginVersion = opts.pluginVersion || null;
      this.now = opts.now || (() => Date.now());
      this.log = opts.log || (root.ResponsaLog && root.ResponsaLog.shared) || console;
      this.syncing = null;
      /** ה-`enabled` של השליחה שרצה עכשיו (`syncing`). */
      this.syncingEnabled = null;
      this.syncFailedAt = null;
      /** מה שכבר נשמר בהפעלה הזו: פורט, `null` כשנמחק, `undefined` — עוד לא. */
      this.savedPort = undefined;
    }

    /**
     * הרשאה שהודלקה עשויה להיות בדיוק מה שהכשיל את השליחה הקודמת, ולכן
     * שינוי הרשאות מבטל את ההמתנה שאחרי כשל.
     */
    setPermissions(permissions) {
      if (!Array.isArray(permissions)) return;
      const before = (this.permissions || []).slice().sort().join('\n');
      this.permissions = permissions;
      if (permissions.slice().sort().join('\n') !== before) this.syncFailedAt = null;
    }

    // -------------------------------------------------------- פורט השירות

    /**
     * פריט התפריט וספרי הספרייה פונים לשירות דרך אוצריא (`$storage`), בלי
     * להעיר את התוסף, ומוצגים רק כשהפורט שמור. שירות לפני 0.5.0 (בלי
     * `notify`) אינו מבין את הבקשות האלה: הפורט נמחק, והם מוסתרים עד העדכון.
     */
    syncPort(health, baseUrl) {
      return Domain.serviceCan(health, 'notify') ? this.savePort(baseUrl) : this.clearPort();
    }

    /** נכתב רק כשהשתנה, כי כל כתיבה מעדכנת את תנאי ה-`when` של אוצריא. */
    async savePort(baseUrl) {
      const port = Domain.portOf(baseUrl);
      if (port === null || port === this.savedPort) return false;
      try {
        const stored = await this.runtime.call('storage.get', { key: KEYS.servicePort });
        if (stored !== port) await this.runtime.call('storage.set', { key: KEYS.servicePort, value: port });
        this.savedPort = port;
        if (stored !== port) this.log.info('פורט השירות נשמר לאוצריא: ' + port);
        return stored !== port;
      } catch (error) {
        this.log.warn('שמירת פורט השירות נכשלה', error);
        return false;
      }
    }

    async clearPort() {
      if (this.savedPort === null) return false;
      try {
        const stored = await this.runtime.call('storage.get', { key: KEYS.servicePort });
        if (stored !== null && stored !== undefined) {
          await this.runtime.call('storage.remove', { key: KEYS.servicePort });
          this.log.info('השירות ישן: הלחיצה הימנית וספרי הספרייה מוסתרים עד העדכון');
        }
        this.savedPort = null;
        return stored !== null && stored !== undefined;
      } catch (error) {
        this.log.warn('מחיקת פורט השירות נכשלה', error);
        return false;
      }
    }

    /**
     * הכותרות בתפריט הלחיצה הימנית מגיעות מהמניפסט בעברית. אוצריא אינה
     * מתרגמת אותן, ולכן הן מעודכנות לשפה הנוכחית. אין הרשאה — הן נשארות.
     */
    patchContextMenuTitle() {
      // בלי "הוספת רכיבים לתוכנה" הפריטים לא נרשמים, ואוצריא עונה `not_found`.
      // כשההרשאה נדלקת, `permissionsChanged` קורא לכאן שוב.
      if (Domain.lacksStartupPermission(this.permissions)) return Promise.resolve(null);
      return Promise.all([
        this.runtime.callSoft('reader.updateContextMenuItem', {
          id: Domain.CONTEXT_MENU_ITEM,
          patch: { title: t('חיפוש בבר אילן') },
        }),
        this.runtime.callSoft('reader.updateContextMenuItem', {
          id: Domain.LOCATE_MENU_ITEM,
          patch: { title: t('איתור המקום בבר אילן') },
        }),
      ]);
    }

    // ---------------------------------------------------------- פקודות

    /**
     * מביא את הלשונית לחזית, אחרי קיצור מקלדת: אוצריא מוסרת את הפקודה גם
     * ללשונית שפתוחה ברקע, בלי להציג אותה.
     */
    async showSelf() {
      const opened = await this.runtime.callSoft('plugin.openSelf', {});
      if (opened === null) {
        await this.runtime.notify.info(
          t('אפשר לפתוח את לשונית התוסף מאוצריא: כלים ← תוספים ← "בר אילן".'),
        );
      }
    }

    // ------------------------------------------------- חיפוש הספרייה

    /**
     * שולח לאוצריא את רשימת הספרים, כשהיא שונה ממה שנשלח. [enabled] (המתג
     * "ספרי בר אילן בחיפוש הספרייה", ברירת מחדל `true`) כבוי: הרשימה נמחקת
     * מאוצריא, כדי ששמות ספרי בר אילן לא יישמרו אצלה כשהמשתמש אינו רוצה
     * בהם. [force] — שליחה גם כשנראה שאין צורך.
     */
    syncLibrary(status, options) {
      // בלי "הוספת רכיבים לתוכנה" אוצריא אינה רושמת את הספק, והשליחה נדחית.
      if (
        !Domain.hostSupportsLibrary(this.permissions) ||
        Domain.lacksStartupPermission(this.permissions)
      ) {
        return Promise.resolve(false);
      }
      const enabled = !(options && options.enabled === false);
      // אותה בקשה שכבר רצה מצטרפת אליה; מתג שהתהפך בינתיים רץ אחריה.
      if (this.syncing && this.syncingEnabled === enabled) return this.syncing;
      const previous = this.syncing || Promise.resolve();
      const task = previous
        .catch(() => {})
        .then(() => this._syncLibrary(status, { ...(options || {}), enabled }))
        .finally(() => {
          if (this.syncing === task) this.syncing = null;
        });
      this.syncing = task;
      this.syncingEnabled = enabled;
      return task;
    }

    async _syncLibrary(status, options) {
      const force = Boolean(options && options.force);
      let synced = null;
      try {
        synced = await this.runtime.call('storage.get', { key: KEYS.librarySync });
      } catch (_) {
        synced = null;
      }
      if (options.enabled === false) return this._clearLibrary(synced);
      if (!force && !Domain.needsLibrarySync(status, synced, this.pluginVersion)) return false;
      if (!force && this.syncFailedAt !== null && this.now() - this.syncFailedAt < LIBRARY_RETRY_MS) {
        return false;
      }
      try {
        const exported = await this.service.exportCatalog();
        const books = Domain.libraryBooksFromExport(exported && exported.books);
        await this.runtime.call('library.setProviderBooks', {
          provider: Domain.LIBRARY_PROVIDER,
          books,
        });
        await this.runtime.callSoft('storage.set', {
          key: KEYS.librarySync,
          value: {
            builtAt: (exported && exported.builtAt) || null,
            count: books.length,
            pluginVersion: this.pluginVersion,
          },
        });
        this.syncFailedAt = null;
        this.log.info('רשימת הספרים נשלחה לחיפוש הספרייה: ' + books.length + ' ספרים');
        return true;
      } catch (error) {
        // כשל כאן אינו חוסם דבר: החיפוש בדף עובד, ובעוד כמה דקות ננסה שוב.
        this.log.warn('שליחת רשימת הספרים לחיפוש הספרייה נכשלה; ניסיון נוסף בעוד עשר דקות', error);
        this.syncFailedAt = this.now();
        return false;
      }
    }

    /** המתג כבוי: רשימה ריקה לאוצריא, פעם אחת. */
    async _clearLibrary(synced) {
      if (synced && synced.count === 0) return false;
      try {
        await this.runtime.call('library.setProviderBooks', { provider: Domain.LIBRARY_PROVIDER, books: [] });
        await this.runtime.callSoft('storage.set', {
          key: KEYS.librarySync,
          value: { builtAt: null, count: 0, pluginVersion: this.pluginVersion },
        });
        this.log.info('ספרי בר אילן הוסרו מחיפוש הספרייה');
        return true;
      } catch (error) {
        this.log.warn('הסרת ספרי בר אילן מחיפוש הספרייה נכשלה', error);
        return false;
      }
    }
  }

  const api = { Engine };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
