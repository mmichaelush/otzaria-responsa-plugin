// שכבת התרגום. עברית היא שפת המקור: כל מחרוזת בקוד כתובה בעברית ומשמשת
// מפתח לעצמה. מילון הוא מפה שטוחה מהעברית לתרגום, שנרשמת ב-
// `RESPONSA_TRANSLATIONS[<שפה>]` על ידי הקבצים שב-i18n/. מפתח חסר חוזר לעברית,
// כך שתרגום חלקי נותן טקסט מעורב ולא ריק.
(function (root) {
  'use strict';

  const SOURCE_LANGUAGE = 'he';

  /** מפתח הגדרת השפה של אוצריא, שמגיע ב-`settings.changed`. */
  const LANGUAGE_SETTING_KEY = 'key-settings-language';

  const RTL_LANGUAGES = ['he', 'ar', 'fa', 'ur', 'yi'];

  let language = SOURCE_LANGUAGE;
  let dictionary = null;
  const listeners = new Set();

  function catalogs() {
    return root.RESPONSA_TRANSLATIONS || {};
  }

  function directionFor(lang) {
    return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
  }

  /** בחירה מפורשת בתוסף גוברת על שפת אוצריא; שפה בלי מילון נופלת לעברית. */
  function resolveLanguage(preference, hostLanguage) {
    const requested = preference && preference !== 'auto' ? preference : hostLanguage;
    const normalized = String(requested || SOURCE_LANGUAGE).split(/[-_]/)[0].toLowerCase();
    if (normalized === SOURCE_LANGUAGE) return SOURCE_LANGUAGE;
    return catalogs()[normalized] ? normalized : SOURCE_LANGUAGE;
  }

  /** `true` כשהשפה השתנתה. */
  function configure(nextLanguage) {
    const resolved = String(nextLanguage || SOURCE_LANGUAGE).toLowerCase();
    const changed = resolved !== language;
    language = resolved;
    dictionary = resolved === SOURCE_LANGUAGE ? null : catalogs()[resolved] || null;
    if (changed) for (const listener of listeners) listener(resolved);
    return changed;
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * מתרגם ואז ממלא `{name}` מ-[vars]; המילוי אחרי התרגום, כדי שתרגום יוכל
   * לשנות את סדר המשתנים.
   */
  function t(text, vars) {
    const source = String(text == null ? '' : text);
    // בדיקת own-property: מחרוזת כמו "constructor" הייתה מחזירה פונקציה.
    const translated =
      dictionary && Object.prototype.hasOwnProperty.call(dictionary, source)
        ? dictionary[source]
        : null;
    let result = typeof translated === 'string' && translated ? translated : source;
    if (vars) {
      result = result.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
      );
    }
    return result;
  }

  /** ה-HTML נשאר `dir="rtl"` (דרישת בדיקת העיצוב); הכיוון מתחלף בזמן ריצה. */
  function applyDocumentLanguage(doc) {
    const target = doc || root.document;
    if (!target || !target.documentElement) return;
    target.documentElement.lang = language;
    target.documentElement.dir = directionFor(language);
  }

  /** לתבנית מספרים ותאריכים. */
  function locale() {
    return language === SOURCE_LANGUAGE ? 'he-IL' : language;
  }

  const api = {
    SOURCE_LANGUAGE,
    LANGUAGE_SETTING_KEY,
    resolveLanguage,
    configure,
    onChange,
    t,
    directionFor,
    applyDocumentLanguage,
    locale,
    get language() {
      return language;
    },
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaI18n = api;
})(typeof self !== 'undefined' ? self : globalThis);
