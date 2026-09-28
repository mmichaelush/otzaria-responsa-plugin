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

  /** בדיקה חוזרת כשהשירות או בר אילן חסרים, כדי שהמסך יתעדכן אחרי התקנה. */
  const POLL_MS = { serviceMissing: 5000, notInstalled: 30000 };

  class App {
    constructor(bridge, view) {
      this.bridge = bridge;
      this.view = view;
      this.service = new ServiceClient(bridge, Domain.SERVICE_URL);
      this.model = {
        screen: Screen.loading,
        platform: null,
        pluginVersion: null,
        health: null,
        status: null,
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
        message: null,
        infoOpen: false,
      };
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

    /** קורא מחדש את מצב השירות ובוחר מסך. לעולם אינו זורק. */
    async refresh() {
      this._stopPolling();
      if (this.model.platform && this.model.platform !== 'windows') {
        this._show(Screen.unsupported);
        return;
      }
      let health = null;
      let status = null;
      let failure = null;
      try {
        health = await this.service.health();
        if (
          health &&
          health.service === Domain.SERVICE_ID &&
          health.apiVersion === Domain.API_VERSION
        ) {
          status = await this.service.status();
        }
      } catch (error) {
        failure = error;
      }
      if (this.suspended) return;
      this.model.health = health;
      this.model.status = status;

      const build = (status && status.build) || {};
      this.model.buildActive = build.state === 'running';
      if (this.model.buildActive) {
        this.model.progress = build;
        this.model.buildStartedAt = build.startedAt
          ? Date.parse(build.startedAt)
          : Date.now();
      }

      let screen = Domain.screenFor({
        platform: this.model.platform,
        health,
        status,
        failure,
      });
      if (screen === Screen.buildFailed) {
        const error = build.error || {};
        // ביטול יזום אינו כשל שצריך להציג.
        if (error.code === 'cancelled') screen = Screen.needsCatalog;
        else this.model.message = error.message || 'הקריאה נכשלה.';
      }
      this._show(screen);
      if (this.model.buildActive) this._watchBuild({ attachOnly: true });
      if (screen === Screen.ready && this.model.query.trim()) {
        this._runSearch(this.model.query, 0);
      }
    }

    _show(screen) {
      this.model.screen = screen;
      this._render();
      const interval = POLL_MS[screen];
      if (interval && !this.suspended) {
        this.pollTimer = setTimeout(() => this.refresh(), interval);
      }
    }

    _stopPolling() {
      if (this.pollTimer) clearTimeout(this.pollTimer);
      this.pollTimer = null;
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
      } catch (error) {
        if (seq !== this.searchSeq) return;
        if (Domain.errorAdvice(error.code).refresh) {
          this.model.searching = false;
          this.model.loadingMore = false;
          this.refresh();
          return;
        }
        this.model.searchError = error.message;
        this.model.results = null;
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
      if (this.model.openingKey !== null) return;
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
        if (Domain.errorAdvice(error.code).refresh) this.refresh();
      } finally {
        this.model.openingKey = null;
        this._renderResults();
      }
    }

    // ---------------------------------------------------- בנייה

    startBuild() {
      if (this.model.buildActive) return;
      this.model.buildActive = true;
      this.model.progress = { stage: 'starting' };
      this.model.buildStartedAt = Date.now();
      this.model.elapsedMs = 0;
      this.model.infoOpen = false;
      this.view.renderInfo(this.model, this.actions);
      if (this.model.screen === Screen.ready) this._renderBanner();
      else this._show(Screen.building);
      this._watchBuild({ attachOnly: false });
    }

    async cancelBuild() {
      if (this.model.cancelling) return;
      this.model.cancelling = true;
      this._renderBuild();
      try {
        await this.service.cancelBuild();
      } catch (error) {
        this._notify('ui.showError', error.message);
      } finally {
        this.model.cancelling = false;
        this._renderBuild();
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
            this._renderBuild();
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
        this._notify(
          'ui.showSuccess',
          'רשימת ספרי בר אילן מוכנה: ' + Domain.booksLabel(terminal.books),
        );
      } else if (
        terminal &&
        terminal.type === 'error' &&
        terminal.code !== 'cancelled' &&
        terminal.code !== 'serviceUnavailable' &&
        this.model.screen === Screen.ready
      ) {
        // בבנייה מחדש הקטלוג הקיים נשאר, ולכן מספיקה הודעה.
        this._notify('ui.showError', terminal.message);
      }
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
        this.model.elapsedMs =
          Date.now() - (this.model.buildStartedAt || Date.now());
        this._renderBuild();
      };
      tick();
      this.clockTimer = setInterval(tick, 5000);
    }

    _stopClock() {
      if (this.clockTimer) clearInterval(this.clockTimer);
      this.clockTimer = null;
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
        retry: () => this.refresh(),
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

    _render() {
      this.view.render(this.model, this.actions);
    }

    _renderResults() {
      if (this.model.screen === Screen.ready) {
        this.view.renderResults(this.model, this.actions);
      }
    }

    _renderBanner() {
      if (this.model.screen === Screen.ready) {
        this.view.renderBanner(this.model, this.actions);
      }
    }

    /** עדכון התקדמות: המסך המלא בבנייה ראשונה, הפס בלבד בבנייה מחדש. */
    _renderBuild() {
      if (this.model.screen === Screen.building) this._render();
      else this._renderBanner();
    }
  }

  /**
   * מחבר את המודל ל-DOM. מסך חדש מחליף את כל התוכן; בתוך מסך החיפוש מתחלפים
   * רק אזור התוצאות והפס העליון, כדי ששדה החיפוש לא יאבד פוקוס או סמן.
   */
  class View {
    constructor(doc) {
      this.doc = doc;
      this.content = doc.querySelector('.content-column');
      this.subtitle = doc.querySelector('.topbar-subtitle');
      this.infoButton = doc.querySelector('.info-toggle');
      this.scrim = doc.querySelector('.overlay-scrim');
      this.panel = doc.querySelector('.overlay-panel');
      this.renderedScreen = null;
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

    render(model, actions) {
      this.subtitle.textContent = subtitleFor(model);
      const node = this._screen(model, actions);
      const wasReady = this.renderedScreen === Screen.ready;
      this.content.replaceChildren(node);
      this.renderedScreen = model.screen;
      if (model.screen === Screen.ready && !wasReady) {
        const input = node.querySelector('.search-input');
        if (input) input.focus();
      }
      if (model.infoOpen) this.panel.replaceChildren(Ui.infoPanel(model, actions));
    }

    renderResults(model, actions) {
      const host = this.content.querySelector('.results-host');
      if (this.renderedScreen !== Screen.ready || !host) {
        this.render(model, actions);
        return;
      }
      const fresh = Ui.readyView(model, actions);
      host.replaceWith(fresh.querySelector('.results-host'));
      // בשורת החיפוש משתנה רק סמן הטעינה; השדה עצמו נשאר אותו אלמנט.
      const bar = this.content.querySelector('.search-bar');
      const spinner = bar.querySelector('.spinner');
      const freshSpinner = fresh.querySelector('.search-bar .spinner');
      if (spinner && !freshSpinner) spinner.remove();
      if (!spinner && freshSpinner) bar.appendChild(freshSpinner);
    }

    renderBanner(model, actions) {
      const host = this.content.querySelector('.banner-host');
      if (!host) return;
      host.replaceChildren(...[Ui.rebuildBanner(model, actions)].filter(Boolean));
      this.subtitle.textContent = subtitleFor(model);
    }

    renderInfo(model, actions) {
      const open = model.infoOpen;
      const wasOpen = this.panel.classList.contains('is-open');
      this.infoButton.setAttribute('aria-pressed', open ? 'true' : 'false');
      this.scrim.classList.toggle('is-open', open);
      this.panel.classList.toggle('is-open', open);
      this.panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        this.panel.replaceChildren(Ui.infoPanel(model, actions));
        const close = this.panel.querySelector('.icon-button');
        if (close) close.focus();
      } else if (wasOpen) {
        this.infoButton.focus();
      }
    }

    _screen(model, actions) {
      switch (model.screen) {
        case Screen.unsupported:
          return Ui.unsupportedView();
        case Screen.serviceMissing:
          return Ui.serviceMissingView(actions);
        case Screen.serviceOutdated:
          return Ui.serviceOutdatedView(actions);
        case Screen.portTaken:
          return Ui.portTakenView(actions);
        case Screen.notInstalled:
          return Ui.notInstalledView(actions);
        case Screen.needsCatalog:
          return Ui.needsCatalogView(
            { version: model.status && model.status.version },
            actions,
          );
        case Screen.building:
          return Ui.buildingView(model, actions);
        case Screen.buildFailed:
          return Ui.buildFailedView(model, actions);
        case Screen.ready:
          return Ui.readyView(model, actions);
        default:
          return Ui.loadingView();
      }
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
          (model.buildActive ? ' · בונה מחדש…' : '')
        );
      case Screen.building:
        return 'קורא את רשימת הספרים…';
      case Screen.serviceMissing:
      case Screen.serviceOutdated:
        return 'נדרשת התקנה';
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
