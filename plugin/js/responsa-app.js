// הבקר: מצב, לשוניות, אירועי מחזור חיים, טיימרים וקריאות לשירות. ה-DOM נבנה
// ב-responsa-view.js, וההחלטות ב-responsa-domain.js; מה שמול אוצריא ולא מול
// המסך (שליחת הרשימה לחיפוש הספרייה, פורט השירות) ב-responsa-engine.js.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Advanced = root.ResponsaAdvanced;
  const Locate = root.ResponsaLocate;
  const I18n = root.ResponsaI18n;
  const { ServiceClient } = root.ResponsaService;
  const { applyTheme } = root.ResponsaTheme;
  const { createRuntime } = root.ResponsaRuntime;
  const Settings = root.ResponsaSettings;
  const { SettingsStore } = Settings;
  const { Engine } = root.ResponsaEngine;
  const Panels = root.ResponsaPanels;
  const Log = root.ResponsaLog;
  const Icons = root.ResponsaIcons || {};
  const Screen = Domain.Screen;
  const t = (text, vars) => I18n.t(text, vars);

  /** כמה זמן לחכות להקלדה לפני חיפוש. */
  const SEARCH_DEBOUNCE_MS = 250;

  /** החיפוש המתקדם נשמר אחרי הפסקה קצרה בהקלדה, ולא בכל אות. */
  const ADVANCED_SAVE_MS = 600;

  /** בדיקה חוזרת כשמשהו חסר, כדי שהמסך יתעדכן מעצמו אחרי התקנה. */
  const POLL_MS = {
    [Screen.serviceMissing]: 5000,
    [Screen.serviceError]: 10000,
    [Screen.portTaken]: 15000,
    [Screen.notInstalled]: 30000,
  };

  /** הדיווח נחתך כאן: טקסט ארוך מזה כבר אינו תיאור של בעיה אחת. */
  const MAX_REPORT_LENGTH = 5000;

  /** התיאור שהמשתמש מקליד; השאר שמור לפרטי המערכת וליומן. */
  const MAX_REPORT_TEXT = 3000;

  /** כמה פעולות אחרונות מוצגות ב"מצב המערכת", וכמה נכנסות להעתקה. */
  const LOG_VIEW_ENTRIES = 40;
  const LOG_COPY_ENTRIES = 150;

  class App {
    constructor(bridge, view, options) {
      const opts = options || {};
      this.bridge = bridge;
      this.view = view;
      this.log = opts.log || Log.shared;
      this.runtime = opts.runtime || createRuntime(bridge, { logger: this.log });
      this.service = opts.service || new ServiceClient(bridge, undefined, { log: this.log });
      this.settings = opts.settings || new SettingsStore(this.runtime);
      this.engine = opts.engine || new Engine(this.runtime, this.service, { log: this.log });
      this.model = {
        /** הלשונית: 'books' | 'text' | 'locate' | 'settings' | 'help'. */
        tab: 'books',
        screen: Screen.loading,
        platform: null,
        permissions: null,
        pluginVersion: null,
        appVersion: null,
        hostLanguage: null,
        /** `true`/`false` לפי אוצריא, `null` כשעוד לא הוכרע. */
        online: null,
        health: null,
        status: null,
        /** הפורט שבו השירות נמצא, ל"מצב המערכת". */
        servicePort: null,
        message: null,
        /** הקוד של הכשל שעל המסך, לציטוט בפנייה לתמיכה. */
        errorCode: null,
        checking: false,
        query: '',
        results: null,
        total: 0,
        searching: false,
        loadingMore: false,
        searchError: null,
        openingKey: null,
        /** הספר שפרטיו פתוחים ברשימת התוצאות. */
        expandedKey: null,
        /**
         * עיון בעץ של בר אילן. [path] הוא גם תחום החיפוש: חיפוש בתוך קטגוריה
         * מחפש בה ובכל מה שתחתיה. `level`: `{ path, categories, books }`.
         */
        browse: { path: '', level: null, loading: false, error: null },
        /** הסמל של בר אילן מההתקנה שבמחשב (data URL), או `null`. */
        responsaIcon: null,
        /**
         * לשונית "חיפוש בטקסט". `query` — ResponsaAdvanced; `picker` — הרמה
         * בעץ שבבורר התחום; `problem` — מה שהבדיקה מצאה אחרי ניסיון חיפוש;
         * `status` — התשובה של בר אילן או הכשל.
         */
        advanced: {
          query: Advanced.emptyQuery(),
          picker: { path: '', level: null, loading: false, error: null },
          running: false,
          problem: null,
          status: null,
        },
        /**
         * לשונית "איתור מקום". `choices` — המקורות שבר אילן מצא לבחירה;
         * `openingIndex` — המקור שנפתח עכשיו; `history` — המקומות האחרונים.
         */
        locate: {
          text: '',
          ref: '',
          running: false,
          choices: null,
          /** `Locate.rankChoices`: המקורות שמתאימים לספר שפתוח באוצריא, ראשונים. */
          preferred: null,
          /** שם הספר שהאיתור הגיע ממנו (לחיצה ימנית), או `null`. */
          readerTitle: null,
          openingIndex: null,
          status: null,
          history: [],
        },
        /** "פתיחת בר אילן" רצה. */
        showing: false,
        /** בנייה רצה, בכל מסך. */
        buildActive: false,
        progress: null,
        buildStartedAt: null,
        elapsedMs: 0,
        cancelling: false,
        settings: this.settings.values,
        /** `null` | 'welcome' — מסך הפתיחה, הדיאלוג היחיד. */
        sheet: null,
        helpTab: Panels.HelpTab.guide,
        report: { text: '', sending: false },
        /** הפעולות האחרונות, לכרטיסיית "מצב המערכת". */
        log: [],
      };
      this.refreshSeq = 0;
      this.searchSeq = 0;
      this.searchTimer = null;
      this.pollTimer = null;
      this.clockTimer = null;
      this.buildWatch = null;
      this.suspended = false;
      this.logRender = null;
      this.browseSeq = 0;
      this.pickerSeq = 0;
      this.advancedSaveTimer = null;
      /** הרשימה שהעץ המוצג נבנה ממנה: רשימה שנקראה מחדש בונה אותו מחדש. */
      this.browseCatalog = null;
      /** אייקוני אוצריא והסמל של בר אילן: לכל גרסת שירות, עד שלושה ניסיונות. */
      this.icons = { version: null, attempts: 0, loaded: false };
      this.actions = this._actions();
      /**
       * הטעינה הראשונה (הגדרות ומצב השירות) הסתיימה. אירועים שפותחים את
       * הלשונית (לחיצה ימנית, דיאלוג החיפוש, קיצור) מגיעים מיד אחרי
       * `plugin.boot`, ומחכים לה כדי לא לפעול על הגדרות ברירת המחדל.
       */
      this.ready = new Promise((resolve) => {
        this._markReady = resolve;
      });
      /**
       * החיפוש והאיתור שרצים עכשיו. בקשה מאוצריא שמגיעה בזמן הזה מחכה להם:
       * דיאלוג החיפוש כבר נסגר בלי לחפש, ובקשה שנזרקת הייתה נעלמת.
       */
      this.advancedTask = null;
      this.locateTask = null;
      // גופן האייקונים של אוצריא נטען: כל מה שעל המסך מצויר מחדש.
      if (Icons.onChange) {
        Icons.onChange(() => {
          this.view.redraw(this.model, this.actions);
          this._renderPage();
        });
      }
      // רשומה חדשה מתעדכנת ב"מצב המערכת" כשהוא פתוח, פעם אחת לכל סדרה.
      this.log.subscribe((entry) => {
        if (entry.level === 'debug' || this.logRender) return;
        if (this.model.tab !== 'help' || this.model.helpTab !== Panels.HelpTab.status) return;
        this.logRender = setTimeout(() => {
          this.logRender = null;
          this._renderPage();
        }, 250);
      });
    }

    // ---------------------------------------------------- מחזור חיים

    async boot(payload) {
      try {
        await this._boot(payload);
      } finally {
        this._markReady();
      }
    }

    async _boot(payload) {
      const info = payload || {};
      const app = info.app || {};
      applyTheme(info.theme);
      this.model.platform = app.platform || null;
      this.model.appVersion = app.version || null;
      this.model.hostLanguage = app.language || null;
      this.model.pluginVersion = (info.plugin && info.plugin.version) || null;
      this.model.online = connectivityOf(info.connectivity);
      // המנוע רושם את הגרסה עם הרשימה שנשלחה: גרסה חדשה של התוסף שולחת מחדש.
      this.engine.pluginVersion = this.model.pluginVersion;
      if (Array.isArray(info.permissions)) this._setPermissions(info.permissions);
      this.model.settings = await this.settings.load();
      this.service.autoStart = this.model.settings.autoStart;
      this.model.browse = { ...this.model.browse, path: this.model.settings.browsePath };
      this.model.advanced.query = Advanced.normalize(this.model.settings.advancedQuery || Advanced.emptyQuery());
      this.model.locate.history = this.model.settings.locateHistory.slice();
      this.model.tab = this.model.settings.tab;
      this._applyLanguage({ boot: true });
      this.log.info(
        'הפעלה: תוסף ' + this.model.pluginVersion + ', אוצריא ' + this.model.appVersion +
          ', שפה ' + I18n.language + ', אינטרנט: ' + describeOnline(this.model.online),
      );
      // הלשוניות מיד, עוד לפני שהשירות ענה: עזרה והגדרות לא ממתינות לו.
      this.view.render(this.model, this.actions);
      // בפעם הראשונה: מסך הפתיחה, מעל המסך שמתאים למצב המחשב.
      if (!this.model.settings.welcomeSeen) this.openSheet('welcome');
      return this.refresh();
    }

    /** המשתמש שינה הרשאות בהגדרות: ייתכן שעכשיו יש (או אין) ערוץ לשירות. */
    permissionsChanged(permissions) {
      if (Array.isArray(permissions)) this._setPermissions(permissions);
      this.log.info('ההרשאות השתנו');
      // פריט התפריט אולי נרשם זה עתה, בכותרת העברית שבמניפסט.
      if (I18n.language !== I18n.SOURCE_LANGUAGE) this.engine.patchContextMenuTitle();
      this._renderPage();
      return this.refresh();
    }

    /** `settings.changed` של אוצריא: רק שינוי שפה נוגע לנו. */
    hostSettingChanged(detail) {
      if (!detail || detail.key !== I18n.LANGUAGE_SETTING_KEY) return;
      this.model.hostLanguage = typeof detail.newValue === 'string' ? detail.newValue : null;
      if (this.model.settings.language === 'auto') this._applyLanguage({ rerender: true });
    }

    /** `plugin.page_opened` מקיצור דרך או מ-`plugin.openSelf`. */
    pageOpened(detail) {
      const param = detail && detail.param;
      const view = param && param.view;
      if (view === 'settings') this.selectTab('settings');
      else if (view === 'help') this.openHelp(param.tab);
      else if (view === 'welcome') this.openSheet('welcome');
      else if (Settings.TABS.includes(view)) this.selectTab(view);
    }

    /** `app.command` מקיצור מקלדת: לשונית מסוימת, או הלשונית כפי שהייתה. */
    async command(payload) {
      const command = payload && payload.command;
      const tab = Domain.COMMAND_TABS[command];
      if (!tab && command !== Domain.Command.openPanel) return;
      await this.ready;
      if (tab) this.selectTab(tab);
      await this.engine.showSelf();
    }

    /**
     * `contextMenu.itemClicked`: "איתור המקום בבר אילן" מספר שפתוח באוצריא.
     * המקום הוא של השורה שסומנה, מתוכן העניינים; בלי ההרשאה לכך — הכותרת
     * שאוצריא שולחת, של השורה הראשונה במסך.
     */
    async contextMenuClicked(payload) {
      if (!payload || payload.itemId !== Domain.LOCATE_MENU_ITEM) return;
      await this.ready;
      const headings = await this._readerHeadings(payload);
      await this.locateFromReader(payload.currentBook, headings || payload.currentRef);
    }

    /** הכותרות של השורה שסומנה (`Locate.headingsAt`), או `null`. */
    async _readerHeadings(payload) {
      const index = payload.currentIndex;
      if (!Number.isInteger(index) || index < 0) return null;
      const selection = payload.selection || {};
      const toc = await this.runtime.callSoft('library.getBookToc', {
        bookId: payload.currentBookId || payload.currentBook,
        ...(payload.id !== undefined ? { id: payload.id } : {}),
        ...(payload.type ? { type: payload.type } : {}),
        ...(payload.source ? { source: payload.source } : {}),
        ...(selection.bookUid ? { bookUid: selection.bookUid } : {}),
      });
      return Locate.headingsAt(toc, index);
    }

    /** מחכה לפעולה ב-[key] (`advancedTask`, `locateTask`) עד שאין כזו. */
    async _idle(key) {
      while (this[key]) {
        try {
          await this[key];
        } catch (_) {
          // הכשל כבר מוצג במסך של אותה פעולה.
        }
      }
    }

    /** רושם את [task] ב-[key] עד שהיא מסתיימת. */
    async _track(key, task) {
      this[key] = task;
      try {
        return await task;
      } finally {
        if (this[key] === task) this[key] = null;
      }
    }

    /** `search.requested`: "חיפוש בבר אילן" מסומן בדיאלוג החיפוש של אוצריא. */
    async searchRequested(payload) {
      await this.ready;
      await this.searchFromOtzaria(payload && payload.request);
    }

    /** אוצריא מקפיאה לשונית שאינה מוצגת; הבנייה ממשיכה בשירות. */
    suspend() {
      this.suspended = true;
      this._stopPolling();
      this._stopWatchingBuild();
      this._stopClock();
      if (this.searchTimer) clearTimeout(this.searchTimer);
      if (this.logRender) clearTimeout(this.logRender);
      this.searchTimer = null;
      this.logRender = null;
    }

    resume() {
      this.suspended = false;
      return this.refresh();
    }

    _setPermissions(permissions) {
      this.model.permissions = permissions;
      this.engine.setPermissions(permissions);
    }

    // ---------------------------------------------------- מצב השירות

    /**
     * קורא מחדש את מצב השירות ובוחר מסך. לעולם אינו זורק. רענון שהתחיל לפני
     * רענון אחר נזרק כשהוא חוזר, כדי שתשובה ישנה לא תדרוס מצב חדש.
     */
    async refresh(options) {
      const seq = ++this.refreshSeq;
      this._stopPolling();
      this.model.message = null;
      this.model.errorCode = null;
      if (this.model.platform && this.model.platform !== 'windows') {
        this._show(Screen.unsupported);
        return;
      }
      if (!Domain.hasLocalhostPermission(this.model.permissions)) {
        this._show(Screen.permissionDenied);
        return;
      }
      let health = null;
      let status = null;
      let failure = null;
      try {
        health = await this.service.connect();
        if (health.apiVersion === Domain.API_VERSION) {
          status = await this.service.status();
        }
      } catch (error) {
        failure = error;
      }
      if (this.suspended || seq !== this.refreshSeq) return;
      this.model.health = health;
      this.model.status = status;
      this.model.servicePort = health ? Domain.portOf(this.service.baseUrl) : null;
      // פריט התפריט וספרי הספרייה פונים לפורט הזה דרך אוצריא, בלי התוסף.
      if (health && health.apiVersion === Domain.API_VERSION) this.engine.syncPort(health, this.service.baseUrl);
      this.model.message = failure ? Domain.errorMessage(failure) : null;
      this.model.errorCode = failure ? failure.code || null : null;

      const build = (status && status.build) || {};
      // בנייה שהתחלנו כאן והשירות עוד לא דיווח עליה עדיין רצה.
      this.model.buildActive = build.state === 'running' || this.buildWatch !== null;
      if (build.state === 'running') {
        this.model.progress = build;
        this.model.buildStartedAt = build.startedAt ? Date.parse(build.startedAt) : Date.now();
      }

      const screen = Domain.screenFor({
        platform: this.model.platform,
        permissions: this.model.permissions,
        health,
        status,
        failure,
      });
      if (screen === Screen.buildFailed) {
        // הודעת השירות באנגלית ובלשון מפתחים; ההסבר למשתמש נבנה לפי הקוד.
        this.model.message = build.error ? Domain.errorMessage(build.error) : t('הקריאה נכשלה.');
        this.model.errorCode = (build.error && build.error.code) || null;
      }
      this._show(screen);
      this._renderPage();
      this._ensurePicker();
      if (build.state === 'running' && !this.buildWatch) {
        this._watchBuild({ attachOnly: true });
      }
      if (screen === Screen.ready && !this.model.buildActive && Domain.serviceCan(health, 'export')) {
        this.engine.syncLibrary(status, { enabled: this.model.settings.libraryBooks });
      }
      if (health) this._loadIcons(health);
      if (screen === Screen.ready && Domain.serviceCan(health, 'browse')) {
        const catalog = (status && status.catalog) || {};
        const identity = (catalog.builtAt || '') + '|' + (catalog.sourceVersion || '');
        const stale = this.browseCatalog !== null && this.browseCatalog !== identity;
        this.browseCatalog = identity;
        if ((stale || !this.model.browse.level) && !this.model.browse.loading) {
          this.browseTo(this.model.browse.path);
        }
      }
      const rerun = !options || options.rerunSearch !== false;
      if (screen === Screen.ready && rerun && this.model.query.trim()) {
        this._runSearch(this.model.query, 0);
      }
    }

    /** מסך חדש נבנה מלא; אותו מסך רק מתעדכן במקום, בלי לאבד פוקוס. */
    _show(screen) {
      this._stopPolling();
      const changed = this.model.screen !== screen;
      if (changed) this.log.info('מסך: ' + screen + (this.model.errorCode ? ' (' + this.model.errorCode + ')' : ''));
      this.model.screen = screen;
      if (changed) this.view.render(this.model, this.actions);
      else this.view.update(this.model, this.actions);
      const interval = POLL_MS[screen];
      if (interval && !this.suspended) {
        this.pollTimer = setTimeout(() => this.refresh(), interval);
      }
    }

    _stopPolling() {
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    /** "בדיקה חוזרת": אותו רענון, עם משוב שמשהו קורה. */
    async retry() {
      if (this.model.checking) return;
      this.model.checking = true;
      this.view.update(this.model, this.actions);
      try {
        await this.refresh();
      } finally {
        this.model.checking = false;
        this.view.update(this.model, this.actions);
      }
    }

    // ---------------------------------------------------- חיפוש

    search(query, options) {
      if (query.trim() !== this.model.query.trim()) this.model.expandedKey = null;
      this.model.query = query;
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = null;
      if (!query.trim()) {
        this.searchSeq++;
        Object.assign(this.model, {
          results: null,
          total: 0,
          searching: false,
          loadingMore: false,
          searchError: null,
        });
        this._renderResults();
        return;
      }
      const run = () => this._runSearch(query, 0);
      if (options && options.now) run();
      else this.searchTimer = setTimeout(run, SEARCH_DEBOUNCE_MS);
    }

    async _runSearch(query, offset) {
      const seq = ++this.searchSeq;
      const more = offset > 0;
      if (more) this.model.loadingMore = true;
      else this.model.searching = true;
      this._renderResults();
      try {
        const page = await this.service.search(query, offset, Domain.PAGE_SIZE, this._scope());
        // תשובה ישנה שהגיעה אחרי הקלדה חדשה נזרקת.
        if (seq !== this.searchSeq) return;
        this.model.results = more ? this.model.results.concat(page.results) : page.results;
        this.model.total = page.total;
        this.model.searchError = null;
        if (!more) {
          this.view.announce(page.total === 0 ? t('לא נמצאו ספרים') : Domain.foundLabel(page.total));
        }
      } catch (error) {
        if (seq !== this.searchSeq) return;
        this.model.searchError = Domain.errorMessage(error);
        this.model.results = null;
        // רענון בלי לחזור על החיפוש: אחרת שגיאה עקבית הייתה לולאה.
        if (Domain.needsRefresh(error.code)) this.refresh({ rerunSearch: false });
      } finally {
        if (seq === this.searchSeq) {
          this.model.searching = false;
          this.model.loadingMore = false;
          this._renderResults();
        }
      }
    }

    loadMore() {
      if (this.model.loadingMore || !this.model.results) return;
      this._runSearch(this.model.query, this.model.results.length);
    }

    /** תחום החיפוש: הקטגוריה שבה המשתמש נמצא, כשהשירות תומך בעיון. */
    _scope() {
      return Domain.serviceCan(this.model.health, 'browse') ? this.model.browse.path : '';
    }

    // ---------------------------------------------------- עיון בקטגוריות

    /**
     * עובר לקטגוריה [path] (ריק = כל הספרים). חיפוש שעל המסך רץ שוב בתוכה,
     * כי היא עכשיו תחום החיפוש.
     */
    async browseTo(path) {
      const target = path || '';
      const seq = ++this.browseSeq;
      const changed = target !== this.model.browse.path;
      this.model.browse = { ...this.model.browse, path: target, loading: true, error: null };
      this.model.expandedKey = null;
      this._renderResults();
      if (changed && this.model.query.trim()) this._runSearch(this.model.query, 0);
      try {
        const level = await this.service.browse(target);
        if (seq !== this.browseSeq) return;
        this.model.browse = { path: target, level, loading: false, error: null };
        this.log.debug('עיון: ' + (target || '(שורש)'));
        if (target !== this.settings.get('browsePath')) {
          this.settings.set('browsePath', target).catch(() => {});
        }
      } catch (error) {
        if (seq !== this.browseSeq) return;
        // קטגוריה שנעלמה (הרשימה נקראה מחדש): חוזרים לשורש.
        if (error.code === 'notFound' && target) {
          this.browseTo('');
          return;
        }
        this.model.browse = { path: target, level: null, loading: false, error: Domain.errorMessage(error) };
      }
      this._renderResults();
      // הכפתור שנלחץ (קטגוריה, נתיב, "ניסיון נוסף") כבר אינו על המסך.
      this.view.focusBrowse();
    }

    /** "חיפוש בכל הספרים": יוצא מהקטגוריה ושומר על מה שהוקלד. */
    searchEverywhere() {
      return this.browseTo('');
    }

    /**
     * אייקוני אוצריא מהגופן שבהתקנה, והסמל של בר אילן, דרך השירות. כשל אינו
     * מורגש: נשארים האייקונים שבתוסף.
     */
    async _loadIcons(health) {
      const icons = this.icons;
      if (icons.version !== health.serverVersion) {
        Object.assign(icons, { version: health.serverVersion, attempts: 0, loaded: false });
      }
      if (icons.loaded || icons.attempts >= 3 || icons.pending) return;
      icons.attempts++;
      icons.pending = true;
      if (Domain.serviceCan(health, 'icon') && !this.model.responsaIcon) {
        this.service.responsaIcon().then(
          (icon) => {
            if (!icon || typeof icon.png !== 'string') return;
            // השדה נקרא `png` מסיבות היסטוריות; התוכן הוא קובץ ico.
            this.model.responsaIcon = 'data:image/x-icon;base64,' + icon.png;
            this._renderResults();
          },
          (error) => this.log.debug('אין סמל של בר אילן', error),
        );
      }
      try {
        if (!Domain.serviceCan(health, 'otzariaIcons') || !Icons.useHostFont || Icons.hostActive) {
          icons.loaded = true;
          return;
        }
        const font = await this.service.otzariaIcons();
        icons.loaded = await Icons.useHostFont(font.font, font.glyphs);
        this.log.info(icons.loaded ? 'אייקוני אוצריא נטענו מההתקנה' : 'גופן האייקונים של אוצריא לא נטען');
      } catch (error) {
        // "לא נמצא" אינו זמני: אין טעם לנסות שוב.
        if (error.code === 'notFound') icons.loaded = true;
        this.log.debug('אין גופן אייקונים של אוצריא', error);
      } finally {
        icons.pending = false;
      }
    }

    // ---------------------------------------------------- פתיחה

    async open(book) {
      if (this.model.openingKey !== null || this.model.buildActive) return;
      this.model.openingKey = book.key;
      this._renderResults();
      try {
        const result = await this.service.open(book.key);
        await this.runtime.notify.success(Domain.openedMessage(book.title, result));
      } catch (error) {
        await this.runtime.notify.error(Domain.errorMessage(error));
        if (Domain.needsRefresh(error.code)) this.refresh({ rerunSearch: false });
      } finally {
        this.model.openingKey = null;
        this._renderResults();
      }
    }

    /** לחיצה על "פרטי הספר": פתיחה, או סגירה של הפרטים שכבר פתוחים. */
    toggleDetails(key) {
      this.model.expandedKey = this.model.expandedKey === key ? null : key;
      this._renderResults();
    }

    // ---------------------------------------------------- לשוניות

    /**
     * מעבר ללשונית. [focusTab] — מעבר בחצים: הפוקוס נשאר על הלשונית; אחרת
     * הוא עובר לשדה הראשון שבה. הלשונית נשמרת לפתיחה הבאה.
     */
    selectTab(tab, options) {
      if (!Settings.TABS.includes(tab)) return;
      const changed = this.model.tab !== tab;
      this.model.tab = tab;
      if (tab === 'help') this.model.log = this.log.entries('info').slice(-LOG_VIEW_ENTRIES);
      if (changed) {
        this.view.render(this.model, this.actions);
        this.settings.set('tab', tab).then(
          (values) => {
            this.model.settings = values;
          },
          (error) => this.log.debug('שמירת הלשונית נכשלה', error),
        );
      }
      if (options && options.focusTab) this.view.focusTab(tab);
      else this.view.focusPage(this.model);
      if (tab === 'text') this._ensurePicker();
    }

    /** עזרה, בכרטיסייה [helpTab] (או בזו שהייתה פתוחה). */
    openHelp(helpTab) {
      if (helpTab && Object.values(Panels.HelpTab).includes(helpTab)) this.model.helpTab = helpTab;
      if (this.model.sheet === 'welcome') this.closeSheet();
      if (this.model.tab !== 'help') this.selectTab('help');
      else this._renderPage();
    }

    // ---------------------------------------------------- בנייה

    startBuild() {
      // בזמן פתיחה השירות היה מחזיר "עסוק": בר אילן תפוס.
      if (this.model.buildActive || this.model.openingKey !== null) return;
      // רענון שעוד בדרך יחזור עם "אין בנייה" ויחזיר את מסך ההתחלה.
      this.refreshSeq++;
      Object.assign(this.model, {
        buildActive: true,
        progress: { stage: 'starting' },
        buildStartedAt: Date.now(),
        elapsedMs: 0,
        cancelling: false,
      });
      this.closeSheet();
      if (this.model.screen === Screen.ready) {
        this.view.update(this.model, this.actions);
        this._renderResults();
      } else {
        this._show(Screen.building);
      }
      this.view.announce(t('קריאת רשימת הספרים התחילה'));
      this._watchBuild({ attachOnly: false });
    }

    /** "מבטל…" נשאר עד שהבנייה באמת נעצרת (אירוע הסיום), לא עד שהבקשה חזרה. */
    async cancelBuild() {
      if (this.model.cancelling) return;
      this.model.cancelling = true;
      this._updateBuild();
      try {
        await this.service.cancelBuild();
      } catch (error) {
        this.model.cancelling = false;
        this._updateBuild();
        await this.runtime.notify.error(Domain.errorMessage(error));
      }
    }

    _watchBuild(options) {
      this._stopWatchingBuild();
      const controller = new AbortController();
      this.buildWatch = controller;
      this._startClock();
      this.service
        .watchBuild(
          (event) => {
            if (event.type !== 'progress') return;
            this.model.progress = event;
            this._updateBuild();
          },
          controller.signal,
          options,
        )
        .then(
          (terminal) => this._buildFinished(terminal, controller),
          (error) =>
            this._buildFinished({ type: 'error', code: error.code, message: error.message }, controller),
        );
    }

    async _buildFinished(terminal, controller) {
      if (this.buildWatch !== controller || controller.signal.aborted) return;
      this.buildWatch = null;
      this._stopClock();
      this.model.buildActive = false;
      this.model.cancelling = false;
      if (terminal && terminal.type === 'done') {
        const text = t('רשימת ספרי בר אילן מוכנה: {books}', {
          books: Domain.booksLabel(terminal.books),
        });
        await this.runtime.notify.success(text);
        this.view.announce(text);
      } else if (terminal && terminal.type === 'error' && terminal.code === 'cancelled') {
        this.view.announce(t('קריאת רשימת הספרים בוטלה'));
      } else if (terminal && terminal.type === 'error' && terminal.code === 'busy') {
        // בנייה שלא התחילה אינה נרשמת ב-/status, ולכן רק כאן אפשר להסביר.
        await this.runtime.notify.error(Domain.errorMessage(terminal));
      }
      // כשל אחר מוצג מתוך /status: מסך כשל בבנייה ראשונה, הערה בבנייה מחדש.
      this.refresh();
    }

    _stopWatchingBuild() {
      if (this.buildWatch) this.buildWatch.abort();
      this.buildWatch = null;
    }

    /** מעדכן את "נותרו כ-X דקות" גם בין אירועי התקדמות. */
    _startClock() {
      this._stopClock();
      const tick = () => {
        this.model.elapsedMs = Date.now() - (this.model.buildStartedAt || Date.now());
        this._updateBuild();
      };
      tick();
      this.clockTimer = setInterval(tick, 5000);
    }

    _stopClock() {
      if (this.clockTimer) clearInterval(this.clockTimer);
      this.clockTimer = null;
    }

    _updateBuild() {
      this.view.update(this.model, this.actions);
    }

    // ---------------------------------------------------- חיפוש מתקדם

    /** בורר התחום צריך רמה בעץ כשבוחרים "קטגוריות וספרים שאבחר". */
    _ensurePicker() {
      const state = this.model.advanced;
      if (this.model.tab !== 'text' || state.query.scope.mode !== Advanced.Scope.pick) return;
      if (state.picker.level || state.picker.loading) return;
      if (!Domain.serviceCan(this.model.health, 'browse')) return;
      this.advancedBrowse(state.picker.path);
    }

    /** [focus] — המשתמש עבר רמה בבורר: הפוקוס לשורת הנתיב, כי הכפתור שנלחץ נעלם. */
    async advancedBrowse(path, options) {
      const focus = Boolean(options && options.focus);
      const state = this.model.advanced;
      const seq = ++this.pickerSeq;
      state.picker = { ...state.picker, path: path || '', loading: true, error: null };
      this._renderPage();
      try {
        const level = await this.service.browse(path || '');
        if (seq !== this.pickerSeq) return;
        state.picker = { path: level.path || '', level, loading: false, error: null };
      } catch (error) {
        if (seq !== this.pickerSeq) return;
        // הקטגוריה נעלמה (הרשימה נקראה מחדש): חוזרים לשורש.
        if (error.code === 'notFound' && path) {
          this.advancedBrowse('', options);
          return;
        }
        state.picker = { ...state.picker, loading: false, error: Domain.errorMessage(error) };
      }
      this._renderPage();
      if (focus) this.view.focusInSheet('adv-crumb-' + state.picker.path);
    }

    /**
     * כל שינוי בחיפוש: נשמר באיחור קצר ומצויר. [light] — הקלדה: רק התצוגה
     * המקדימה מתעדכנת, כדי שהשדה לא ייבנה מחדש באמצע מילה.
     */
    _editAdvanced(query, options) {
      const state = this.model.advanced;
      state.query = query;
      state.status = null;
      // אחרי ניסיון שנכשל, ההערה מתעדכנת תוך כדי תיקון.
      if (state.problem) state.problem = Advanced.validate(query);
      this._saveAdvancedSoon();
      if (options && options.light) this.view.updateAdvanced(this.model);
      else this._renderPage();
    }

    _saveAdvancedSoon() {
      clearTimeout(this.advancedSaveTimer);
      this.advancedSaveTimer = setTimeout(() => {
        this.advancedSaveTimer = null;
        this.settings.set('advancedQuery', this.model.advanced.query).then(
          (values) => {
            this.model.settings = values;
          },
          (error) => this.log.warn('שמירת החיפוש המתקדם נכשלה', error),
        );
      }, ADVANCED_SAVE_MS);
    }

    advancedSet(patch, options) {
      this._editAdvanced(Advanced.normalize({ ...this.model.advanced.query, ...patch }), options);
    }

    /**
     * חיפוש רגיל, בונה, או תחביר של בר אילן. בלחיצה הפוקוס עובר לשדה
     * הראשון; בחצים הוא נשאר על הבקר, כדי שאפשר יהיה לחזור.
     */
    advancedMode(mode, how) {
      const query = this.model.advanced.query;
      this.model.advanced.problem = null;
      this._editAdvanced(Advanced.setMode(query, mode));
      if (how && how.viaKeyboard) this.view.focusInSheet('adv-kind-' + mode);
      else this.view.focusPage(this.model);
    }

    advancedWord(index, alternative, value) {
      this._editAdvanced(Advanced.setWord(this.model.advanced.query, index, alternative, value), { light: true });
    }

    advancedTerm(index, patch) {
      this._editAdvanced(Advanced.updateTerm(this.model.advanced.query, index, patch));
    }

    advancedAddTerm() {
      const query = Advanced.addTerm(this.model.advanced.query);
      this._editAdvanced(query);
      this.view.focusInSheet('adv-word-' + (query.terms.length - 1) + '-0');
    }

    advancedRemoveTerm(index) {
      this._editAdvanced(Advanced.removeTerm(this.model.advanced.query, index));
      this.view.focusInSheet('adv-word-' + Math.max(0, index - 1) + '-0');
    }

    advancedAddAlternative(index) {
      const query = Advanced.addAlternative(this.model.advanced.query, index);
      this._editAdvanced(query);
      this.view.focusInSheet('adv-word-' + index + '-' + (query.terms[index].words.length - 1));
    }

    advancedRemoveAlternative(index, alternative) {
      this._editAdvanced(Advanced.removeAlternative(this.model.advanced.query, index, alternative));
      this.view.focusInSheet('adv-word-' + index + '-' + Math.max(0, alternative - 1));
    }

    advancedGap(index, patch) {
      this._editAdvanced(Advanced.updateGap(this.model.advanced.query, index, patch));
    }

    advancedScopeMode(mode) {
      const query = this.model.advanced.query;
      this._editAdvanced({ ...query, scope: { ...query.scope, mode } });
      this._ensurePicker();
    }

    advancedToggleScope(item) {
      const query = this.model.advanced.query;
      const next = Advanced.toggleScopeItem(query, item);
      if (next === query) {
        this.model.advanced.status = {
          kind: 'error',
          text: t('אפשר לבחור עד {max} קטגוריות וספרים. כדאי לבחור קטגוריה שמעליהם.', {
            max: Advanced.MAX_SCOPE_ITEMS,
          }),
        };
        this._renderPage();
        return;
      }
      this._editAdvanced(next);
    }

    advancedExample(id) {
      this._editAdvanced(Advanced.applyExample(this.model.advanced.query, id));
      this.view.focusInSheet('adv-word-0-0');
    }

    /** "ניקוי": המילים מתאפסות; סוג החיפוש, התחום והאפשרויות נשארים. */
    advancedClear() {
      const query = this.model.advanced.query;
      this.model.advanced.problem = null;
      this._editAdvanced({ ...Advanced.emptyQuery(), mode: query.mode, scope: query.scope, options: query.options });
      this.view.focusPage(this.model);
    }

    runAdvanced() {
      if (this.model.advanced.running) return this.advancedTask || Promise.resolve();
      return this._track('advancedTask', this._runAdvanced());
    }

    async _runAdvanced() {
      const state = this.model.advanced;
      if (!Domain.serviceCan(this.model.health, 'advancedSearch')) return;
      const query = Advanced.withAvailableScope(state.query, Domain.catalogReady(this.model.status));
      const problem = Advanced.validate(query);
      state.problem = problem;
      if (problem) {
        state.status = null;
        this._renderPage();
        this.view.focusAdvancedProblem(problem);
        this.view.announce(problem.message);
        return;
      }
      const body = Advanced.toRequest(query);
      state.running = true;
      state.status = null;
      this._renderPage();
      this.log.info('חיפוש בטקסט (' + query.mode + '): ' + body.q, {
        scope: query.scope.mode,
        items: query.scope.items.length,
      });
      try {
        const result = await this.service.advancedSearch(body);
        this.log.info('תוצאת החיפוש המתקדם: ' + (result && result.outcome), { count: result && result.count });
        state.status = {
          kind: Domain.searchSucceeded(result) ? 'success' : 'error',
          text: Domain.searchOutcomeMessage(result),
        };
      } catch (error) {
        state.status = { kind: 'error', text: Domain.errorMessage(error) };
      } finally {
        state.running = false;
        this._renderPage();
        if (state.status) this.view.announce(state.status.text);
      }
    }

    /**
     * חיפוש מדיאלוג החיפוש של אוצריא: המילים נכנסות ללשונית "חיפוש בטקסט"
     * ורצות מיד, בתחום ובאפשרויות שכבר בחורים בה. כשמשהו חסר (שירות,
     * הרשאה) הלשונית מראה אותו, והמילים כבר בשדה.
     */
    async searchFromOtzaria(request) {
      this.selectTab('text');
      const state = this.model.advanced;
      await this._idle('advancedTask');
      const mapped = Advanced.fromOtzariaSearch(state.query, request);
      if (!mapped) {
        state.status = { kind: 'error', text: t('בחיפוש שהגיע מאוצריא אין מילים בעברית.') };
        this._renderPage();
        this.view.announce(state.status.text);
        return;
      }
      state.problem = null;
      this._editAdvanced(mapped.query);
      // שדה שרק הערך שלו השתנה אינו נבנה מחדש (refreshPage משווה מבנה).
      this.view.setInputValue('adv-simple', mapped.query.simpleText);
      mapped.query.terms.forEach((term, index) => this.view.setInputValue('adv-word-' + index + '-0', term.words[0]));
      if (Domain.SETUP_SCREENS.has(this.model.screen)) return;
      this.log.info('חיפוש מדיאלוג החיפוש של אוצריא' + (mapped.approximate ? ' (בקירוב)' : ''));
      await this.runAdvanced();
      if (mapped.approximate && state.status && state.status.kind === 'success') {
        state.status = {
          ...state.status,
          text:
            state.status.text +
            ' ' +
            t('לא כל אפשרויות החיפוש של אוצריא קיימות בבר אילן, ולכן החיפוש כאן קרוב לזה שנשלח ולא זהה לו.'),
        };
        this._renderPage();
      }
    }

    /** "פתיחת בר אילן", מהפס העליון. */
    async showResponsa() {
      if (this.model.showing) return;
      this.model.showing = true;
      this.view.update(this.model, this.actions);
      try {
        const result = await this.service.showResponsa();
        this.log.info('בר אילן נפתח' + (result && result.broughtToFront ? '' : ' (לא עבר לחזית)'));
        if (result && result.broughtToFront === false) {
          await this.runtime.notify.info(
            t('בר אילן פתוח. אם הוא לא הופיע מעל אוצריא, עוברים אליו בשורת המשימות.'),
          );
        }
      } catch (error) {
        await this.runtime.notify.error(Domain.errorMessage(error));
      } finally {
        this.model.showing = false;
        this.view.update(this.model, this.actions);
      }
    }

    // ---------------------------------------------------- איתור מקום

    /**
     * הקלדה: רק המודל, כי השדה עצמו כבר מציג את מה שהוקלד. הודעה קודמת
     * שייכת למקום הקודם, ולכן נעלמת.
     */
    locateText(text) {
      const state = this.model.locate;
      state.text = text;
      if (state.status) {
        state.status = null;
        this.view.refreshPage(this.model, this.actions);
      }
    }

    /** דוגמה: ממלאת את השדה, וההחלטה לפתוח נשארת למשתמש. */
    locateExample(value) {
      if (this.model.locate.running) return;
      this._fillLocate(value);
    }

    /** מקום אחרון: כבר נפתח פעם, ולכן נפתח מיד. */
    locateRecent(value) {
      if (this.model.locate.running) return;
      this.model.locate.text = value;
      return this.runLocate();
    }

    /** "פתיחה במקום מסוים" מספר ברשימה: שם הספר בשדה, והמשך הכתיבה למשתמש. */
    locateIn(book) {
      this.selectTab('locate');
      // בזמן פתיחה המודל שייך לבקשה שרצה, והלשונית מראה אותה; תשובה מאוחרת
      // הייתה דורסת שדה שמולא בינתיים.
      if (this.model.locate.running) return;
      this._fillLocate(Locate.startFrom(book.title));
    }

    _fillLocate(text) {
      const state = this.model.locate;
      state.text = text;
      state.choices = null;
      state.preferred = null;
      state.readerTitle = null;
      state.status = null;
      this.view.refreshPage(this.model, this.actions);
      this.view.setInputValue('locate-input', text);
      this.view.focusPage(this.model);
    }

    async runLocate() {
      const state = this.model.locate;
      if (state.running) return;
      const problem = Locate.validate(state.text);
      if (problem) {
        state.status = { kind: 'error', text: problem };
        state.choices = null;
        this._renderPage();
        this.view.focusPage(this.model);
        this.view.announce(problem);
        return;
      }
      await this._track('locateTask', this._locateRef(Locate.normalize(state.text)));
    }

    /**
     * "איתור המקום בבר אילן" מספר שפתוח באוצריא: ההפניה המדויקת, ואם בר
     * אילן אינו מכיר אותה — כללית יותר (`Locate.fromReader`). מקור יחיד
     * שמתאים לספר נפתח מיד; כמה — לבחירה, המתאימים ראשונים.
     */
    async locateFromReader(book, place) {
      this.selectTab('locate');
      const state = this.model.locate;
      await this._idle('locateTask');
      const reader = Locate.fromReader(book, place);
      if (!reader || !reader.refs.length) {
        const hebrew = Boolean(reader && /[א-ת]/.test(reader.title));
        this._fillLocate(hebrew ? Locate.startFrom(reader.title) : '');
        state.status = {
          kind: 'info',
          text: !reader
            ? t('שם הספר לא התקבל מאוצריא. כותבים כאן שם ספר ומקום בו.')
            : hebrew
              ? t('המקום בספר לא התקבל מאוצריא. משלימים כאן את המקום, למשל פרק או סימן.')
              : t('לספר הזה אין שם בעברית, ובבר אילן מחפשים לפי שם בעברית. כותבים כאן שם ספר ומקום בו.'),
        };
        this._renderPage();
        this.view.announce(state.status.text);
        return;
      }
      if (Domain.SETUP_SCREENS.has(this.model.screen) || !Domain.serviceCan(this.model.health, 'locate')) {
        // הלשונית מראה מה חסר; המקום כבר בשדה, לכשיתוקן.
        this._fillLocate(reader.refs[0]);
        return;
      }
      await this._track('locateTask', this._locateLadder(reader));
    }

    async _locateLadder(reader) {
      for (let i = 0; i < reader.refs.length; i++) {
        const last = i === reader.refs.length - 1;
        const outcome = await this._locateRef(reader.refs[i], { reader, last });
        if (outcome !== 'notFound') return;
      }
    }

    /**
     * מאתר [ref] ומחזיר 'opened' | 'choices' | 'notFound' | 'failed'. עם
     * [reader] (`Locate.fromReader`) המקורות מדורגים לפי הספר, ו"לא נמצא"
     * שאינו [last] אינו מוצג: ההפניה הכללית הבאה מנסה במקומו.
     */
    async _locateRef(ref, options) {
      const opts = options || {};
      const reader = opts.reader || null;
      const state = this.model.locate;
      Object.assign(state, {
        text: ref,
        ref,
        running: true,
        openingIndex: null,
        status: null,
        choices: null,
        preferred: null,
        readerTitle: reader ? reader.title : null,
      });
      this._renderPage();
      if (reader) this.view.setInputValue('locate-input', ref);
      this.log.info('איתור מקום: ' + ref + (reader ? ' (מספר שפתוח באוצריא)' : ''));
      let outcome = 'failed';
      let best = null;
      try {
        const result = await this.service.locate(ref);
        if (result && result.opened === false && Array.isArray(result.choices)) {
          state.choices = result.choices;
          if (reader) {
            const ranked = Locate.rankChoices(result.choices, reader.title, ref);
            state.preferred = ranked.preferred;
            best = ranked.best;
          }
          outcome = 'choices';
          this.log.info('איתור מקום: ' + result.choices.length + ' מקורות לבחירה');
        } else {
          this._located(ref, result);
          outcome = 'opened';
        }
      } catch (error) {
        outcome = error && error.code === 'referenceNotFound' ? 'notFound' : 'failed';
        if (outcome === 'failed' || !reader || opts.last) {
          state.status = { kind: 'error', text: Domain.errorMessage(error) };
        }
      }
      state.running = false;
      if (outcome === 'notFound' && reader && !opts.last) return outcome;
      this._renderPage();
      if (best !== null) {
        await this._openLocateChoice(best);
      } else if (state.choices) {
        this.view.announce(t('נמצאו {count} מקורות. בוחרים את המקור לפתיחה.', {
          count: Domain.formatCount(state.choices.length),
        }));
        this.view.focusInSheet('locate-choice-' + Locate.displayOrder(state.choices.length, state.preferred)[0]);
      } else if (state.status) {
        this.view.announce(state.status.text);
      }
      return outcome;
    }

    /** בחירה מהמקורות שבר אילן מצא. */
    openLocateChoice(index) {
      if (this.model.locate.running) return Promise.resolve();
      return this._track('locateTask', this._openLocateChoice(index));
    }

    async _openLocateChoice(index) {
      const state = this.model.locate;
      if (state.running || !state.choices || !state.choices[index]) return;
      state.running = true;
      state.openingIndex = index;
      state.status = null;
      this._renderPage();
      let refreshed = false;
      try {
        const result = await this.service.locate(state.ref, index);
        // הבחירה כבר אינה ברשימה של בר אילן: השירות מחזיר רשימה עדכנית, ושום
        // דבר לא נפתח.
        if (result && result.opened === false && Array.isArray(result.choices)) {
          state.choices = result.choices;
          state.preferred = state.readerTitle
            ? Locate.rankChoices(result.choices, state.readerTitle, state.ref).preferred
            : null;
          state.status = { kind: 'info', text: t('בר אילן ענה הפעם ברשימה אחרת. בוחרים שוב את המקור.') };
          refreshed = true;
        } else {
          this._located(state.ref, result, state.choices[index]);
        }
      } catch (error) {
        state.status = { kind: 'error', text: Domain.errorMessage(error) };
      } finally {
        state.running = false;
        state.openingIndex = null;
        this._renderPage();
        if (state.status) this.view.announce(state.status.text);
        if (refreshed) {
          this.view.focusInSheet('locate-choice-' + Locate.displayOrder(state.choices.length, state.preferred)[0]);
        }
      }
    }

    /** המקום נפתח: הודעה, והמקום נשמר בראש "אחרונים". */
    _located(ref, result, choice) {
      const state = this.model.locate;
      state.status = {
        kind: 'success',
        text: Domain.openedMessage((result && result.window) || choice || ref, result),
      };
      this.log.info('נפתח במקום: ' + ((result && result.window) || ref));
      state.history = Locate.remember(state.history, ref);
      this.settings.set('locateHistory', state.history).then(
        (values) => {
          this.model.settings = values;
        },
        (error) => this.log.debug('שמירת המקומות האחרונים נכשלה', error),
      );
    }

    async copyAdvancedQuery() {
      const text = Advanced.buildQuery(this.model.advanced.query);
      if (!text) return;
      try {
        await root.navigator.clipboard.writeText(text);
        await this.runtime.notify.success(t('השאילתה הועתקה.'));
      } catch (_) {
        await this.runtime.notify.error(t('ההעתקה לא הצליחה. אפשר לסמן את השאילתה ולהעתיק ידנית.'));
      }
    }

    // ---------------------------------------------------- הגדרות

    /**
     * מסך הפתיחה הוא הדיאלוג היחיד. 'settings' ו-'help' (מקיצורי דרך ומקוד
     * ישן) הן לשוניות.
     */
    openSheet(sheet, helpTab) {
      if (sheet === 'settings') return this.selectTab('settings');
      if (sheet === 'help') return this.openHelp(helpTab);
      if (sheet !== 'welcome') return undefined;
      this.model.sheet = 'welcome';
      this.view.renderSheet(this.model, this.actions);
      return undefined;
    }

    closeSheet() {
      if (this.model.sheet === null) return;
      this._markWelcomeSeen();
      this.model.sheet = null;
      this.view.renderSheet(this.model, this.actions);
    }

    /** "בואו נתחיל": מסך הפתיחה לא יוצג שוב מעצמו. */
    finishWelcome() {
      this.closeSheet();
    }

    /** שמירה שנכשלה אינה מפריעה: לכל היותר המסך יוצג שוב בפעם הבאה. */
    /** גם התנאי של פריט התפריט ושל ספרי הספרייה: הם מוצגים רק אחרי ההבהרה. */
    _markWelcomeSeen() {
      if (this.model.settings.welcomeSeen) return;
      this.settings.set('welcomeSeen', true).then(
        (values) => {
          this.model.settings = values;
        },
        (error) => this.log.warn('שמירת "מסך הפתיחה הוצג" נכשלה', error),
      );
    }

    /** מתג שנכשל בשמירה חוזר למצבו הקודם, עם הסבר. */
    async setSetting(name, value) {
      try {
        this.model.settings = await this.settings.set(name, value);
        this.service.autoStart = this.model.settings.autoStart;
        this.log.info('הגדרה: ' + name + ' = ' + JSON.stringify(value));
        // כבוי: הרשימה נמחקת מאוצריא; דלוק: נשלחת שוב.
        if (name === 'libraryBooks' && Domain.serviceCan(this.model.health, 'export') && !this.model.buildActive) {
          this.engine.syncLibrary(this.model.status, { enabled: this.model.settings.libraryBooks });
        }
      } catch (error) {
        this.log.warn('שמירת ההגדרה ' + name + ' נכשלה', error);
        await this.runtime.notify.error(t('ההגדרה לא נשמרה. אפשר לנסות שוב.'));
      }
      this._renderPage();
    }

    /** הכפתור שהיה ממוקד נעלם עם ההערה: הפוקוס עובר לתיבת החיפוש. */
    async dismissStartupNotice() {
      await this.setSetting('startupNotice', true);
      this.view.update(this.model, this.actions);
      this.view.focusSearch();
    }

    async setLanguage(value) {
      await this.setSetting('language', value);
      this._applyLanguage({ rerender: true });
    }

    /**
     * מחיל את השפה על הדף. הכותרת בתפריט הלחיצה הימנית מגיעה מהמניפסט
     * בעברית, ומעודכנת כאן בכל מעבר שפה — גם חזרה לעברית, אחרי אנגלית.
     */
    _applyLanguage(options) {
      const opts = options || {};
      const language = I18n.resolveLanguage(this.model.settings.language, this.model.hostLanguage);
      const changed = I18n.configure(language);
      this.view.applyLanguage();
      if (changed || (opts.boot && language !== I18n.SOURCE_LANGUAGE)) {
        this.engine.patchContextMenuTitle();
      }
      if (opts.rerender && changed) {
        this.view.render(this.model, this.actions);
        this.view.renderSheet(this.model, this.actions);
      }
    }

    async createShortcut(location) {
      const created = await this.runtime.callSoft('shortcut.create', {
        label: t('בר אילן באוצריא'),
        location,
      });
      if (created === null) {
        await this.runtime.notify.error(t('לא ניתן היה ליצור את קיצור הדרך.'));
      } else if (created.created) {
        await this.runtime.notify.success(
          location === 'startMenu'
            ? t('"בר אילן באוצריא" נוסף לתפריט התחל.')
            : t('קיצור הדרך נוצר בשולחן העבודה.'),
        );
      }
    }

    // ---------------------------------------------------- עזרה ודיווח

    /** פרטי המערכת ויומן הפעולות, כטקסט אחד להדבקה בפנייה. */
    _diagnostics(options) {
      const forReport = Boolean(options && options.forReport);
      const log = this.log.text({ limit: LOG_COPY_ENTRIES });
      return Log.scrub(
        Panels.statusText(this.model, { forReport }) +
          (log ? '\n\n--- ' + t('יומן פעולות') + ' ---\n' + log : ''),
      );
    }

    async copyEmail() {
      try {
        await root.navigator.clipboard.writeText(Domain.SUPPORT_EMAIL);
        await this.runtime.notify.success(t('הכתובת הועתקה.'));
      } catch (_) {
        await this.runtime.notify.error(t('ההעתקה לא הצליחה. הכתובת: {email}', { email: Domain.SUPPORT_EMAIL }));
      }
    }

    /** תוכנת הדואר שבמחשב, עם פרטי המערכת. בלעדיה — הכתובת להעתקה. */
    async writeEmail() {
      const sent = await this.runtime.callSoft('feedback.sendEmail', {
        to: Domain.SUPPORT_EMAIL,
        subject: t('בר אילן באוצריא {version}', { version: this.model.pluginVersion || '' }).trim(),
        body: '\n\n---\n' + Panels.statusText(this.model, { forReport: true }),
      });
      if (sent === null) {
        await this.runtime.notify.info(
          t('לא נמצאה תוכנת דואר במחשב. אפשר לכתוב מכל תיבת דואר אל {email}.', { email: Domain.SUPPORT_EMAIL }),
        );
      }
    }

    async copyStatus() {
      const text = this._diagnostics();
      try {
        await root.navigator.clipboard.writeText(text);
        await this.runtime.notify.success(t('פרטי המערכת הועתקו.'));
      } catch (_) {
        await this.runtime.notify.error(t('ההעתקה לא הצליחה. אפשר לסמן את הפרטים ולהעתיק ידנית.'));
      }
    }

    editReport(text) {
      this.model.report.text = String(text).slice(0, MAX_REPORT_TEXT);
      this.view.updateReport(this.model);
    }

    /** סוף היומן שנכנס ב-[room] תווים, משורה שלמה ולא מאמצעה. */
    _logTail(room) {
      if (room <= 200) return '';
      let log = this.log.text({ limit: LOG_COPY_ENTRIES });
      if (log.length > room) {
        log = log.slice(-room);
        log = log.slice(log.indexOf('\n') + 1);
      }
      return log ? '\n\n--- ' + t('יומן פעולות') + ' ---\n' + log : '';
    }

    /** `feedback.report` מציג אישור משלו ואינו כפוף לחסם זמן — לא עוטפים אותו. */
    async sendReport() {
      const report = this.model.report;
      if (report.sending || report.text.trim().length < 10) return;
      report.sending = true;
      this._renderPage();
      // התיאור ופרטי המערכת קודם; מהיומן נכנס מה שנשאר, מהסוף (החדש).
      const head =
        report.text.trim().slice(0, MAX_REPORT_TEXT) +
        '\n\n---\n' +
        Panels.statusText(this.model, { forReport: true });
      const room = MAX_REPORT_LENGTH - head.length - 40;
      const details = Log.scrub(head + this._logTail(room)).slice(0, MAX_REPORT_LENGTH);
      try {
        const outcome = await this.runtime.call('feedback.report', { details, reportType: 'bug' });
        if (outcome === 'sent' || outcome === 'queued') {
          report.text = '';
          await this.runtime.notify.success(
            outcome === 'sent'
              ? t('הדיווח נשלח. תודה!')
              : t('הדיווח יישלח כשיהיה חיבור לאינטרנט. תודה!'),
          );
        }
      } catch (error) {
        await this.runtime.notify.error(t('הדיווח לא נשלח. אפשר לנסות שוב מאוחר יותר.'));
      } finally {
        report.sending = false;
        this._renderPage();
      }
    }

    /**
     * מצב האינטרנט עכשיו. אוצריא עשויה לדחות את השאלה (היא דורשת הרשאה שהתוסף
     * אינו מבקש); אז נשאר המצב שנמסר בהפעלה.
     */
    async _checkOnline() {
      const data = await this.runtime.callSoft('app.getConnectivity', { forceRefresh: true });
      const online = connectivityOf(data);
      return online === null ? this.model.online : online;
    }

    /** קישור מ-`Domain.Links`. בלי אינטרנט — הסבר במקום דפדפן שייפתח לדף שגיאה. */
    async openLink(name) {
      const url = Domain.Links[name];
      if (!url) return;
      if (this.model.online === false) this.model.online = await this._checkOnline();
      if (this.model.online === false) {
        await this.runtime.notify.info(
          t('אין כרגע חיבור לאינטרנט, ולכן הדף לא ייפתח. הכתובת: {url}', { url }),
        );
        return;
      }
      this.log.info('פתיחת קישור: ' + name);
      const opened = await this.runtime.callSoft('app.openUrl', { url });
      if (opened === null) {
        await this.runtime.notify.error(t('לא ניתן לפתוח את הדפדפן. הכתובת: {url}', { url }));
      }
    }

    // ---------------------------------------------------- עזר

    _actions() {
      return {
        retry: () => this.retry(),
        download: () => this.openLink('releases'),
        openLink: (name) => this.openLink(name),
        openWelcome: () => this.openSheet('welcome'),
        finishWelcome: () => this.finishWelcome(),
        toggleDetails: (key) => this.toggleDetails(key),
        startBuild: () => this.startBuild(),
        rebuild: () => this.startBuild(),
        cancelBuild: () => this.cancelBuild(),
        search: (query, options) => this.search(query, options),
        browseTo: (path) => this.browseTo(path),
        searchEverywhere: () => this.searchEverywhere(),
        loadMore: () => this.loadMore(),
        selectTab: (tab, options) => this.selectTab(tab, options),
        advancedMode: (mode, how) => this.advancedMode(mode, how),
        advancedBrowse: (path) => this.advancedBrowse(path, { focus: true }),
        advancedSet: (patch, options) => this.advancedSet(patch, options),
        advancedWord: (index, alternative, value) => this.advancedWord(index, alternative, value),
        advancedTerm: (index, patch) => this.advancedTerm(index, patch),
        advancedAddTerm: () => this.advancedAddTerm(),
        advancedRemoveTerm: (index) => this.advancedRemoveTerm(index),
        advancedAddAlternative: (index) => this.advancedAddAlternative(index),
        advancedRemoveAlternative: (index, alternative) => this.advancedRemoveAlternative(index, alternative),
        advancedGap: (index, patch) => this.advancedGap(index, patch),
        advancedScopeMode: (mode) => this.advancedScopeMode(mode),
        advancedToggleScope: (item) => this.advancedToggleScope(item),
        advancedExample: (id) => this.advancedExample(id),
        advancedClear: () => this.advancedClear(),
        runAdvanced: () => this.runAdvanced(),
        showResponsa: () => this.showResponsa(),
        copyAdvancedQuery: () => this.copyAdvancedQuery(),
        locateText: (text) => this.locateText(text),
        locateExample: (value) => this.locateExample(value),
        locateRecent: (value) => this.locateRecent(value),
        locateIn: (book) => this.locateIn(book),
        runLocate: () => this.runLocate(),
        openLocateChoice: (index) => this.openLocateChoice(index),
        open: (book) => this.open(book),
        openHelp: (tab) => this.openHelp(tab),
        closeSheet: () => this.closeSheet(),
        // מסך הפתיחה אינו נסגר בלחיצה מחוץ לו: ההבהרה בו חובה.
        dismissSheet: () => {},
        setSetting: (name, value) => this.setSetting(name, value),
        dismissStartupNotice: () => this.dismissStartupNotice(),
        setLanguage: (value) => this.setLanguage(value),
        createShortcut: (location) => this.createShortcut(location),
        copyStatus: () => this.copyStatus(),
        copyEmail: () => this.copyEmail(),
        writeEmail: () => this.writeEmail(),
        editReport: (text) => this.editReport(text),
        sendReport: () => this.sendReport(),
      };
    }

    /** מסך הפתיחה, ולשונית שאינה "ספרים" — רק כשמשהו בהן השתנה. */
    _renderPage() {
      this.model.log = this.log.entries('info').slice(-LOG_VIEW_ENTRIES);
      if (this.model.sheet !== null) this.view.renderSheet(this.model, this.actions);
      if (this.model.tab !== 'books') this.view.refreshPage(this.model, this.actions);
    }

    _renderResults() {
      if (this.model.screen === Screen.ready) {
        this.view.renderResults(this.model, this.actions);
      }
    }
  }

  /** `plugin.boot.connectivity.isOnline`: אצל התוסף הראשון שנפתח הוא עשוי להיות `null`. */
  function connectivityOf(connectivity) {
    const value = connectivity && connectivity.isOnline;
    return typeof value === 'boolean' ? value : null;
  }

  function describeOnline(online) {
    return online === null ? 'לא ידוע' : online ? 'יש' : 'אין';
  }

  const api = { App, connectivityOf };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaApp = api;
})(typeof self !== 'undefined' ? self : globalThis);
