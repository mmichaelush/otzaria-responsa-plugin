// הבקר: מצב, אירועי מחזור חיים, טיימרים וקריאות לשירות. ה-DOM נבנה ב-
// responsa-view.js, וההחלטות ב-responsa-domain.js; מה שאינו תלוי במסך
// (פתיחה מהספרייה, חיפוש מסומן, שליחת הרשימה לאוצריא) ב-responsa-engine.js.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const { ServiceClient } = root.ResponsaService;
  const { applyTheme } = root.ResponsaTheme;
  const { createRuntime } = root.ResponsaRuntime;
  const { SettingsStore } = root.ResponsaSettings;
  const { Engine } = root.ResponsaEngine;
  const Panels = root.ResponsaPanels;
  const Log = root.ResponsaLog;
  const Icons = root.ResponsaIcons || {};
  const Screen = Domain.Screen;
  const t = (text, vars) => I18n.t(text, vars);

  /** כמה זמן לחכות להקלדה לפני חיפוש. */
  const SEARCH_DEBOUNCE_MS = 250;

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
      this.engine =
        opts.engine ||
        new Engine(this.runtime, this.service, {
          log: this.log,
          onActivity: (activity) => this._setActivity(activity),
        });
      this.model = {
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
        /** בנייה רצה, בכל מסך. */
        buildActive: false,
        progress: null,
        buildStartedAt: null,
        elapsedMs: 0,
        cancelling: false,
        settings: this.settings.values,
        /** `null` | 'settings' | 'help' | 'welcome'. */
        sheet: null,
        helpTab: Panels.HelpTab.guide,
        report: { text: '', sending: false },
        /** פעולה שהגיעה מהספרייה או מלחיצה ימנית: `{ kind, title }`. */
        activity: null,
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
      /** הרשימה שהעץ המוצג נבנה ממנה: רשימה שנקראה מחדש בונה אותו מחדש. */
      this.browseCatalog = null;
      /** אייקוני אוצריא והסמל של בר אילן: לכל גרסת שירות, עד שלושה ניסיונות. */
      this.icons = { version: null, attempts: 0, loaded: false };
      this.actions = this._actions();
      // גופן האייקונים של אוצריא נטען: כל מה שעל המסך מצויר מחדש.
      if (Icons.onChange) {
        Icons.onChange(() => {
          this.view.redraw(this.model, this.actions);
          this._renderSheet();
        });
      }
      // רשומה חדשה מתעדכנת ב"מצב המערכת" כשהוא פתוח, פעם אחת לכל סדרה.
      this.log.subscribe((entry) => {
        if (entry.level === 'debug' || this.logRender) return;
        if (this.model.sheet !== 'help' || this.model.helpTab !== Panels.HelpTab.status) return;
        this.logRender = setTimeout(() => {
          this.logRender = null;
          this._renderSheet();
        }, 250);
      });
    }

    // ---------------------------------------------------- מחזור חיים

    async boot(payload) {
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
      this.model.browse = { ...this.model.browse, path: this.model.settings.browsePath };
      this._applyLanguage({ boot: true });
      this.log.info(
        'הפעלה: תוסף ' + this.model.pluginVersion + ', אוצריא ' + this.model.appVersion +
          ', שפה ' + I18n.language + ', אינטרנט: ' + describeOnline(this.model.online),
      );
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
      this._renderSheet();
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
      if (view === 'settings') this.openSheet('settings');
      else if (view === 'help') this.openSheet('help', param.tab);
      else if (view === 'welcome') this.openSheet('welcome');
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
      this._renderSheet();
      if (build.state === 'running' && !this.buildWatch) {
        this._watchBuild({ attachOnly: true });
      }
      if (screen === Screen.ready && !this.model.buildActive && Domain.serviceCan(health, 'export')) {
        this.engine.syncLibrary(status);
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
      this._renderSheet();
      try {
        await this.refresh();
      } finally {
        this.model.checking = false;
        this.view.update(this.model, this.actions);
        this._renderSheet();
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
        await this.runtime.notify.success(root.ResponsaEngine.openedMessage(book.title, result));
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

    /** אירוע מהמנוע: "פותח…"/"מחפש…" בדף, כשהאירוע הגיע ללשונית. */
    _setActivity(activity) {
      this.model.activity = activity;
      if (this.model.screen === Screen.ready) this.view.update(this.model, this.actions);
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

    // ---------------------------------------------------- הגדרות

    openSheet(sheet, helpTab) {
      if (sheet === 'help' && helpTab && Object.values(Panels.HelpTab).includes(helpTab)) {
        this.model.helpTab = helpTab;
      }
      // מעבר ממסך הפתיחה לעזרה הוא גם סגירה שלו.
      if (this.model.sheet === 'welcome' && sheet !== 'welcome') this._markWelcomeSeen();
      this.model.sheet = sheet;
      this.model.log = this.log.entries('info').slice(-LOG_VIEW_ENTRIES);
      this.view.renderSheet(this.model, this.actions);
    }

    closeSheet() {
      if (this.model.sheet === null) return;
      if (this.model.sheet === 'welcome') this._markWelcomeSeen();
      this.model.sheet = null;
      this.view.renderSheet(this.model, this.actions);
    }

    /** "בואו נתחיל": מסך הפתיחה לא יוצג שוב מעצמו. */
    finishWelcome() {
      this.closeSheet();
      this.view.focusSearch();
    }

    /** שמירה שנכשלה אינה מפריעה: לכל היותר המסך יוצג שוב בפעם הבאה. */
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
        this.log.info('הגדרה: ' + name + ' = ' + JSON.stringify(value));
      } catch (error) {
        this.log.warn('שמירת ההגדרה ' + name + ' נכשלה', error);
        await this.runtime.notify.error(t('ההגדרה לא נשמרה. אפשר לנסות שוב.'));
      }
      this._renderSheet();
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
      this._renderSheet();
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
        this._renderSheet();
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
        open: (book) => this.open(book),
        openSettings: () => this.openSheet('settings'),
        openHelp: (tab) => this.openSheet('help', tab),
        closeSheet: () => this.closeSheet(),
        dismissSheet: () => {
          if (this.model.sheet === 'welcome') return;
          this.closeSheet();
        },
        setSetting: (name, value) => this.setSetting(name, value),
        dismissStartupNotice: () => this.dismissStartupNotice(),
        setLanguage: (value) => this.setLanguage(value),
        createShortcut: (location) => this.createShortcut(location),
        copyStatus: () => this.copyStatus(),
        editReport: (text) => this.editReport(text),
        sendReport: () => this.sendReport(),
      };
    }

    _renderSheet() {
      if (this.model.sheet === null) return;
      this.model.log = this.log.entries('info').slice(-LOG_VIEW_ENTRIES);
      this.view.renderSheet(this.model, this.actions);
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
