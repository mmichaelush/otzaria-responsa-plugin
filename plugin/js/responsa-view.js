// מחבר את המודל ל-DOM. [render] בונה מסך חדש; [update] מעדכן את המסך
// הנוכחי במקום (התקדמות, פס עליון, הערות), כדי שלחיצה, פוקוס ואנימציה לא
// ייקטעו כמה פעמים בשנייה. לוח ההגדרות ודיאלוג העזרה נבנים ב-
// responsa-panels.js ומוצגים כאן, מעל שאר הדף.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const I18n = root.ResponsaI18n;
  const Ui = root.ResponsaUi;
  const Panels = root.ResponsaPanels;
  const { icon } = root.ResponsaIcons;
  const Screen = Domain.Screen;
  const t = (text, vars) => I18n.t(text, vars);

  /** הכותרת שמתארת כל לוח (aria-labelledby), ולאן הפוקוס עובר כשהוא נפתח. */
  const SHEET_TITLES = Object.freeze({
    settings: 'settings-title',
    help: 'help-title',
    welcome: 'welcome-title',
  });
  /** אזורים נגללים בתוך לוח, שמקום הגלילה בהם נשמר כשהלוח נבנה מחדש. */
  const SCROLLERS = '.dialog-body, .sheet-body, .log-list';

  // במסך הפתיחה — לגוף הטקסט, כדי שקורא מסך יקרא אותו לפני הכפתורים.
  const FIRST_FOCUS = Object.freeze({
    settings: '.sheet-close',
    help: '[role="tab"][aria-selected="true"]',
    welcome: '.welcome-body',
  });

  class View {
    constructor(doc) {
      this.doc = doc;
      this.shell = doc.querySelector('.app-shell');
      this.content = doc.querySelector('.content-column');
      this.title = doc.querySelector('.topbar-title');
      this.subtitle = doc.querySelector('.topbar-subtitle');
      this.helpButton = doc.querySelector('.help-toggle');
      this.settingsButton = doc.querySelector('.settings-toggle');
      this.scrim = doc.querySelector('.overlay-scrim');
      this.sheet = doc.querySelector('.side-sheet');
      this.dialog = doc.querySelector('.help-dialog');
      this.live = doc.querySelector('.live-region');
      this.renderedScreen = null;
      this.openSheet = null;
      this.returnFocus = null;
      this.sheet.inert = true;
      this.dialog.inert = true;
      this.helpButton.appendChild(icon('question_circle_24_regular'));
      this.settingsButton.appendChild(icon('settings_24_regular'));
    }

    bind(actions) {
      this.helpButton.addEventListener('click', () => {
        this.returnFocus = this.helpButton;
        actions.openHelp();
      });
      this.settingsButton.addEventListener('click', () => {
        this.returnFocus = this.settingsButton;
        actions.openSettings();
      });
      this.scrim.addEventListener('click', actions.dismissSheet);
      this.doc.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.openSheet) {
          event.preventDefault();
          if (this.openSheet === 'welcome') actions.finishWelcome();
          else actions.closeSheet();
        }
      });
      // חצים בין הכרטיסיות של העזרה (ARIA tabs).
      this.dialog.addEventListener('keydown', (event) => {
        const tab = event.target.closest && event.target.closest('[role="tab"]');
        if (!tab) return;
        const tabs = [...this.dialog.querySelectorAll('[role="tab"]')];
        const index = tabs.indexOf(tab);
        const rtl = this.doc.documentElement.dir !== 'ltr';
        const step = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[event.key];
        let next = null;
        if (step) next = tabs[(index + step + tabs.length) % tabs.length];
        else if (event.key === 'Home') next = tabs[0];
        else if (event.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        actions.openHelp(next.dataset.tab);
      });
    }

    /** טקסטים סטטיים של הפס העליון, בשפה הנוכחית. */
    applyLanguage() {
      I18n.applyDocumentLanguage(this.doc);
      const title = t('פרויקט השו"ת (בר אילן)');
      this.doc.title = title;
      this.title.textContent = title;
      for (const [node, label] of [
        [this.helpButton, t('עזרה ותמיכה')],
        [this.settingsButton, t('הגדרות')],
      ]) {
        node.setAttribute('aria-label', label);
        node.setAttribute('title', label);
      }
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
      if (model.screen === Screen.ready && !wasReady && !this.openSheet) {
        const input = node.querySelector('.search-input');
        if (input) input.focus();
      }
      const title = node.querySelector('[data-role="title"], [data-role="label"]');
      if (title && model.screen !== Screen.ready) this.announce(title.textContent);
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
      if (retry) Ui.setBusy(retry, model.checking, t('בודק…'), t('בדיקה חוזרת'));
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
      this._replaceIfChanged('.activity-host', Ui.activityView(model));
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
      const host = this.content.querySelector('.results-host');
      if (this.renderedScreen !== Screen.ready || !host) {
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

    /** אייקוני אוצריא נטענו: הפס העליון והמסך מצוירים מחדש, והפוקוס נשמר. */
    redraw(model, actions) {
      this.helpButton.replaceChildren(icon('question_circle_24_regular'));
      this.settingsButton.replaceChildren(icon('settings_24_regular'));
      this._preservingFocus(() => this.render(model, actions));
    }

    /**
     * אחרי מעבר קטגוריה הכפתור שנלחץ כבר אינו קיים: הפוקוס עובר לכותרת
     * הקטגוריה, כדי שקורא מסך יכריז עליה וטאב ימשיך ממנה.
     */
    focusBrowse() {
      if (this.openSheet) return;
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

    // ------------------------------------------------ הגדרות ועזרה

    /**
     * מציג, מעדכן או סוגר את הלוח שב-`model.sheet`. לוח פתוח חוסם את הדף
     * שמאחוריו (inert), ובסגירה הפוקוס חוזר לכפתור שפתח אותו.
     */
    renderSheet(model, actions) {
      const wanted = model.sheet;
      const opening = wanted !== null && wanted !== this.openSheet;
      const closing = wanted === null && this.openSheet !== null;
      // ההגדרות בלוח הצד; העזרה ומסך הפתיחה באותו דיאלוג מרכזי.
      const containerOf = (name) => (name === 'settings' ? this.sheet : this.dialog);
      const target = wanted === null ? null : containerOf(wanted);

      for (const container of [this.sheet, this.dialog]) {
        const open = container === target;
        container.classList.toggle('is-open', open);
        container.setAttribute('aria-hidden', open ? 'false' : 'true');
        container.inert = !open;
        if (!open) container.replaceChildren();
      }
      this.scrim.classList.toggle('is-open', wanted !== null);
      if (this.shell) this.shell.inert = wanted !== null;
      this.settingsButton.setAttribute('aria-pressed', wanted === 'settings' ? 'true' : 'false');
      this.openSheet = wanted;

      if (wanted !== null) {
        const container = target;
        container.setAttribute('aria-labelledby', SHEET_TITLES[wanted]);
        // העזרה ממלאת את הלשונית; מסך הפתיחה נשאר דיאלוג במרכז.
        container.dataset.sheet = wanted;
        const next =
          wanted === 'settings'
            ? Panels.settingsSheet(model, actions)
            : wanted === 'welcome'
              ? Panels.welcomeDialog(model, actions)
              : Panels.helpDialog(model, actions);
        // רענון תקופתי שלא שינה דבר אינו בונה מחדש: אחרת שאלה שנפתחה בפתרון
        // בעיות הייתה נסגרת, והגלילה הייתה חוזרת לראש הלוח.
        const markup = next.outerHTML;
        if (!opening && markup === this.sheetMarkup) return;
        this.sheetMarkup = markup;
        const build = () => container.replaceChildren(next);
        if (opening) {
          build();
          const first = container.querySelector(FIRST_FOCUS[wanted]);
          if (first) first.focus();
        } else {
          // מעבר כרטיסייה (בחץ או בלחיצה): הפוקוס עובר לכרטיסייה שנבחרה, ולא
          // נשאר על זו שהייתה ממוקדת.
          const active = this.doc.activeElement;
          const onTab = Boolean(active && active.getAttribute && active.getAttribute('role') === 'tab');
          const scrolls = [...container.querySelectorAll(SCROLLERS)].map((node) => node.scrollTop);
          this._preservingFocus(build, container);
          container.querySelectorAll(SCROLLERS).forEach((node, i) => {
            if (scrolls[i]) node.scrollTop = scrolls[i];
          });
          const selected = onTab && container.querySelector('[role="tab"][aria-selected="true"]');
          if (selected) selected.focus();
        }
      } else if (closing) {
        this.sheetMarkup = null;
        const target = this.returnFocus || this.settingsButton;
        this.returnFocus = null;
        if (target) target.focus();
      }
    }

    /** מקליד בתיבת הדיווח: רק מצב כפתור השליחה משתנה, לא התיבה. */
    updateReport(model) {
      const short = model.report.text.trim().length < 10;
      const send = this.dialog.querySelector('[data-focus-key="send-report"]');
      if (send && !model.report.sending) send.disabled = short;
      const hint = this.dialog.querySelector('.report-length');
      if (hint) hint.hidden = !short;
    }

    /** מחזיר את הפוקוס לכפתור עם אותו מפתח אחרי שהתוכן נבנה מחדש. */
    _preservingFocus(replace, scope) {
      const active = this.doc.activeElement;
      const key = active && active.dataset ? active.dataset.focusKey : null;
      const caret =
        active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
      replace();
      const container = scope || this.content;
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

  const api = { View };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaView = api;
})(typeof self !== 'undefined' ? self : globalThis);
