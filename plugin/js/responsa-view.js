// מחבר את המודל ל-DOM. התוסף בנוי מלשוניות: "ספרים", "חיפוש בטקסט", "איתור
// מקום", "הגדרות" ו"עזרה". [render] בונה את הלשונית הנוכחית מחדש; [update]
// מעדכן אותה במקום (התקדמות, הערות), כדי שלחיצה, פוקוס ואנימציה לא ייקטעו
// כמה פעמים בשנייה. מסך הפתיחה הוא הדיאלוג היחיד.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const Ui = root.ResponsaUi;
  const Panels = root.ResponsaPanels;
  const { icon } = root.ResponsaIcons;
  const Screen = Domain.Screen;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /** הלשוניות, לפי הסדר. */
  const TABS = Object.freeze([
    { id: 'books', label: N('ספרים'), iconName: 'library_24_regular' },
    { id: 'text', label: N('חיפוש בטקסט'), iconName: 'database_search_24_regular' },
    { id: 'locate', label: N('איתור מקום'), iconName: 'document_search_24_regular' },
    { id: 'settings', label: N('הגדרות'), iconName: 'settings_24_regular' },
    { id: 'help', label: N('עזרה'), iconName: 'question_circle_24_regular' },
  ]);

  const SETUP_SCREENS = Domain.SETUP_SCREENS;

  /** אזורים נגללים, שמקום הגלילה בהם נשמר כשהלשונית נבנית מחדש. */
  const SCROLLERS = '.app-content, .dialog-body, .log-list';

  class View {
    constructor(doc) {
      this.doc = doc;
      this.shell = doc.querySelector('.app-shell');
      this.content = doc.querySelector('.content-column');
      this.scroller = doc.querySelector('.app-content');
      this.tabBar = doc.querySelector('.main-tabs');
      this.title = doc.querySelector('.topbar-title');
      this.subtitle = doc.querySelector('.topbar-subtitle');
      this.showButton = doc.querySelector('.show-responsa');
      this.scrim = doc.querySelector('.overlay-scrim');
      this.dialog = doc.querySelector('.help-dialog');
      this.live = doc.querySelector('.live-region');
      /** מה בנוי עכשיו: הלשונית, והמסך שבה (ב"ספרים"). */
      this.rendered = { tab: null, screen: null, markup: null };
      /** כפתורי הלשוניות, בשפה הנוכחית ([_renderTabs]). */
      this.tabButtons = null;
      this.openSheet = null;
      this.returnFocus = null;
      this.dialog.inert = true;
    }

    bind(actions) {
      this.actions = actions;
      this.showButton.addEventListener('click', actions.showResponsa);
      this.scrim.addEventListener('click', actions.dismissSheet);
      this.doc.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.openSheet) {
          event.preventDefault();
          actions.finishWelcome();
        }
      });
      // חצים בין הלשוניות (ARIA tabs), גם בשורה הראשית וגם בעזרה.
      this.doc.addEventListener('keydown', (event) => {
        const tab = event.target.closest && event.target.closest('[role="tab"]');
        if (!tab) return;
        const list = tab.closest('[role="tablist"]');
        const tabs = [...list.querySelectorAll('[role="tab"]')];
        const index = tabs.indexOf(tab);
        const rtl = this.doc.documentElement.dir !== 'ltr';
        const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[event.key];
        let next = null;
        if (step) next = tabs[(index + step + tabs.length) % tabs.length];
        else if (event.key === 'Home') next = tabs[0];
        else if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        if (list === this.tabBar) actions.selectTab(next.dataset.tab, { focusTab: true });
        else actions.openHelp(next.dataset.tab);
      });
    }

    /** טקסטים סטטיים של הפס העליון, בשפה הנוכחית. */
    applyLanguage() {
      I18n.applyDocumentLanguage(this.doc);
      const title = t('פרויקט השו"ת (בר אילן)');
      this.doc.title = title;
      this.title.textContent = title;
      this.tabBar.setAttribute('aria-label', t('לשוניות התוסף'));
      // שמות הלשוניות בשפה החדשה: הכפתורים נבנים מחדש ברינדור הבא.
      this.tabButtons = null;
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

    // ------------------------------------------------------ לשוניות

    /**
     * הכפתורים נבנים פעם אחת ומתעדכנים במקום: כפתור שנבנה מחדש מתחת
     * לפוקוס מפיל אותו ל-`body` — בלחיצה על לשונית, ובכל רינדור בזמן
     * שהמשתמש על שורת הלשוניות.
     */
    _renderTabs(model) {
      if (!this.tabButtons) {
        this.tabButtons = TABS.map((tab) =>
          Ui.el(
            'button',
            {
              type: 'button',
              class: 'main-tab',
              role: 'tab',
              id: 'main-tab-' + tab.id,
              'aria-controls': 'main-panel',
              // בחלון צר מוצג רק האייקון, ואז זה השם היחיד של הלשונית.
              title: t(tab.label),
              onclick: () => this.actions.selectTab(tab.id),
              dataset: { tab: tab.id, focusKey: 'main-tab-' + tab.id },
            },
            icon(tab.iconName),
            Ui.el('span', { class: 'main-tab-label' }, t(tab.label)),
          ),
        );
        this.tabBar.replaceChildren(...this.tabButtons);
      }
      TABS.forEach((tab, index) => {
        const selected = tab.id === model.tab;
        this.tabButtons[index].setAttribute('aria-selected', selected ? 'true' : 'false');
        this.tabButtons[index].setAttribute('tabindex', selected ? '0' : '-1');
      });
      this.content.setAttribute('aria-labelledby', 'main-tab-' + model.tab);
    }

    _renderShowButton(model) {
      const can = Domain.serviceCan(model.health, 'showResponsa') && !SETUP_SCREENS.has(model.screen);
      this.showButton.hidden = !can;
      if (!can) return;
      const label = model.showing ? t('פותח…') : t('פתיחת בר אילן');
      this.showButton.replaceChildren(
        model.showing ? Ui.el('span', { class: 'spinner', 'aria-hidden': 'true' }) : icon('open_24_regular'),
        Ui.el('span', { class: 'show-responsa-label' }, label),
      );
      // בחלון צר רק האייקון מוצג, והשם עובר לתווית.
      this.showButton.setAttribute('aria-label', label);
      this.showButton.title = label;
      this.showButton.disabled = model.showing;
      this.showButton.dataset.focusKey = 'show-responsa';
    }

    /** האם בלשונית [tab] מוצג מה שחסר במקום התוכן שלה. */
    _setupShown(model, tab) {
      return (tab === 'text' || tab === 'locate') && SETUP_SCREENS.has(model.screen);
    }

    _pageFor(model, actions) {
      switch (model.tab) {
        case 'text':
          return this._setupShown(model, 'text')
            ? Ui.screenView(model, actions)
            : root.ResponsaAdvancedUi.textSearchPage(model, actions);
        case 'locate':
          return this._setupShown(model, 'locate')
            ? Ui.screenView(model, actions)
            : root.ResponsaLocateUi.locatePage(model, actions);
        case 'settings':
          return Panels.settingsPage(model, actions);
        case 'help':
          return Panels.helpPage(model, actions);
        default:
          return Ui.screenView(model, actions);
      }
    }

    /** הלשונית נבנית מחדש: בכניסה אליה, ובמעבר בין מסכים של "ספרים". */
    render(model, actions) {
      this._subtitle(model);
      this._renderTabs(model);
      this._renderShowButton(model);
      const previous = this.rendered;
      const tabChanged = previous.tab !== model.tab;
      const wasReady = previous.screen === Screen.ready;
      const node = this._pageFor(model, actions);
      this.content.replaceChildren(node);
      this.rendered = { tab: model.tab, screen: model.screen, markup: node.outerHTML };
      if (tabChanged && this.scroller) this.scroller.scrollTop = 0;

      if (model.tab === 'books' || this._setupShown(model, model.tab)) {
        if (model.screen === Screen.ready && model.tab === 'books' && (!wasReady || tabChanged) && !this.openSheet) {
          if (!this._tabFocused()) {
            const input = node.querySelector('.search-input');
            if (input) input.focus();
          }
        }
        const title = node.querySelector('[data-role="title"], [data-role="label"]');
        if (title && model.screen !== Screen.ready) this.announce(title.textContent);
      }
    }

    /** המשתמש עובר בין הלשוניות בחצים: הפוקוס נשאר על הלשונית. */
    _tabFocused() {
      const active = this.doc.activeElement;
      return Boolean(active && active.classList && active.classList.contains('main-tab'));
    }

    /** הפוקוס ללשונית שנבחרה (מעבר בחצים). */
    focusTab(tab) {
      const button = this.tabBar.querySelector('[data-tab="' + tab + '"]');
      if (button) button.focus();
    }

    /** הפוקוס לשדה הראשון של הלשונית (מעבר בלחיצה). */
    focusPage(model) {
      if (this.openSheet || this._tabFocused()) return;
      const selector = {
        books: '.search-input',
        text: '.simple-input, [data-focus-key="adv-word-0-0"], .manual-input',
        locate: '.locate-input',
      }[model.tab];
      const target = selector && this.content.querySelector(selector);
      if (target) target.focus();
    }

    update(model, actions) {
      const tabSetup = this._setupShown(model, model.tab);
      const wasSetup = this._setupShown({ screen: this.rendered.screen }, model.tab);
      const screenMatters = model.tab === 'books' || tabSetup || wasSetup;
      if (this.rendered.tab !== model.tab || (screenMatters && this.rendered.screen !== model.screen)) {
        this.render(model, actions);
        return;
      }
      this.rendered.screen = model.screen;
      this._subtitle(model);
      this._renderShowButton(model);
      if (model.tab === 'books' || tabSetup) {
        if (model.screen === Screen.building) {
          Ui.updateProgress(this.content, model);
        } else if (model.screen === Screen.ready && model.tab === 'books') {
          this._updateReady(model, actions);
        }
        const retry = this.content.querySelector('[data-focus-key="retry"]');
        if (retry) Ui.setBusy(retry, model.checking, t('בודק…'), t('בדיקה חוזרת'));
        return;
      }
      this.refreshPage(model, actions);
    }

    /**
     * בונה מחדש לשונית שאינה "ספרים" רק כשמשהו בה השתנה, ושומר על הפוקוס
     * ועל הגלילה: רענון תקופתי שלא שינה דבר אינו נוגע בה.
     */
    refreshPage(model, actions) {
      if (this.rendered.tab !== model.tab) {
        this.render(model, actions);
        return;
      }
      if (model.tab === 'books' && !this._setupShown(model, model.tab)) return;
      const next = this._pageFor(model, actions);
      const markup = next.outerHTML;
      if (markup === this.rendered.markup) return;
      this.rendered.markup = markup;
      const active = this.doc.activeElement;
      const onTab = Boolean(active && active.getAttribute && active.getAttribute('role') === 'tab');
      const scrolls = [...this.doc.querySelectorAll(SCROLLERS)].map((node) => node.scrollTop);
      this._preservingFocus(() => this.content.replaceChildren(next));
      this.doc.querySelectorAll(SCROLLERS).forEach((node, i) => {
        if (scrolls[i]) node.scrollTop = scrolls[i];
      });
      // מעבר בין כרטיסיות העזרה: הפוקוס עובר לכרטיסייה שנבחרה.
      const selected = onTab && this.content.querySelector('.secondary-tabs [role="tab"][aria-selected="true"]');
      if (selected) selected.focus();
    }

    /**
     * שדה שהקוד מילא (דוגמה, "פתיחה במקום מסוים"). `value` אינו חלק מה-markup
     * ש-[refreshPage] משווה, ולכן בלי זה השדה נשאר כפי שהיה.
     */
    setInputValue(focusKey, value) {
      const input = this.content.querySelector('[data-focus-key="' + focusKey + '"]');
      if (input && input.value !== value) input.value = value;
    }

    _updateReady(model, actions) {
      const bannerHost = this.content.querySelector('.banner-host');
      if (bannerHost) {
        const banner = bannerHost.firstElementChild;
        if (model.buildActive && banner) Ui.updateProgress(banner, model);
        else if (model.buildActive) bannerHost.replaceChildren(Ui.rebuildBanner(model, actions));
        else if (banner) this._preservingFocus(() => bannerHost.replaceChildren());
      }
      this._replaceIfChanged('.notice-host', Ui.noticeView(model, actions));
    }

    /** מחליף רק כשהטקסט השתנה, כדי שכפתור בתוך ההערה לא יאבד פוקוס. */
    _replaceIfChanged(selector, next) {
      const host = this.content.querySelector(selector);
      if (!host) return;
      const current = host.firstElementChild;
      const same = (!next && !current) || (next && current && next.textContent === current.textContent);
      if (!same) this._preservingFocus(() => host.replaceChildren(...[next].filter(Boolean)));
    }

    renderResults(model, actions) {
      if (model.tab !== 'books') return;
      const host = this.content.querySelector('.results-host');
      if (this.rendered.screen !== Screen.ready || this.rendered.tab !== 'books' || !host) {
        this.render(model, actions);
        return;
      }
      this._preservingFocus(() => {
        host.replaceChildren(...[Ui.resultsBlock(model, actions)].filter(Boolean));
      });
      const input = this.content.querySelector('.search-input');
      if (input) {
        const label = Ui.searchLabel(model);
        input.placeholder = label;
        input.setAttribute('aria-label', label);
      }
      const spinner = this.content.querySelector('[data-role="search-spinner"]');
      if (spinner) spinner.hidden = !model.searching;
    }

    /** אייקוני אוצריא נטענו: הכול מצויר מחדש, והפוקוס נשמר. */
    redraw(model, actions) {
      this._preservingFocus(() => this.render(model, actions));
    }

    /**
     * אחרי מעבר קטגוריה הכפתור שנלחץ כבר אינו קיים: הפוקוס עובר לכותרת
     * הקטגוריה, כדי שקורא מסך יכריז עליה וטאב ימשיך ממנה.
     */
    focusBrowse() {
      if (this.openSheet || this.rendered.tab !== 'books') return;
      const active = this.doc.activeElement;
      if (active && active !== this.doc.body && this.doc.contains(active)) return;
      const target =
        this.content.querySelector('.browse-heading') || this.content.querySelector('.search-input');
      if (target) target.focus();
    }

    focusSearch() {
      const input = this.content.querySelector('.search-input');
      if (input && !this.openSheet) input.focus();
    }

    // ------------------------------------------------ מסך הפתיחה

    /**
     * מציג או סוגר את מסך הפתיחה (`model.sheet === 'welcome'`). הוא חוסם את
     * הדף שמאחוריו (inert), ובסגירה הפוקוס חוזר למקומו.
     */
    renderSheet(model, actions) {
      const wanted = model.sheet === 'welcome' ? 'welcome' : null;
      const opening = wanted !== null && this.openSheet === null;
      const closing = wanted === null && this.openSheet !== null;
      this.dialog.classList.toggle('is-open', wanted !== null);
      this.dialog.setAttribute('aria-hidden', wanted ? 'false' : 'true');
      this.dialog.inert = !wanted;
      this.scrim.classList.toggle('is-open', wanted !== null);
      if (this.shell) this.shell.inert = wanted !== null;
      this.openSheet = wanted;
      if (!wanted) {
        this.dialog.replaceChildren();
        this.sheetMarkup = null;
        if (closing) {
          const target = this.returnFocus;
          this.returnFocus = null;
          if (target && this.doc.contains(target)) target.focus();
          else this.focusPage(model);
        }
        return;
      }
      this.dialog.dataset.sheet = wanted;
      const next = Panels.welcomeDialog(model, actions);
      const markup = next.outerHTML;
      if (!opening && markup === this.sheetMarkup) return;
      this.sheetMarkup = markup;
      if (opening) {
        this.rememberFocus();
        this.dialog.replaceChildren(next);
        const first = this.dialog.querySelector('.welcome-body');
        if (first) first.focus();
      } else {
        this._preservingFocus(() => this.dialog.replaceChildren(next), this.dialog);
      }
    }

    /** הפקד שפתח את מסך הפתיחה: אליו חוזר הפוקוס כשהוא נסגר. */
    rememberFocus() {
      const active = this.doc.activeElement;
      if (active && active !== this.doc.body) this.returnFocus = active;
    }

    /** אחרי שהלשונית נבנתה מחדש: פוקוס לפקד עם [key], כשהוא קיים. */
    focusInSheet(key) {
      const container = this.openSheet ? this.dialog : this.content;
      const target = container.querySelector('[data-focus-key="' + CSS.escape(key) + '"]');
      if (target && !target.disabled) target.focus();
    }

    /** הבדיקה מצאה בעיה: הפוקוס לשדה שלה, או לשדה החיפוש. */
    focusAdvancedProblem(problem) {
      if (typeof problem.term === 'number') {
        this.focusInSheet('adv-word-' + problem.term + '-0');
        return;
      }
      const input = this.content.querySelector('.simple-input, .manual-input');
      if (input) input.focus();
    }

    /**
     * הקלדה בחיפוש בטקסט: רק ההסבר, התצוגה המקדימה וההערה מתעדכנים, והשדה
     * עצמו לא נבנה מחדש באמצע מילה.
     */
    updateAdvanced(model) {
      if (model.tab !== 'text') return;
      const state = model.advanced;
      const Advanced = root.ResponsaAdvanced;
      const text = Advanced.buildQuery(state.query);
      const preview = this.content.querySelector('[data-role="adv-preview"]');
      if (preview) {
        preview.textContent = text ? Advanced.displayQuery(text) : t('השאילתה תופיע כאן');
        preview.classList.toggle('is-empty', !text);
      }
      const summary = this.content.querySelector('[data-role="adv-summary"]');
      if (summary) {
        const fresh = root.ResponsaAdvancedUi.textSearchPage(model, this.actions).querySelector(
          '[data-role="adv-summary"]',
        );
        if (fresh && fresh.textContent !== summary.textContent) summary.replaceChildren(...fresh.childNodes);
      }
      const problem = this.content.querySelector('[data-role="adv-problem"]');
      if (problem) {
        problem.hidden = !state.problem;
        problem.textContent = state.problem ? state.problem.message : '';
      }
      const status = this.content.querySelector('[data-role="adv-status"]');
      if (status) status.hidden = !state.status;
      this.content.querySelectorAll('.term-card').forEach((card, index) => {
        card.classList.toggle('is-error', Boolean(state.problem && state.problem.term === index));
      });
      this.rendered.markup = null;
    }

    /** מקליד בתיבת הדיווח: רק מצב כפתור השליחה משתנה, לא התיבה. */
    updateReport(model) {
      const short = model.report.text.trim().length < 10;
      const send = this.content.querySelector('[data-focus-key="send-report"]');
      if (send && !model.report.sending) send.disabled = short;
      const hint = this.content.querySelector('.report-length');
      if (hint) hint.hidden = !short;
      this.rendered.markup = null;
    }

    /** מחזיר את הפוקוס לפקד עם אותו מפתח אחרי שהתוכן נבנה מחדש. */
    _preservingFocus(replace, scope) {
      const active = this.doc.activeElement;
      const key = active && active.dataset ? active.dataset.focusKey : null;
      const caret =
        active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      replace();
      const container = scope || this.doc;
      const lost = !this.doc.activeElement || this.doc.activeElement === this.doc.body;
      if (!key && lost && this.pendingFocus) {
        const pending = container.querySelector('[data-focus-key="' + CSS.escape(this.pendingFocus) + '"]');
        if (pending && !pending.disabled) {
          this.pendingFocus = null;
          pending.focus();
        }
        return;
      }
      if (!key || this.doc.activeElement === active) return;
      const again = container.querySelector('[data-focus-key="' + CSS.escape(key) + '"]');
      if (!again) return;
      if (again.disabled) {
        this.pendingFocus = key;
        return;
      }
      again.focus();
      if (caret !== null && typeof again.setSelectionRange === 'function') {
        again.setSelectionRange(caret, caret);
      }
    }

    _subtitle(model) {
      const text = Domain.subtitleFor(model);
      if (this.subtitle.textContent !== text) this.subtitle.textContent = text;
    }
  }

  const api = { View, TABS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaView = api;
})(typeof self !== 'undefined' ? self : globalThis);
