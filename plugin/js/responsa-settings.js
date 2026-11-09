// הגדרות התוסף. כל הגדרה במפתח אחסון משלה ובערך פשוט, כי תנאי `when`
// במניפסט משווה ערך שלם: כך המתג מסתיר ומציג את פריט התפריט ואת ספרי
// בר אילן בחיפוש הספרייה מיד, בלי שמנוע התוסף ירוץ.
(function (root) {
  'use strict';

  /** שמות מפתחות האחסון. מופיעים גם ב-manifest.json (`when`). */
  const KEYS = Object.freeze({
    language: 'responsa_language',
    /** גופן התוסף: שם מ-[FONTS], או '' לגופן הממשק של אוצריא. */
    font: 'responsa_font',
    /** גודל התצוגה: מכפיל בטווח [SCALE]. */
    scale: 'responsa_scale',
    libraryBooks: 'responsa_library_books',
    /** "חיפוש בבר אילן" בתפריט הלחיצה הימנית. */
    contextMenu: 'responsa_context_menu',
    /** "איתור המקום בבר אילן" בתפריט הלחיצה הימנית. */
    contextLocate: 'responsa_context_locate',
    /** השורה "חיפוש בבר אילן" בדיאלוג החיפוש של אוצריא. */
    searchDialog: 'responsa_search_dialog',
    /**
     * הפעלת בר אילן כשהוא סגור. נשלח בכל בקשה (`autoStart`), גם מפעולות
     * הלחיצה של אוצריא (`$storage`), כי השירות אינו שומר הגדרות.
     */
    autoStart: 'responsa_auto_start',
    /**
     * "חלון ניהול הצורות" של בר אילן בחיפוש מטקסט מסומן. נשלח בפעולת הלחיצה
     * של אוצריא (`$storage`); בלי ערך השירות מכבה אותו.
     */
    showForms: 'responsa_show_forms',
    /**
     * הסיכום של בר אילן אחרי חיפוש (`N תוצאות`, עם "הרחבה" לפי מאגרים).
     * נשלח בכל חיפוש (`summary`) ובפעולת הלחיצה של אוצריא; בלי ערך השירות
     * סוגר אותו.
     */
    showSummary: 'responsa_show_summary',
    /**
     * "איתור מקום": מקום שקיים באוצריא נפתח באוצריא, ובר אילן רק כשהוא
     * חסר שם (issue #4).
     */
    otzariaFirst: 'responsa_otzaria_first',
    /** חיפוש בטקסט: אותן מילים גם בחיפוש של אוצריא, בכרטיסייה משלה. */
    alsoOtzaria: 'responsa_also_otzaria',
    /**
     * חיפוש מדיאלוג החיפוש של אוצריא: קודם באוצריא, ובבר אילן רק כשאוצריא
     * לא מצאה כלום (issue #6, mmichaelush/otzaria#2583).
     */
    otzariaFirstSearch: 'responsa_otzaria_first_search',
    /** הכפתור "ביוגרפיה" בפרטי ספר. כבוי: התוסף אינו קורא ביוגרפיות מבר אילן. */
    biography: 'responsa_biography',
    /** הלשונית "הערות". כבוי: אין לשונית, ואין קריאה של הערות ואין כתיבה לאוצריא. */
    notes: 'responsa_notes',
    /** מה נשלח לאחרונה לחיפוש הספרייה: `{ builtAt, count }`. */
    librarySync: 'responsa_library_sync',
    /** המשתמש סגר את ההערה על ההרשאה "הוספת רכיבים לתוכנה". */
    startupNotice: 'responsa_startup_notice_dismissed',
    /** מסך הפתיחה הוצג ונסגר; מוצג שוב רק מ"אודות". */
    welcomeSeen: 'responsa_welcome_seen',
    /** הקטגוריה האחרונה בעיון, כדי שהלשונית תיפתח בה שוב. */
    browsePath: 'responsa_browse_path',
    /** החיפוש המתקדם האחרון (ResponsaAdvanced.normalize בודק אותו בטעינה). */
    advancedQuery: 'responsa_advanced_query',
    /** הלשונית האחרונה בתוסף, כדי שייפתח בה שוב. */
    tab: 'responsa_tab',
    /** המקומות האחרונים שנפתחו ב"איתור מקום". */
    locateHistory: 'responsa_locate_history',
    /**
     * הפורט של השירות, שהדף מצא. פעולות הלחיצה של אוצריא (`$storage`) פונות
     * אליו בלי להעיר את התוסף; לא הגדרה של המשתמש.
     */
    servicePort: 'responsa_service_port',
  });

  /** הלשוניות של התוסף, לפי הסדר. */
  const TABS = Object.freeze(['books', 'text', 'locate', 'notes', 'settings', 'help', 'about']);

  /** כמה מקומות אחרונים נשמרים. */
  const MAX_LOCATE_HISTORY = 8;

  const LANGUAGES = Object.freeze(['auto', 'he', 'en']);

  /**
   * הגופנים המובנים של אוצריא, שהיא מזריקה לכל דף תוסף (DESIGN_GUIDE). בלי
   * "רש"י": גופן מפרשים, ולא גופן ממשק. '' = גופן הממשק שנבחר באוצריא.
   */
  const FONTS = Object.freeze([
    '',
    'TaameyDavidCLM',
    'FrankRuhlCLM',
    'TaameyAshkenaz',
    'KeterYG',
    'Shofar',
    'NotoSerifHebrew',
    'Tinos',
    'Rubik',
  ]);

  /** טווח "גודל תצוגה" (מכפיל של גודל הממשק) והקפיצה של המחוון. */
  const SCALE = Object.freeze({ min: 0.9, max: 1.5, step: 0.05 });

  /** מכפיל בטווח, מעוגל לקפיצה; אחר — `null`. */
  function normalizeScale(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const steps = Math.round(value / SCALE.step);
    // toFixed: 23 * 0.05 הוא 1.1500000000000001.
    const rounded = Number((steps * SCALE.step).toFixed(2));
    return rounded >= SCALE.min && rounded <= SCALE.max ? rounded : null;
  }

  const DEFAULTS = Object.freeze({
    language: 'auto',
    font: '',
    scale: 1,
    libraryBooks: true,
    contextMenu: true,
    contextLocate: true,
    searchDialog: true,
    biography: true,
    notes: true,
    autoStart: true,
    showForms: false,
    showSummary: false,
    otzariaFirst: false,
    alsoOtzaria: false,
    otzariaFirstSearch: false,
    startupNotice: false,
    welcomeSeen: false,
    browsePath: '',
    advancedQuery: null,
    tab: 'books',
    locateHistory: [],
  });

  /** ערך לא מוכר (או אחסון פגום) חוזר לברירת המחדל ולא מפיל את התוסף. */
  function normalize(raw) {
    const value = raw || {};
    return {
      language: LANGUAGES.includes(value.language) ? value.language : DEFAULTS.language,
      font: FONTS.includes(value.font) ? value.font : DEFAULTS.font,
      scale: normalizeScale(value.scale) ?? DEFAULTS.scale,
      libraryBooks:
        typeof value.libraryBooks === 'boolean' ? value.libraryBooks : DEFAULTS.libraryBooks,
      contextMenu:
        typeof value.contextMenu === 'boolean' ? value.contextMenu : DEFAULTS.contextMenu,
      contextLocate:
        typeof value.contextLocate === 'boolean' ? value.contextLocate : DEFAULTS.contextLocate,
      searchDialog:
        typeof value.searchDialog === 'boolean' ? value.searchDialog : DEFAULTS.searchDialog,
      biography: typeof value.biography === 'boolean' ? value.biography : DEFAULTS.biography,
      notes: typeof value.notes === 'boolean' ? value.notes : DEFAULTS.notes,
      autoStart: typeof value.autoStart === 'boolean' ? value.autoStart : DEFAULTS.autoStart,
      showForms: value.showForms === true,
      showSummary: value.showSummary === true,
      otzariaFirst: value.otzariaFirst === true,
      alsoOtzaria: value.alsoOtzaria === true,
      otzariaFirstSearch: value.otzariaFirstSearch === true,
      startupNotice: value.startupNotice === true,
      welcomeSeen: value.welcomeSeen === true,
      browsePath:
        typeof value.browsePath === 'string' && value.browsePath.length <= 1000 ? value.browsePath : '',
      advancedQuery:
        value.advancedQuery && typeof value.advancedQuery === 'object' && !Array.isArray(value.advancedQuery)
          ? value.advancedQuery
          : null,
      tab: TABS.includes(value.tab) ? value.tab : DEFAULTS.tab,
      locateHistory: (Array.isArray(value.locateHistory) ? value.locateHistory : [])
        .filter((entry) => typeof entry === 'string' && entry.trim() && entry.length <= 200)
        .slice(0, MAX_LOCATE_HISTORY),
    };
  }

  /** קריאה ושמירה דרך `storage.*`. [runtime] מ-responsa-runtime.js. */
  class SettingsStore {
    constructor(runtime) {
      this.runtime = runtime;
      this.values = normalize();
    }

    /** קריאה שנכשלה משאירה את ברירות המחדל — היא אינה "אין הגדרות". */
    async load() {
      const read = async (key) => {
        try {
          return await this.runtime.call('storage.get', { key });
        } catch (_) {
          return undefined;
        }
      };
      const names = [
        'language',
        'font',
        'scale',
        'libraryBooks',
        'contextMenu',
        'contextLocate',
        'searchDialog',
        'biography',
        'notes',
        'autoStart',
        'showForms',
        'showSummary',
        'otzariaFirst',
        'alsoOtzaria',
        'otzariaFirstSearch',
        'startupNotice',
        'welcomeSeen',
        'browsePath',
        'advancedQuery',
        'tab',
        'locateHistory',
      ];
      const values = await Promise.all(names.map((name) => read(KEYS[name])));
      const raw = Object.fromEntries(names.map((name, i) => [name, values[i]]));
      // עד 0.8.0 מתג אחד כיבה את שני פריטי התפריט. מי שכיבה אותו לא יראה פתאום
      // את "איתור המקום": ההגדרה החדשה יורשת ממנו פעם אחת.
      if (raw.contextMenu === false && (raw.contextLocate === null || raw.contextLocate === undefined)) {
        raw.contextLocate = false;
        try {
          await this.runtime.call('storage.set', { key: KEYS.contextLocate, value: false });
        } catch (_) {
          // יישמר בפעם הבאה; בינתיים הערך בזיכרון נכון.
        }
      }
      this.values = normalize(raw);
      return this.values;
    }

    /** זורק כשהשמירה נכשלה, כדי שהמתג יחזור למצבו והמשתמש יקבל הודעה. */
    async set(name, value) {
      const next = normalize({ ...this.values, [name]: value });
      await this.runtime.call('storage.set', { key: KEYS[name], value: next[name] });
      // מעל הערכים של עכשיו ולא של לפני ההמתנה: שמירה אחרת אולי הסתיימה בינתיים.
      this.values = { ...this.values, [name]: next[name] };
      return this.values;
    }

    get(name) {
      return this.values[name];
    }
  }

  const api = { KEYS, LANGUAGES, FONTS, SCALE, TABS, MAX_LOCATE_HISTORY, DEFAULTS, normalize, SettingsStore };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaSettings = api;
})(typeof self !== 'undefined' ? self : globalThis);
