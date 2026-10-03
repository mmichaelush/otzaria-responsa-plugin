// הגדרות התוסף. כל הגדרה במפתח אחסון משלה ובערך פשוט, כי תנאי `when`
// במניפסט משווה ערך שלם: כך המתג מסתיר ומציג את פריט התפריט ואת ספרי
// בר אילן בחיפוש הספרייה מיד, בלי שמנוע התוסף ירוץ.
(function (root) {
  'use strict';

  /** שמות מפתחות האחסון. מופיעים גם ב-manifest.json (`when`). */
  const KEYS = Object.freeze({
    language: 'responsa_language',
    libraryBooks: 'responsa_library_books',
    contextMenu: 'responsa_context_menu',
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
  const TABS = Object.freeze(['books', 'text', 'locate', 'settings', 'help']);

  /** כמה מקומות אחרונים נשמרים. */
  const MAX_LOCATE_HISTORY = 8;

  const LANGUAGES = Object.freeze(['auto', 'he', 'en']);

  const DEFAULTS = Object.freeze({
    language: 'auto',
    libraryBooks: true,
    contextMenu: true,
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
      libraryBooks:
        typeof value.libraryBooks === 'boolean' ? value.libraryBooks : DEFAULTS.libraryBooks,
      contextMenu:
        typeof value.contextMenu === 'boolean' ? value.contextMenu : DEFAULTS.contextMenu,
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
        'libraryBooks',
        'contextMenu',
        'startupNotice',
        'welcomeSeen',
        'browsePath',
        'advancedQuery',
        'tab',
        'locateHistory',
      ];
      const values = await Promise.all(names.map((name) => read(KEYS[name])));
      this.values = normalize(Object.fromEntries(names.map((name, i) => [name, values[i]])));
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

  const api = { KEYS, LANGUAGES, TABS, MAX_LOCATE_HISTORY, DEFAULTS, normalize, SettingsStore };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaSettings = api;
})(typeof self !== 'undefined' ? self : globalThis);
