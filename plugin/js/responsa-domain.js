// לוגיקה טהורה: בלי DOM, בלי `Otzaria` ובלי טיימרים. כל ההחלטות של התוסף
// (איזה מסך להציג, מה לכתוב בסרגל ההתקדמות, מה עושים בשגיאה) כאן, ונבדקות
// ב-Node.
(function (root) {
  'use strict';

  /**
   * השירות מאזין לפורט הפנוי הראשון בטווח: כל משתמש Windows שמחובר למחשב
   * מקבל שירות משלו (helper/bin/responsa_helper.dart). חייב להתאים לטווח שם.
   */
  const FIRST_PORT = 39700;
  const PORT_COUNT = 10;

  /** גרסת הפרוטוקול שהתוסף מדבר (docs/PROTOCOL.md §7). */
  const API_VERSION = 1;

  const SERVICE_ID = 'otzaria-responsa';

  const PAGE_SIZE = 50;

  /** ההרשאה שבלעדיה אין ערוץ לשירות. */
  const LOCALHOST_PERMISSION = 'network.localhost';

  /** המסכים האפשריים. בכל רגע מוצג בדיוק אחד. */
  const Screen = Object.freeze({
    loading: 'loading',
    unsupported: 'unsupported',
    permissionDenied: 'permissionDenied',
    serviceMissing: 'serviceMissing',
    serviceError: 'serviceError',
    serviceOutdated: 'serviceOutdated',
    pluginOutdated: 'pluginOutdated',
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

  /** "נמצא ספר אחד" / "נמצאו 12 ספרים". */
  function foundLabel(count) {
    return count === 1 ? 'נמצא ספר אחד' : 'נמצאו ' + booksLabel(count);
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

  /** בלי ההרשאה אין טעם לפנות לשירות: כל פנייה נכשלת באותה הודעה. */
  function hasLocalhostPermission(permissions) {
    return !Array.isArray(permissions) || permissions.includes(LOCALHOST_PERMISSION);
  }

  /**
   * איזה מסך להציג. [health] ו-[status] הם תשובות השירות, או `null` כשלא
   * התקבלו; [failure] הוא השגיאה שבגללה לא התקבלו.
   */
  function screenFor({ platform, permissions, health, status, failure }) {
    if (platform && platform !== 'windows') return Screen.unsupported;
    if (!hasLocalhostPermission(permissions)) return Screen.permissionDenied;
    if (failure) {
      switch (failure.code) {
        case 'permissionDenied':
          return Screen.permissionDenied;
        case 'serviceUnavailable':
          return Screen.serviceMissing;
        case 'portTaken':
          return Screen.portTaken;
        default:
          // השירות ענה ל-/health ונכשל אחר כך: הוא קיים, רק לא מגיב כרגע.
          return health ? Screen.serviceError : Screen.serviceMissing;
      }
    }
    if (health) {
      if (health.service !== SERVICE_ID) return Screen.portTaken;
      if (health.apiVersion > API_VERSION) return Screen.pluginOutdated;
      if (health.apiVersion !== API_VERSION) return Screen.serviceOutdated;
    }
    if (!status) return Screen.loading;
    const build = status.build || {};
    const catalog = status.catalog || {};
    // קטלוג קיים נשאר שמיש בזמן בנייה מחדש, ולכן החיפוש לא נחסם.
    if (catalog.exists && catalog.bookCount > 0) return Screen.ready;
    if (build.state === 'running') return Screen.building;
    if (!status.installed) return Screen.notInstalled;
    const error = build.error || {};
    if (build.state === 'failed' && error.code !== 'cancelled') {
      return Screen.buildFailed;
    }
    return Screen.needsCatalog;
  }

  /**
   * הערה מעל החיפוש כשהרשימה קיימת אבל כדאי לקרוא אותה מחדש, או `null`.
   * הרשימה עדיין שמישה בכל המקרים, ולכן זו הערה ולא חסימה.
   */
  function catalogNotice(status) {
    const catalog = (status && status.catalog) || {};
    if (!catalog.exists) return null;
    const build = status.build || {};
    const error = build.error || {};
    if (build.state === 'failed' && error.code !== 'cancelled') {
      return {
        kind: 'rebuildFailed',
        text:
          'קריאת הרשימה מחדש לא הושלמה' +
          (error.message ? ': ' + error.message : '.') +
          ' הרשימה הקודמת נשארה בשימוש.',
      };
    }
    if (status.installed && catalog.matchesInstallation === false) {
      return {
        kind: 'otherInstallation',
        text:
          'רשימת הספרים נקראה מהתקנה אחרת של בר אילן, ולכן ייתכן שחלק ' +
          'מהספרים לא ייפתחו. מומלץ לקרוא אותה מחדש.',
      };
    }
    if (catalog.outdated) {
      return {
        kind: 'outdated',
        text:
          'רשימת הספרים נקראה בגרסה קודמת של התוסף. מומלץ לקרוא אותה מחדש.',
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
      detail = 'נקראו ' + formatCount(scanned) + ' רשומות';
    } else if (expected > 0 && scanned > 0) {
      // לעולם לא 100% לפני הסיום: המכנה הוא הערכה מהקריאה הקודמת.
      fraction = Math.min(scanned / expected, 0.98);
      detail =
        'נקראו ' + formatCount(scanned) + ' מתוך כ-' + formatCount(expected) +
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
   * האם שגיאה מהשירות אומרת שהמצב השתנה ויש לקרוא אותו שוב (הרשימה נמחקה,
   * השירות נעלם).
   */
  function needsRefresh(code) {
    return (
      code === 'catalogMissing' ||
      code === 'unknownBook' ||
      code === 'serviceUnavailable' ||
      code === 'notInstalled' ||
      code === 'otherSession'
    );
  }

  /** תאריך הקריאה לתצוגה, או ריק. */
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

  /** כתובות השירות האפשריות, לפי סדר החיפוש. */
  function serviceUrls() {
    const urls = [];
    for (let i = 0; i < PORT_COUNT; i++) {
      urls.push('http://127.0.0.1:' + (FIRST_PORT + i));
    }
    return urls;
  }

  const api = {
    FIRST_PORT,
    PORT_COUNT,
    API_VERSION,
    SERVICE_ID,
    PAGE_SIZE,
    LOCALHOST_PERMISSION,
    Screen,
    formatCount,
    booksLabel,
    foundLabel,
    bookMeta,
    bookContext,
    hasLocalhostPermission,
    screenFor,
    catalogNotice,
    buildProgress,
    remainingLabel,
    needsRefresh,
    formatBuiltAt,
    serviceUrls,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaDomain = api;
})(typeof self !== 'undefined' ? self : globalThis);
