// הבקר: מצב, אירועי מחזור חיים, טיימרים וקריאות לשירות. ה-DOM נבנה ב-
// responsa-ui.js, וההחלטות ב-responsa-domain.js.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Ui = root.ResponsaUi;
  const { ServiceClient } = root.ResponsaService;
  const { applyTheme } = root.ResponsaTheme;
  const Screen = Domain.Screen;

  const RELEASES_URL =
    'https://github.com/mmichaelush/otzaria-responsa-plugin/releases/latest';
  const GUIDE_URL =
    'https://github.com/mmichaelush/otzaria-responsa-plugin/blob/main/docs/USER_GUIDE.md';

  /** כמה זמן לחכות להקלדה לפני חיפוש. */
  const SEARCH_DEBOUNCE_MS = 250;

  /** בדיקה חוזרת כשמשהו חסר, כדי שהמסך יתעדכן מעצמו אחרי התקנה. */
  const POLL_MS = {
    [Screen.serviceMissing]: 5000,
    [Screen.serviceError]: 10000,
    [Screen.portTaken]: 15000,
    [Screen.notInstalled]: 30000,
  };

  class App {
    constructor(bridge, view, options) {
      this.bridge = bridge;
      this.view = view;
      this.service = (options && options.service) || new ServiceClient(bridge);
      this.model = {
        screen: Screen.loading,
        platform: null,
        permissions: null,
        pluginVersion: null,
        health: null,
        status: null,
        message: null,
        checking: false,
        query: '',
        results: null,
        total: 0,
        searching: false,
        loadingMore: false,
        searchError: null,
        openingKey: null,
        /** בנייה רצה, בכל מסך. */
        buildActive: false,
        progress: null,
        buildStartedAt: null,
        elapsedMs: 0,
        cancelling: false,
        infoOpen: false,
      };
      this.refreshSeq = 0;
      this.searchSeq = 0;
      this.searchTimer = null;
      this.pollTimer = null;
      this.clockTimer = null;
      this.buildWatch = null;
      this.suspended = false;
      this.actions = this._actions();
    }

    // ---------------------------------------------------- מחזור חיים

    boot(payload) {
      const info = payload || {};
      applyTheme(info.theme);
      this.model.platform = (info.app && info.app.platform) || null;
      this.model.pluginVersion = (info.plugin && info.plugin.version) || null;
      if (Array.isArray(info.permissions)) this.model.permissions = info.permissions;
      return this.refresh();
    }

    /** המשתמש שינה הרשאות בהגדרות: ייתכן שעכשיו יש (או אין) ערוץ לשירות. */
    permissionsChanged(permissions) {
      if (Array.isArray(permissions)) this.model.permissions = permissions;
      return this.refresh();
    }

    /** אוצריא מקפיאה לשונית שאינה מוצגת; הבנייה ממשיכה בשירות. */
    suspend() {
      this.suspended = true;
      this._stopPolling();
      this._stopWatchingBuild();
      this._stopClock();
    }

    resume() {
      this.suspended = false;
      return this.refresh();
    }

    // ---------------------------------------------------- מצב השירות

    /**
     * קורא מחדש את מצב השירות ובוחר מסך. לעולם אינו זורק. רענון שהתחיל לפני
     * רענון אחר נזרק כשהוא חוזר, כדי שתשובה ישנה לא תדרוס מצב חדש.
     */
    async refresh(options) {
      const seq = ++this.refreshSeq;
      this._stopPolling();
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
      this.model.message = failure ? failure.message : null;

      const build = (status && status.build) || {};
      // בנייה שהתחלנו כאן והשירות עוד לא דיווח עליה עדיין רצה.
      this.model.buildActive = build.state === 'running' || this.buildWatch !== null;
      if (build.state === 'running') {
        this.model.progress = build;
        this.model.buildStartedAt = build.startedAt
          ? Date.parse(build.startedAt)
          : Date.now();
      }

      const screen = Domain.screenFor({
        platform: this.model.platform,
        permissions: this.model.permissions,
        health,
        status,
        failure,
      });
      if (screen === Screen.buildFailed) {
        this.model.message = (build.error && build.error.message) || 'הקריאה נכשלה.';
      }
      this._show(screen);
      if (build.state === 'running' && !this.buildWatch) {
        this._watchBuild({ attachOnly: true });
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
        const page = await this.service.search(query, offset, Domain.PAGE_SIZE);
        // תשובה ישנה שהגיעה אחרי הקלדה חדשה נזרקת.
        if (seq !== this.searchSeq) return;
        this.model.results = more
          ? this.model.results.concat(page.results)
          : page.results;
        this.model.total = page.total;
        this.model.searchError = null;
        if (!more) {
          this.view.announce(
            page.total === 0 ? 'לא נמצאו ספרים' : Domain.foundLabel(page.total),
          );
        }
      } catch (error) {
        if (seq !== this.searchSeq) return;
        this.model.searchError = error.message;
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

    // ---------------------------------------------------- פתיחה

    async open(book) {
      if (this.model.openingKey !== null || this.model.buildActive) return;
      this.model.openingKey = book.key;
      this._renderResults();
      try {
        const result = await this.service.open(book.key);
        this._notify(
          'ui.showSuccess',
          result && result.broughtToFront === false
            ? '"' + book.title + '" נפתח בבר אילן. אם החלון לא הופיע, הוא בשורת המשימות.'
            : '"' + book.title + '" נפתח בבר אילן',
        );
      } catch (error) {
        this._notify('ui.showError', error.message);
        if (Domain.needsRefresh(error.code)) this.refresh({ rerunSearch: false });
      } finally {
        this.model.openingKey = null;
        this._renderResults();
      }
    }

    // ---------------------------------------------------- בנייה

    startBuild() {
      if (this.model.buildActive) return;
      Object.assign(this.model, {
        buildActive: true,
        progress: { stage: 'starting' },
        buildStartedAt: Date.now(),
        elapsedMs: 0,
        cancelling: false,
      });
      this._setInfo(false);
      if (this.model.screen === Screen.ready) {
        this.view.update(this.model, this.actions);
        this._renderResults();
      } else {
        this._show(Screen.building);
      }
      this.view.announce('קריאת רשימת הספרים התחילה');
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
        this._notify('ui.showError', error.message);
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
            this._buildFinished(
              { type: 'error', code: error.code, message: error.message },
              controller,
            ),
        );
    }

    _buildFinished(terminal, controller) {
      if (this.buildWatch !== controller || controller.signal.aborted) return;
      this.buildWatch = null;
      this._stopClock();
      this.model.buildActive = false;
      this.model.cancelling = false;
      if (terminal && terminal.type === 'done') {
        const text = 'רשימת ספרי בר אילן מוכנה: ' + Domain.booksLabel(terminal.books);
        this._notify('ui.showSuccess', text);
        this.view.announce(text);
      } else if (terminal && terminal.type === 'error' && terminal.code === 'cancelled') {
        this.view.announce('קריאת רשימת הספרים בוטלה');
      }
      // כשל מוצג מתוך /status: מסך כשל בבנייה ראשונה, הערה בבנייה מחדש.
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

    // ---------------------------------------------------- עזר

    async _notify(method, message) {
      try {
        await this.bridge.call(method, { message });
      } catch (_) {
        // הודעה שלא הוצגה אינה סיבה להפיל את הפעולה שהסתיימה.
      }
    }

    async _openUrl(url) {
      let ok = false;
      try {
        const response = await this.bridge.call('app.openUrl', { url });
        ok = !response || response.success !== false;
      } catch (_) {
        ok = false;
      }
      if (!ok) {
        this._notify('ui.showError', 'לא ניתן לפתוח את הדפדפן. הכתובת: ' + url);
      }
    }

    _actions() {
      return {
        retry: () => this.retry(),
        download: () => this._openUrl(RELEASES_URL),
        openGuide: () => this._openUrl(GUIDE_URL),
        startBuild: () => this.startBuild(),
        rebuild: () => this.startBuild(),
        cancelBuild: () => this.cancelBuild(),
        search: (query, options) => this.search(query, options),
        loadMore: () => this.loadMore(),
        open: (book) => this.open(book),
        toggleInfo: () => this._setInfo(!this.model.infoOpen),
        closeInfo: () => this._setInfo(false),
      };
    }

    _setInfo(open) {
      if (this.model.infoOpen === open) return;
      this.model.infoOpen = open;
      this.view.renderInfo(this.model, this.actions);
    }

    _renderResults() {
      if (this.model.screen === Screen.ready) {
        this.view.renderResults(this.model, this.actions);
      }
    }
  }

  /**
   * מחבר את המודל ל-DOM. [render] בונה מסך חדש; [update] מעדכן את המסך
   * הנוכחי במקום (התקדמות, פס עליון, הערות), כדי שלחיצה, פוקוס ואנימציה לא
   * ייקטעו כמה פעמים בשנייה.
   */
  class View {
    constructor(doc) {
      this.doc = doc;
      this.shell = doc.querySelector('.app-shell');
      this.content = doc.querySelector('.content-column');
      this.subtitle = doc.querySelector('.topbar-subtitle');
      this.infoButton = doc.querySelector('.info-toggle');
      this.scrim = doc.querySelector('.overlay-scrim');
      this.panel = doc.querySelector('.overlay-panel');
      this.live = doc.querySelector('.live-region');
      this.renderedScreen = null;
      this.panel.inert = true;
    }

    bind(actions) {
      this.infoButton.addEventListener('click', actions.toggleInfo);
      this.scrim.addEventListener('click', actions.closeInfo);
      this.doc.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.panel.classList.contains('is-open')) {
          actions.closeInfo();
        }
      });
    }

    /** הודעה לקורא מסך, דרך אזור קבוע (אזור שנוצר זה עתה אינו מוכרז). */
    announce(text) {
      if (!this.live) return;
      this.live.textContent = '';
      // שינוי בתוך אותו frame לא תמיד מוכרז; טקסט זהה ברצף בכלל לא.
      setTimeout(() => {
        this.live.textContent = text;
      }, 50);
    }

    render(model, actions) {
      this._subtitle(model);
      const wasReady = this.renderedScreen === Screen.ready;
      const node = Ui.screenView(model, actions);
      this.content.replaceChildren(node);
      this.renderedScreen = model.screen;
      if (model.screen === Screen.ready && !wasReady) {
        const input = node.querySelector('.search-input');
        if (input) input.focus();
      }
      const title = node.querySelector('[data-role="title"], [data-role="label"]');
      if (title && model.screen !== Screen.ready) this.announce(title.textContent);
      if (model.infoOpen) this._refreshPanel(model, actions);
    }

    update(model, actions) {
      if (this.renderedScreen !== model.screen) {
        this.render(model, actions);
        return;
      }
      this._subtitle(model);
      if (model.screen === Screen.building) {
        Ui.updateProgress(this.content, model);
      } else if (model.screen === Screen.ready) {
        this._updateReady(model, actions);
      }
      const retry = this.content.querySelector('[data-focus-key="retry"]');
      if (retry) Ui.setBusy(retry, model.checking, 'בודק…', 'בדיקה חוזרת');
      if (model.infoOpen) this._refreshPanel(model, actions);
    }

    _updateReady(model, actions) {
      const bannerHost = this.content.querySelector('.banner-host');
      if (bannerHost) {
        const banner = bannerHost.firstElementChild;
        if (model.buildActive && banner) Ui.updateProgress(banner, model);
        else if (model.buildActive) bannerHost.replaceChildren(Ui.rebuildBanner(model, actions));
        else if (banner) this._preservingFocus(() => bannerHost.replaceChildren());
      }
      const noticeHost = this.content.querySelector('.notice-host');
      if (noticeHost) {
        const next = Ui.noticeView(model, actions);
        const current = noticeHost.firstElementChild;
        const same =
          (!next && !current) ||
          (next && current && next.textContent === current.textContent);
        if (!same) this._preservingFocus(() => noticeHost.replaceChildren(...[next].filter(Boolean)));
      }
    }

    renderResults(model, actions) {
      const host = this.content.querySelector('.results-host');
      if (this.renderedScreen !== Screen.ready || !host) {
        this.render(model, actions);
        return;
      }
      this._preservingFocus(() => {
        host.replaceChildren(...[Ui.resultsBlock(model, actions)].filter(Boolean));
      });
      const spinner = this.content.querySelector('[data-role="search-spinner"]');
      if (spinner) spinner.hidden = !model.searching;
    }

    renderInfo(model, actions) {
      const open = model.infoOpen;
      const wasOpen = this.panel.classList.contains('is-open');
      this.infoButton.setAttribute('aria-pressed', open ? 'true' : 'false');
      this.scrim.classList.toggle('is-open', open);
      this.panel.classList.toggle('is-open', open);
      this.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      // inert: לוח סגור לא מקבל Tab, ולוח פתוח לא נותן לברוח ממנו לדף שמאחור.
      this.panel.inert = !open;
      if (this.shell) this.shell.inert = open;
      if (open) {
        this.panel.replaceChildren(Ui.infoPanel(model, actions));
        const close = this.panel.querySelector('[data-focus-key="close-info"]');
        if (close) close.focus();
      } else if (wasOpen) {
        this.infoButton.focus();
      }
    }

    _refreshPanel(model, actions) {
      this._preservingFocus(() => {
        this.panel.replaceChildren(Ui.infoPanel(model, actions));
      }, this.panel);
    }

    /** מחזיר את הפוקוס לכפתור עם אותו מפתח אחרי שהתוכן נבנה מחדש. */
    _preservingFocus(replace, scope) {
      const active = this.doc.activeElement;
      const key = active && active.dataset ? active.dataset.focusKey : null;
      replace();
      if (!key || this.doc.activeElement === active) return;
      const container = scope || this.content;
      const again = container.querySelector('[data-focus-key="' + CSS.escape(key) + '"]');
      if (again && !again.disabled) again.focus();
    }

    _subtitle(model) {
      const text = subtitleFor(model);
      if (this.subtitle.textContent !== text) this.subtitle.textContent = text;
    }
  }

  function subtitleFor(model) {
    const status = model.status || {};
    const catalog = status.catalog || {};
    switch (model.screen) {
      case Screen.ready:
        return (
          Domain.booksLabel(catalog.bookCount) +
          (status.version ? ' · מהדורה ' + status.version : '') +
          (model.buildActive ? ' · קורא מחדש…' : '')
        );
      case Screen.building:
        return 'קורא את רשימת הספרים…';
      case Screen.serviceMissing:
      case Screen.serviceOutdated:
      case Screen.pluginOutdated:
        return 'נדרשת התקנה';
      case Screen.permissionDenied:
        return 'נדרשת הרשאה';
      case Screen.needsCatalog:
      case Screen.buildFailed:
        return 'נדרשת הכנה חד-פעמית';
      default:
        return '';
    }
  }

  const api = { App, View, subtitleFor };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaApp = api;
})(typeof self !== 'undefined' ? self : globalThis);
