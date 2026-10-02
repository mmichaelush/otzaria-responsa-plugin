// לוגיקה טהורה: בלי DOM, בלי `Otzaria` ובלי טיימרים. כל ההחלטות של התוסף
// (איזה מסך להציג, מה לכתוב בסרגל ההתקדמות, מה עושים בשגיאה) כאן, ונבדקות
// ב-Node.
(function (root) {
  'use strict';

  const I18n = root.ResponsaI18n;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן השימוש. */
  const N = (text) => text;

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

  /** השירות משתמש רק בעשר המילים הראשונות; טקסט ארוך מזה אינו נשלח. */
  const MAX_SELECTION_LENGTH = 2000;

  /** ההרשאה שבלעדיה אין ערוץ לשירות. */
  const LOCALHOST_PERMISSION = 'network.localhost';

  /** ספרי בר אילן בחיפוש הספרייה (אוצריא 0.9.98 ומעלה). */
  const LIBRARY_PERMISSION = 'library.books.provide';
  const LIBRARY_PROVIDER = 'responsa';

  /**
   * "הוספת רכיבים לתוכנה": מפעילה את פריט התפריט, את קיצורי המקלדת ואת ספרי
   * בר אילן בחיפוש הספרייה. אוצריא מציעה אותה כבויה בהתקנה.
   */
  const STARTUP_PERMISSION = 'app.startup_contributions';

  const REPOSITORY_URL = 'https://github.com/mmichaelush/otzaria-responsa-plugin';

  /**
   * כל הכתובות החיצוניות במקום אחד. `store` — דף התוסף בחנות; המזהה הוא
   * משתנה המאגר `OTZARIA_PLUGIN_ID` (docs/RELEASING.md).
   */
  const Links = Object.freeze({
    homepage: REPOSITORY_URL,
    releases: REPOSITORY_URL + '/releases/latest',
    guide: REPOSITORY_URL + '/blob/main/docs/USER_GUIDE.md',
    issues: REPOSITORY_URL + '/issues',
    store: 'https://otzaria.org/plugins/6abfbb96f4aadb0d88fd755a',
    /** ההודעה בפורום אוצריא שמציגה את התוסף ומבהירה את מעמדו. */
    forum: 'https://otzaria.org/forum/post/40010',
  });

  /** פריט "חיפוש בבר אילן" בתפריט הלחיצה הימנית (manifest.json). */
  const CONTEXT_MENU_ITEM = 'responsa-search';

  /** פקודות מקיצורי המקלדת (manifest.json). */
  const Command = Object.freeze({ openPanel: 'responsa.openPanel' });

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

  function formatCount(value) {
    return new Intl.NumberFormat(I18n.locale()).format(value);
  }

  /** "12 ספרים" / "ספר אחד". */
  function booksLabel(count) {
    if (count === 1) return t('ספר אחד');
    return t('{count} ספרים', { count: formatCount(count) });
  }

  /** "נמצא ספר אחד" / "נמצאו 12 ספרים". */
  function foundLabel(count) {
    if (count === 1) return t('נמצא ספר אחד');
    return t('נמצאו {count} ספרים', { count: formatCount(count) });
  }

  /** מחבר · מקום · שנה, בלי שדות ריקים. */
  function bookMeta(book) {
    return [book.author, book.pubPlace, book.pubDate]
      .filter((part) => typeof part === 'string' && part.trim() !== '')
      .join(' · ');
  }

  /** הנתיב בעץ של בר אילן, כפי שמוצג מתחת לשם הספר. */
  function bookContext(book) {
    return contextLabel(book.contextPath);
  }

  function contextLabel(contextPath) {
    if (typeof contextPath !== 'string' || contextPath === '') return '';
    return contextPath.split('/').filter(Boolean).join(' › ');
  }

  /**
   * כל פרטי הספר שבקטלוג, לתצוגה המורחבת בתוצאה: רק שדות שיש בהם ערך.
   * המהדורה המלאה מוצגת רק כשיש בה יותר ממקום ושנה (למשל "ד"צ").
   */
  function bookDetails(book) {
    const text = (value) => (typeof value === 'string' ? value.trim() : '');
    const place = text(book.pubPlace);
    const date = text(book.pubDate);
    const edition = text(book.edition);
    const bare = (value) => value.replace(/[\s,]+/g, '');
    const category = text(book.otzariaCategory);
    return [
      [N('מחבר'), text(book.author)],
      [N('מקום הדפסה'), place],
      [N('שנת הדפסה'), date],
      [N('מהדורה'), edition && bare(edition) !== bare(place + date) ? edition : ''],
      [N('מיקום בבר אילן'), contextLabel(book.contextPath)],
      [N('נושאים'), text(book.topics)],
      [N('קטגוריה מקבילה באוצריא'), category ? category.split('/').join(' › ') : ''],
      [N('מזהה בבר אילן'), text(book.key)],
    ]
      .filter(([, value]) => value !== '')
      .map(([label, value]) => ({ label: t(label), value }));
  }

  /**
   * מה צריך כדי שהכול יעבוד, ומה מהם כבר מוכן — לרשימה שבמסך הפתיחה.
   * `state`: 'done' | 'missing' | 'unknown' (עוד לא ידוע, או בבדיקה).
   */
  function setupChecklist(model) {
    const known = model.screen && model.screen !== Screen.loading;
    const status = model.status || null;
    const state = (value) => (value === null ? 'unknown' : value ? 'done' : 'missing');
    const serviceUp = Boolean(model.health);
    const serviceDown = [
      Screen.serviceMissing,
      Screen.serviceError,
      Screen.portTaken,
      Screen.permissionDenied,
    ].includes(model.screen);
    return [
      {
        id: 'responsa',
        label: t('תוכנת פרויקט השו"ת של בר אילן מותקנת במחשב'),
        state: status ? state(Boolean(status.installed)) : 'unknown',
      },
      {
        id: 'service',
        label: t('"שירות בר אילן לאוצריא" מותקן ופועל'),
        state: serviceUp ? 'done' : known && serviceDown ? 'missing' : 'unknown',
      },
      {
        id: 'permission',
        // מסך הספרייה רק כשאוצריא תומכת בו; אחרת ההבטחה הייתה שקרית.
        label: hostSupportsLibrary(model.permissions)
          ? t('ההרשאה "הוספת רכיבים לתוכנה" דלוקה (לחיפוש בלחיצה ימנית ובמסך הספרייה)')
          : t('ההרשאה "הוספת רכיבים לתוכנה" דלוקה (לחיפוש בלחיצה ימנית)'),
        state: Array.isArray(model.permissions)
          ? state(!lacksStartupPermission(model.permissions))
          : 'unknown',
      },
      {
        id: 'catalog',
        label: t('רשימת הספרים נקראה מבר אילן (פעם אחת, כחמש דקות)'),
        state: status ? state(Boolean(status.catalog && status.catalog.exists)) : 'unknown',
      },
    ];
  }

  function has(permissions, permission) {
    return Array.isArray(permissions) && permissions.includes(permission);
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

  /** האם לשירות יש יכולת, לפי `/health`. שירות ישן אינו מצהיר עליה. */
  function serviceCan(health, capability) {
    return Boolean(health && Array.isArray(health.capabilities) &&
      health.capabilities.includes(capability));
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
          (error.message || error.code
            ? t('קריאת הרשימה מחדש לא הושלמה: {reason}', { reason: errorMessage(error) })
            : t('קריאת הרשימה מחדש לא הושלמה.')) +
          ' ' +
          t('הרשימה הקודמת נשארה בשימוש.'),
      };
    }
    if (status.installed && catalog.matchesInstallation === false) {
      return {
        kind: 'otherInstallation',
        text: t(
          'רשימת הספרים נקראה מהתקנה אחרת של בר אילן, ולכן ייתכן שחלק ' +
            'מהספרים לא ייפתחו. מומלץ לקרוא אותה מחדש.',
        ),
      };
    }
    if (catalog.outdated) {
      return {
        kind: 'outdated',
        text: t('רשימת הספרים נקראה בגרסה קודמת של התוסף. מומלץ לקרוא אותה מחדש.'),
      };
    }
    return null;
  }

  function stageLabel(stage) {
    switch (stage) {
      case 'scanning':
        return t('קורא את רשימת הספרים מבר אילן…');
      case 'classifying':
        return t('מסדר את הספרים לפי קטגוריות…');
      default:
        return t('מכין את בר אילן…');
    }
  }

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
      detail = t('נקראו {count} רשומות', { count: formatCount(scanned) });
    } else if (expected > 0 && scanned > 0) {
      // לעולם לא 100% לפני הסיום: המכנה הוא הערכה מהקריאה הקודמת.
      fraction = Math.min(scanned / expected, 0.98);
      detail = t('נקראו {count} מתוך כ-{total} רשומות', {
        count: formatCount(scanned),
        total: formatCount(expected),
      });
    } else if (progress && progress.sectionsTotal > 0) {
      detail = t('חלק {done} מתוך {total}', {
        done: formatCount(progress.sectionsDone),
        total: formatCount(progress.sectionsTotal),
      });
    }
    return {
      label: stageLabel(stage),
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
    if (minutes < 1) return t('פחות מדקה');
    if (minutes === 1) return t('נותרה כדקה');
    return t('נותרו כ-{count} דקות', { count: formatCount(minutes) });
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
    return date.toLocaleDateString(I18n.locale(), {
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

  // ------------------------------------------------------------- שגיאות

  /** הסבר כללי לכל קוד, כשהשפה אינה עברית (הודעות השירות בעברית). */
  const GENERIC_ERRORS = Object.freeze({
    serviceUnavailable: N('שירות בר אילן אינו פועל במחשב. אם הוא לא מותקן, יש להתקין אותו.'),
    permissionDenied: N('לתוסף אין הרשאה לגשת לשירות המקומי.'),
    hostBusy: N('אוצריא עסוקה כרגע. אפשר לנסות שוב בעוד רגע.'),
    timeout: N('השירות לא הגיב בזמן. ייתכן שבר אילן עסוק; אפשר לנסות שוב.'),
    connectionLost: N('החיבור לשירות נקטע. אפשר לנסות שוב.'),
    busy: N('בר אילן עסוק כרגע בפעולה אחרת. אפשר לנסות שוב בעוד רגע.'),
    notInstalled: N('בר אילן (פרויקט השו"ת) אינו מותקן במחשב הזה.'),
    notRunning: N('בר אילן אינו פעיל ולא ניתן היה להפעיל אותו. יש לפתוח אותו ולנסות שוב.'),
    catalogMissing: N('רשימת הספרים של בר אילן עוד לא נקראה.'),
    unknownBook: N('הספר לא נמצא ברשימה. ייתכן שהרשימה נקראה מחדש מאז; יש לחפש שוב.'),
    referenceNotFound: N('בר אילן לא זיהה את הספר. אפשר לקרוא את רשימת הספרים מחדש ולנסות שוב.'),
    wrongBook: N('בר אילן פתח ספר אחר, והפתיחה בוטלה.'),
    windowLimit: N('בבר אילן פתוחים חלונות רבים מדי. יש לסגור בו כמה חלונות ולנסות שוב.'),
    dialogNotFound: N('בר אילן לא פתח את החלון הדרוש. ייתכן שחלון אחר בו ממתין לתשובה.'),
    notResponding: N('בר אילן לא הגיב בזמן. ייתכן שהוא עסוק או ממתין לתשובה בחלון אחר.'),
    otherSession: N('השירות הזה שייך למשתמש Windows אחר שמחובר למחשב.'),
    badRequest: N('הבקשה לשירות לא הייתה תקינה.'),
    portTaken: N('תוכנה אחרת במחשב משתמשת בחיבור של השירות.'),
    badResponse: N('השירות החזיר תשובה לא תקינה.'),
    internal: N('אירעה תקלה פנימית בשירות. אפשר לנסות שוב.'),
    catalogUnreadable: N('לא ניתן לקרוא את רשימת הספרים. אפשר לבנות אותה מחדש בהגדרות התוסף.'),
    elevated: N('בר אילן פועל כמנהל מערכת, ולכן אין אליו גישה. יש לסגור אותו ולפתוח אותו שוב כרגיל.'),
    queryInvalid: N('בר אילן לא קיבל את השאילתה. יש לבדוק את הסימנים שבה.'),
    scopeNotFound: N('חלק מהקטגוריות או הספרים שנבחרו לא נמצאו בבר אילן. אפשר לקרוא את רשימת הספרים מחדש ולנסות שוב.'),
    cancelled: N('הפעולה בוטלה.'),
    notFound: N('השירות שבמחשב אינו מכיר את הפעולה הזו. כנראה שצריך לעדכן אותו.'),
    tooLarge: N('הבקשה גדולה מדי.'),
    forbidden: N('השירות דחה את הבקשה.'),
  });

  /**
   * ההודעה למשתמש. בעברית — הודעת השירות, המפורטת יותר; בשפה אחרת — הסבר
   * כללי מתורגם לפי הקוד, כי השירות כותב בעברית.
   */
  function errorMessage(error) {
    const message = (error && error.message) || '';
    const code = error && error.code;
    if (code === 'internal') return t(GENERIC_ERRORS.internal);
    if (I18n.language === I18n.SOURCE_LANGUAGE && message) return message;
    if (code && GENERIC_ERRORS[code]) return t(GENERIC_ERRORS[code]);
    return message || t('הפעולה נכשלה. אפשר לנסות שוב.');
  }

  // ------------------------------------------------------ חיפוש בבר אילן

  /** ההודעה אחרי חיפוש טקסט (`POST /text/search`). */
  function searchOutcomeMessage(result) {
    const query = (result && result.query) || '';
    const note = result && result.truncated ? ' ' + t('החיפוש כלל רק את תחילת הטקסט שסומן.') : '';
    // שאילתה מתקדמת מוצגת בדיאלוג עצמו; ציטוט שלה בתוך משפט היה מתערבב
    // (`8: (...)` בין מילים עבריות).
    if (result && result.advanced) {
      if (result.outcome === 'found') {
        return typeof result.count === 'number'
          ? t('בר אילן מצא {count} תוצאות. הן פתוחות בחלון של בר אילן.', { count: formatCount(result.count) })
          : t('התוצאות פתוחות בחלון של בר אילן.');
      }
      if (result.outcome === 'asked') {
        return t('בר אילן לא מצא תוצאות בספרים שנבחרו, ושואל אם לחפש בכל המאגרים. עונים על השאלה בחלון של בר אילן.');
      }
    }
    switch (result && result.outcome) {
      case 'found':
        return (
          (typeof result.count === 'number'
            ? t('בר אילן מצא {count} תוצאות עבור "{query}".', {
                count: formatCount(result.count),
                query,
              })
            : t('החיפוש "{query}" הוצג בבר אילן.', { query })) + note
        );
      case 'asked':
        return (
          t('בר אילן לא מצא תוצאות עבור "{query}" במאגרים שנבחרו, ושואל אם לחפש בכל המאגרים. עונים על השאלה בחלון של בר אילן.', { query }) +
          note
        );
      case 'refused':
        return (
          (I18n.language === I18n.SOURCE_LANGUAGE && result.message
            ? t('בר אילן לא ביצע את החיפוש: {reason}', { reason: result.message })
            : t('בר אילן לא ביצע את החיפוש. הסיבה מוצגת בחלון של בר אילן.')) + note
        );
      case 'forms':
        return t('בר אילן פתח את "ניהול הצורות". בוחרים בו את הצורות שרוצים ולוחצים "אישור", ואז יוצגו התוצאות.');
      default:
        return t('החיפוש נשלח לבר אילן.');
    }
  }

  /** קודים שבהם הפתרון הוא בהוראות שבלשונית התוסף. */
  const SETUP_CODES = Object.freeze([
    'serviceUnavailable',
    'permissionDenied',
    'portTaken',
    'otherSession',
    'notInstalled',
    'notFound',
  ]);

  /**
   * כמו [errorMessage], לפעולה שהגיעה מחוץ ללשונית (לחיצה ימנית, מסך
   * הספרייה): שם אין מסך הסבר, ולכן ההודעה מפנה אליו.
   */
  function actionErrorMessage(error) {
    const message = errorMessage(error);
    if (!error || !SETUP_CODES.includes(error.code)) return message;
    return message + ' ' + t('ההוראות המלאות בלשונית "בר אילן".');
  }

  /**
   * הערה על שירות ישן, שאינו יודע לחפש בבר אילן: `apiVersion` שלו זהה, ולכן
   * המסך הראשי עובד, אבל הלחיצה הימנית לא תעבוד. `null` כשהכול תקין.
   */
  function serviceNotice(health) {
    if (!health) return null;
    if (!serviceCan(health, 'searchText')) {
      return {
        kind: 'serviceOld',
        text: t('שירות בר אילן שבמחשב ישן, ולכן "חיפוש בבר אילן" בלחיצה ימנית לא יעבוד. כדאי להוריד את הגרסה החדשה.'),
      };
    }
    if (!serviceCan(health, 'browse')) {
      return {
        kind: 'serviceOld',
        text: t('שירות בר אילן שבמחשב ישן, ולכן אין כאן עיון בקטגוריות. כדאי להוריד את הגרסה החדשה.'),
      };
    }
    return null;
  }

  /** שורת הנתיב בעיון: "כל הספרים" ואחריו כל רמה, עם הנתיב שלה. */
  function breadcrumbs(path) {
    const crumbs = [{ name: t('כל הספרים'), path: '' }];
    let current = '';
    for (const part of String(path || '').split('/').filter(Boolean)) {
      current = current ? current + '/' + part : part;
      crumbs.push({ name: part, path: current });
    }
    return crumbs;
  }

  /** שם הקטגוריה האחרונה בנתיב, או ריק בשורש. */
  function scopeName(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  /** קיצור לתצוגה בשורה אחת. */
  function shortTitle(text) {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    return value.length > 60 ? value.slice(0, 59) + '…' : value;
  }

  /** "refused" אינו הצלחה; "asked" הוא — בר אילן שואל, והמשתמש יענה שם. */
  function searchSucceeded(result) {
    return Boolean(result) && result.outcome !== 'refused';
  }

  // ------------------------------------------------------ חיפוש הספרייה

  function hostSupportsLibrary(permissions) {
    return has(permissions, LIBRARY_PERMISSION);
  }

  /** הרשאות שאינן ידועות (לפני boot) אינן סיבה להזהיר. */
  function lacksStartupPermission(permissions) {
    return Array.isArray(permissions) && !permissions.includes(STARTUP_PERMISSION);
  }

  /** ההסבר, אחד לכל המקומות שבהם הוא מוצג. */
  function startupPermissionHint() {
    return t('כדי להפעיל: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "הוספת רכיבים לתוכנה".');
  }

  /** שורות הייצוא של השירות ← ספרים לחיפוש הספרייה של אוצריא. */
  function libraryBooksFromExport(rows) {
    const books = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(row)) continue;
      const [key, title, author, contextPath] = row;
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0 || typeof title !== 'string' || !title.trim()) {
        continue;
      }
      const segments = typeof contextPath === 'string' ? contextPath.split('/').filter(Boolean) : [];
      const book = {
        id,
        title: title.trim().slice(0, 300),
        // נתיב שמתחיל ב"בר אילן": כך הכרטיס בספרייה אומר מאיפה הספר
        // ("בר אילן, שו"ת"). הנתיב בצורה של library.getTree.
        categoryPath: ('/' + ['בר אילן', ...segments].join('/')).slice(0, 300),
      };
      if (typeof author === 'string' && author.trim()) book.author = author.trim().slice(0, 200);
      books.push(book);
    }
    return books;
  }

  /**
   * האם צריך לשלוח את הרשימה לאוצריא: נקראה רשימה אחרת ממה שנשלח, או
   * שגרסת התוסף השתנתה (למשל שינוי בשורת הקטגוריה).
   */
  function needsLibrarySync(status, synced, pluginVersion) {
    const catalog = (status && status.catalog) || {};
    if (!catalog.exists || !(catalog.bookCount > 0)) return false;
    if (!synced || synced.builtAt !== (catalog.builtAt || null)) return true;
    return Boolean(pluginVersion) && synced.pluginVersion !== pluginVersion;
  }

  /** שורת המשנה בפס העליון, לפי המסך. */
  function subtitleFor(model) {
    const status = model.status || {};
    const catalog = status.catalog || {};
    switch (model.screen) {
      case Screen.ready:
        return (
          booksLabel(catalog.bookCount) +
          (status.version ? ' · ' + t('מהדורה {version}', { version: status.version }) : '') +
          (model.buildActive ? ' · ' + t('קורא מחדש…') : '')
        );
      case Screen.building:
        return t('קורא את רשימת הספרים…');
      case Screen.serviceMissing:
      case Screen.serviceOutdated:
      case Screen.pluginOutdated:
        return t('נדרשת התקנה');
      case Screen.permissionDenied:
        return t('נדרשת הרשאה');
      case Screen.needsCatalog:
      case Screen.buildFailed:
        return t('נדרשת הכנה חד-פעמית');
      default:
        return '';
    }
  }

  /** הטקסט שנבחר מתוך אירוע לחיצה על פריט בתפריט ההקשר. */
  function selectedText(payload) {
    const text = payload && (payload.selectedText || (payload.selection && payload.selection.text));
    return typeof text === 'string' ? text.trim() : '';
  }

  const api = {
    FIRST_PORT,
    PORT_COUNT,
    API_VERSION,
    SERVICE_ID,
    PAGE_SIZE,
    MAX_SELECTION_LENGTH,
    LOCALHOST_PERMISSION,
    LIBRARY_PERMISSION,
    LIBRARY_PROVIDER,
    STARTUP_PERMISSION,
    CONTEXT_MENU_ITEM,
    Links,
    Command,
    Screen,
    formatCount,
    booksLabel,
    breadcrumbs,
    scopeName,
    foundLabel,
    bookMeta,
    bookContext,
    bookDetails,
    setupChecklist,
    contextLabel,
    hasLocalhostPermission,
    screenFor,
    serviceCan,
    catalogNotice,
    buildProgress,
    remainingLabel,
    needsRefresh,
    formatBuiltAt,
    serviceUrls,
    errorMessage,
    actionErrorMessage,
    serviceNotice,
    shortTitle,
    searchOutcomeMessage,
    searchSucceeded,
    hostSupportsLibrary,
    lacksStartupPermission,
    startupPermissionHint,
    libraryBooksFromExport,
    needsLibrarySync,
    selectedText,
    subtitleFor,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaDomain = api;
})(typeof self !== 'undefined' ? self : globalThis);
