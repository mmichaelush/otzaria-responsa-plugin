// לוגיקה טהורה: בלי DOM, בלי `Otzaria` ובלי טיימרים. כל ההחלטות של התוסף
// (איזה מסך להציג, מה לכתוב בסרגל ההתקדמות, מה עושים בשגיאה) כאן, ונבדקות
// ב-Node.
(function (root) {
  'use strict';

  /** חייב להתאים ל-`network.allowlist` שבמניפסט ולפורט של השירות. */
  const SERVICE_URL = 'http://127.0.0.1:39700';

  /** גרסת הפרוטוקול שהתוסף מדבר (docs/PROTOCOL.md §7). */
  const API_VERSION = 1;

  const SERVICE_ID = 'otzaria-responsa';

  const PAGE_SIZE = 50;

  /** המסכים האפשריים. בכל רגע מוצג בדיוק אחד. */
  const Screen = Object.freeze({
    loading: 'loading',
    unsupported: 'unsupported',
    serviceMissing: 'serviceMissing',
    serviceOutdated: 'serviceOutdated',
    portTaken: 'portTaken',
    notInstalled: 'notInstalled',
    needsCatalog: 'needsCatalog',
    building: 'building',
    buildFailed: 'buildFailed',
    ready: 'ready',
  });

  const numberFormat = new Intl.NumberFormat('he-IL');

  function formatCount(value) {
    return numberFormat.format(value);
  }

  /** "12 ספרים" / "ספר אחד". */
  function booksLabel(count) {
    if (count === 1) return 'ספר אחד';
    return formatCount(count) + ' ספרים';
  }

  /** מחבר · מקום · שנה, בלי שדות ריקים. */
  function bookMeta(book) {
    return [book.author, book.pubPlace, book.pubDate]
      .filter((part) => typeof part === 'string' && part.trim() !== '')
      .join(' · ');
  }

  /** הנתיב בעץ של בר אילן, כפי שמוצג מתחת לשם הספר. */
  function bookContext(book) {
    if (typeof book.contextPath !== 'string' || book.contextPath === '') {
      return '';
    }
    return book.contextPath.split('/').filter(Boolean).join(' › ');
  }

  /**
   * איזה מסך להציג. [health] ו-[status] הם תשובות השירות, או `null` כשלא
   * התקבלו; [failure] הוא השגיאה שבגללה לא התקבלו.
   */
  function screenFor({ platform, health, status, failure }) {
    if (platform && platform !== 'windows') return Screen.unsupported;
    if (failure && failure.code === 'serviceUnavailable') {
      return Screen.serviceMissing;
    }
    if (health) {
      if (health.service !== SERVICE_ID) return Screen.portTaken;
      if (health.apiVersion !== API_VERSION) return Screen.serviceOutdated;
    }
    if (!status) return failure ? Screen.serviceMissing : Screen.loading;
    const build = status.build || {};
    const catalog = status.catalog || {};
    // קטלוג קיים נשאר שמיש בזמן בנייה מחדש, ולכן החיפוש לא נחסם.
    if (catalog.exists && catalog.bookCount > 0) return Screen.ready;
    if (build.state === 'running') return Screen.building;
    if (!status.installed) return Screen.notInstalled;
    if (build.state === 'failed') return Screen.buildFailed;
    return Screen.needsCatalog;
  }

  /**
   * הערה מעל החיפוש כשהקטלוג קיים אבל כדאי לבנות אותו מחדש, או `null`.
   * הקטלוג עדיין שמיש בשני המקרים, ולכן זו הערה ולא חסימה.
   */
  function catalogNotice(status) {
    const catalog = (status && status.catalog) || {};
    if (!catalog.exists) return null;
    if (status.installed && catalog.matchesInstallation === false) {
      return {
        kind: 'otherInstallation',
        text:
          'הקטלוג נבנה מהתקנה אחרת של בר אילן. ייתכן שחלק מהספרים לא ייפתחו; ' +
          'מומלץ לבנות אותו מחדש.',
      };
    }
    if (catalog.outdated) {
      return {
        kind: 'outdated',
        text: 'הקטלוג נבנה בגרסה קודמת של התוסף. מומלץ לבנות אותו מחדש.',
      };
    }
    return null;
  }

  const stageLabels = Object.freeze({
    starting: 'מכין את בר אילן…',
    scanning: 'קורא את רשימת הספרים מבר אילן…',
    classifying: 'מסדר את הספרים לפי קטגוריות…',
  });

  /**
   * מה להציג בסרגל ההתקדמות. `fraction` הוא `null` כשאין מכנה אמין, ואז
   * הסרגל אינו קובע אחוז.
   */
  function buildProgress(progress, elapsedMs) {
    const stage = (progress && progress.stage) || 'starting';
    const scanned = (progress && progress.scanned) || 0;
    const expected = progress && progress.expected;
    let fraction = null;
    let detail = '';
    if (stage === 'classifying') {
      fraction = 0.99;
      detail = 'נסרקו ' + formatCount(scanned) + ' רשומות';
    } else if (expected > 0 && scanned > 0) {
      // לעולם לא 100% לפני הסיום: המכנה הוא הערכה מהבנייה הקודמת.
      fraction = Math.min(scanned / expected, 0.98);
      detail =
        'נסרקו ' + formatCount(scanned) + ' מתוך כ-' + formatCount(expected) +
        ' רשומות';
    } else if (progress && progress.sectionsTotal > 0) {
      detail =
        'חלק ' + formatCount(progress.sectionsDone) + ' מתוך ' +
        formatCount(progress.sectionsTotal);
    }
    return {
      label: stageLabels[stage] || stageLabels.starting,
      fraction,
      percent: fraction === null ? null : Math.round(fraction * 100),
      detail,
      remaining: remainingLabel(fraction, elapsedMs),
    };
  }

  /** "נותרו כ-3 דקות", או ריק כשמוקדם מדי לדעת. */
  function remainingLabel(fraction, elapsedMs) {
    if (fraction === null || fraction < 0.05 || !(elapsedMs > 0)) return '';
    const remaining = (elapsedMs * (1 - fraction)) / fraction;
    const minutes = Math.round(remaining / 60000);
    if (minutes < 1) return 'פחות מדקה';
    if (minutes === 1) return 'נותרה כדקה';
    return 'נותרו כ-' + formatCount(minutes) + ' דקות';
  }

  /**
   * מה עושים אחרי שגיאה מהשירות. `rebuild` = הצעה לבנות את הקטלוג מחדש,
   * `refresh` = המצב השתנה ויש לקרוא אותו שוב.
   */
  function errorAdvice(code) {
    switch (code) {
      case 'catalogMissing':
      case 'unknownBook':
        return { refresh: true, rebuild: false };
      case 'referenceNotFound':
        return { refresh: false, rebuild: true };
      case 'serviceUnavailable':
      case 'notInstalled':
        return { refresh: true, rebuild: false };
      default:
        return { refresh: false, rebuild: false };
    }
  }

  /** תאריך הבנייה לתצוגה, או ריק. */
  function formatBuiltAt(iso) {
    if (typeof iso !== 'string' || iso === '') return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  const api = {
    SERVICE_URL,
    API_VERSION,
    SERVICE_ID,
    PAGE_SIZE,
    Screen,
    formatCount,
    booksLabel,
    bookMeta,
    bookContext,
    screenFor,
    catalogNotice,
    buildProgress,
    remainingLabel,
    errorAdvice,
    formatBuiltAt,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaDomain = api;
})(typeof self !== 'undefined' ? self : globalThis);
