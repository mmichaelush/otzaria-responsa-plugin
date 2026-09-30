// מה שהתוסף עושה בלי מסך: פתיחת ספר שנבחר במסך הספרייה, חיפוש טקסט מסומן
// בבר אילן, פקודות מקיצורי מקלדת, ושליחת רשימת הספרים לחיפוש הספרייה של
// אוצריא. רץ גם בלשונית התוסף וגם במנוע הרקע: אוצריא שולחת כל אירוע למופע
// אחד בלבד, ולכן אין טיפול כפול.
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
     * @param options  `{ permissions, pluginVersion, onActivity, now, log }`:
     *                 מ-`plugin.boot`, ו-callback לדף שמציג "פותח…"/"מחפש…".
     */
    constructor(runtime, service, options) {
      const opts = options || {};
      this.runtime = runtime;
      this.service = service;
      this.permissions = opts.permissions || null;
      this.pluginVersion = opts.pluginVersion || null;
      this.onActivity = opts.onActivity || (() => {});
      this.now = opts.now || (() => Date.now());
      this.log = opts.log || (root.ResponsaLog && root.ResponsaLog.shared) || console;
      this.syncing = null;
      this.syncFailedAt = null;
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

    // ------------------------------------------------------ פתיחה מהספרייה

    /** `library.providerBook.openRequested`: `{ provider, id, title }`. */
    async openFromLibrary(payload) {
      const request = payload || {};
      if (request.provider && request.provider !== Domain.LIBRARY_PROVIDER) return;
      const title = typeof request.title === 'string' ? request.title : '';
      if (!Number.isSafeInteger(request.id)) {
        await this.runtime.notify.error(t('הספר שנבחר אינו מזוהה. יש לחפש אותו שוב.'));
        return;
      }
      this.onActivity({ kind: 'opening', title });
      this.log.info('פתיחה ממסך הספרייה: ' + request.id + ' "' + title + '"');
      try {
        const result = await this.service.open(String(request.id));
        await this.runtime.notify.success(openedMessage(title, result));
      } catch (error) {
        await this.runtime.notify.error(Domain.actionErrorMessage(error));
      } finally {
        this.onActivity(null);
      }
    }

    // ------------------------------------------------- חיפוש טקסט מסומן

    /** `contextMenu.itemClicked`. פריט של תוסף אחר אינו מגיע לכאן. */
    async contextMenuClicked(payload) {
      if (!payload || payload.itemId !== Domain.CONTEXT_MENU_ITEM) return;
      await this.searchSelection(Domain.selectedText(payload));
    }

    async searchSelection(selected) {
      if (!selected) {
        await this.runtime.notify.error(
          t('יש לסמן בספר מילה או משפט, ואז לבחור "חיפוש בבר אילן".'),
        );
        return;
      }
      // השירות משתמש רק בעשר המילים הראשונות, ובקשה ארוכה נדחית.
      const text = selected.slice(0, Domain.MAX_SELECTION_LENGTH);
      this.onActivity({ kind: 'searching', title: Domain.shortTitle(text) });
      this.log.info('חיפוש טקסט מסומן (' + selected.length + ' תווים)');
      try {
        const health = this.service.health || (await this.service.connect());
        if (!Domain.serviceCan(health, 'searchText')) {
          await this.runtime.notify.error(
            t('כדי לחפש בבר אילן צריך לעדכן את שירות בר אילן. בלשונית "בר אילן" יש כפתור להורדת הגרסה החדשה.'),
          );
          return;
        }
        const result = await this.service.searchText(text);
        this.log.info('תוצאת החיפוש בבר אילן: ' + (result && result.outcome), {
          count: result && result.count,
          truncated: result && result.truncated,
        });
        const message = Domain.searchOutcomeMessage(result);
        if (Domain.searchSucceeded(result)) await this.runtime.notify.success(message);
        else await this.runtime.notify.error(message);
      } catch (error) {
        await this.runtime.notify.error(
          error && error.code === 'badRequest'
            ? t('בטקסט שנבחר אין מילים בעברית לחיפוש בבר אילן. יש לסמן מילה או משפט בעברית ולנסות שוב.')
            : Domain.actionErrorMessage(error),
        );
      } finally {
        this.onActivity(null);
      }
    }

    /**
     * הכותרת בתפריט הלחיצה הימנית מגיעה מהמניפסט בעברית. אוצריא אינה
     * מתרגמת אותה, ולכן היא מעודכנת לשפה הנוכחית. אין הרשאה — הכותרת נשארת.
     */
    patchContextMenuTitle() {
      // בלי "הוספת רכיבים לתוכנה" הפריט לא נרשם, ואוצריא עונה `not_found`.
      // כשההרשאה נדלקת, `permissionsChanged` קורא לכאן שוב.
      if (Domain.lacksStartupPermission(this.permissions)) return Promise.resolve(null);
      return this.runtime.callSoft('reader.updateContextMenuItem', {
        id: Domain.CONTEXT_MENU_ITEM,
        patch: { title: t('חיפוש בבר אילן') },
      });
    }

    /**
     * ההבהרה על הרישיון מוצגת בפתיחה הראשונה (כך נקבע בפורום אוצריא). מי
     * שמשתמש רק בלחיצה ימנית, דרך מנוע הרקע, אולי לעולם לא פותח את הלשונית,
     * ולכן בפעולה הראשונה שלו נפתחת הלשונית על מסך הפתיחה. בלי ההרשאה לפתוח
     * אותה — ההבהרה מוצגת כהודעה. פעם אחת לכל הפעלה של המנוע.
     */
    async ensureLicenseNotice(seen) {
      if (seen || this.noticeRequested) return false;
      this.noticeRequested = true;
      this.log.info('ההבהרה עוד לא הוצגה: פותח את מסך הפתיחה');
      const opened = await this.runtime.callSoft('plugin.openSelf', { param: { view: 'welcome' } });
      if (opened === null) {
        await this.runtime.notify.info(
          t('התוסף נועד למי שרכש כדין רישיון לפרויקט השו"ת של בר אילן. "שארית ישראל לא יעשו עוולה". הפרטים בלשונית התוסף.'),
        );
      }
      return true;
    }

    // ---------------------------------------------------------- פקודות

    /** `app.command` מקיצור מקלדת. */
    async command(payload) {
      if (!payload || payload.command !== Domain.Command.openPanel) return;
      const opened = await this.runtime.callSoft('plugin.openSelf', {});
      if (opened === null) {
        await this.runtime.notify.info(
          t('אפשר לפתוח את לשונית התוסף מאוצריא: כלים ← תוספים ← "בר אילן".'),
        );
      }
    }

    // ------------------------------------------------- חיפוש הספרייה

    /**
     * שולח לאוצריא את רשימת הספרים, כשהיא שונה ממה שנשלח. המתג בהגדרות
     * שולט בהצגה דרך `when`, ולכן הרשימה נשלחת גם כשהוא כבוי: הדלקה מציגה
     * אותה מיד. [force] — שליחה גם כשנראה שאין צורך.
     */
    syncLibrary(status, options) {
      // בלי "הוספת רכיבים לתוכנה" אוצריא אינה רושמת את הספק, והשליחה נדחית.
      if (
        !Domain.hostSupportsLibrary(this.permissions) ||
        Domain.lacksStartupPermission(this.permissions)
      ) {
        return Promise.resolve(false);
      }
      if (this.syncing) return this.syncing;
      this.syncing = this._syncLibrary(status, options).finally(() => {
        this.syncing = null;
      });
      return this.syncing;
    }

    async _syncLibrary(status, options) {
      const force = Boolean(options && options.force);
      let synced = null;
      try {
        synced = await this.runtime.call('storage.get', { key: KEYS.librarySync });
      } catch (_) {
        synced = null;
      }
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
  }

  function openedMessage(title, result) {
    const name = title || t('הספר');
    if (result && result.broughtToFront === false) {
      return t('"{title}" נפתח בבר אילן. אם החלון לא הופיע, הוא בשורת המשימות.', {
        title: name,
      });
    }
    return t('"{title}" נפתח בבר אילן', { title: name });
  }

  const api = { Engine, openedMessage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
