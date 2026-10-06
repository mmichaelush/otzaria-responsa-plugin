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
    /** דף הגרסה האחרונה: מה חדש, וכל הקבצים. */
    releases: REPOSITORY_URL + '/releases/latest',
    /**
     * המתקין של הגרסה האחרונה, בהורדה ישירה: ה-CI מצרף אותו לכל גרסה בשם
     * קבוע. כתובת שאפשר להקליד גם במחשב אחר, בלי לחפש בדף.
     */
    setup: REPOSITORY_URL + '/releases/latest/download/OtzariaResponsa-Setup.exe',
    guide: REPOSITORY_URL + '/blob/main/docs/USER_GUIDE.md',
    issues: REPOSITORY_URL + '/issues',
    store: 'https://otzaria.org/plugins/6abfbb96f4aadb0d88fd755a',
    /** ההודעה בפורום אוצריא שמציגה את התוסף ומבהירה את מעמדו. */
    forum: 'https://otzaria.org/forum/post/40010',
  });

  /** כתובת המייל לפניות ולדיווחים, מחוץ לדיווח המובנה של אוצריא. */
  const SUPPORT_EMAIL = 'michaelush613@gmail.com';

  /** אורך התיאור בדיווח על בעיה; השאר שמור לפרטי המערכת וליומן. */
  const MAX_REPORT_TEXT = 3000;

  /**
   * כמה מהדיווח שמור ליומן השירות, גם כשיומן התוסף ארוך: בכשל של השירות
   * הסיבה כתובה שם, ולא ביומן התוסף.
   */
  const SERVICE_LOG_RESERVE = 1200;

  /** פריט "חיפוש בבר אילן" בתפריט הלחיצה הימנית (manifest.json). */
  const CONTEXT_MENU_ITEM = 'responsa-search';

  /**
   * פריט "איתור המקום בבר אילן" בתפריט הלחיצה הימנית. הוא פותח את הלשונית
   * (`openPlugin`), כי בר אילן מוצא לרוב כמה מקורות, ובוחרים ביניהם כאן.
   */
  const LOCATE_MENU_ITEM = 'responsa-locate-here';

  /** פקודות מקיצורי המקלדת (manifest.json). */
  const Command = Object.freeze({
    openPanel: 'responsa.openPanel',
    openBooks: 'responsa.openBooks',
    openText: 'responsa.openText',
    openLocate: 'responsa.openLocate',
  });

  /** הלשונית שכל פקודה פותחת. "פתיחת לשונית בר אילן" — האחרונה שהייתה פתוחה. */
  const COMMAND_TABS = Object.freeze({
    [Command.openBooks]: 'books',
    [Command.openText]: 'text',
    [Command.openLocate]: 'locate',
  });

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

  /**
   * מסכים שבהם אין עם מה לחפש: אין שירות, אין הרשאה, אין בר אילן. בהם גם
   * "חיפוש בטקסט" ו"איתור מקום" מציגות את מה שחסר. בלי רשימת ספרים (או
   * בזמן קריאה) אפשר לחפש בטקסט ולאתר מקום, כי אלה אינם נשענים עליה.
   */
  const SETUP_SCREENS = new Set([
    Screen.loading,
    Screen.unsupported,
    Screen.permissionDenied,
    Screen.serviceMissing,
    Screen.serviceError,
    Screen.serviceOutdated,
    Screen.pluginOutdated,
    Screen.portTaken,
    Screen.notInstalled,
  ]);

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
        label: t('רשימת הספרים נקראה מבר אילן (פעם אחת, כמה דקות)'),
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
   * השוואת גרסאות לפי מספרים ולא לפי טקסט: 0.5.9 < 0.5.10. סיומת ("-beta")
   * אינה נספרת. `null` כשאחת מהן אינה גרסה.
   */
  function compareVersions(a, b) {
    const parse = (value) => {
      const match = typeof value === 'string' && /^\s*v?(\d+(?:\.\d+)*)/.exec(value);
      return match ? match[1].split('.').map(Number) : null;
    };
    const left = parse(a);
    const right = parse(b);
    if (!left || !right) return null;
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      const diff = (left[i] || 0) - (right[i] || 0);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    }
    return 0;
  }

  /**
   * השירות ישן מהתוסף: התוסף מתעדכן מהחנות של אוצריא, והשירות רק מהמתקין.
   * שירות חדש מהתוסף תקין (המתקין החדש עובד גם עם תוסף ישן).
   */
  function serviceBehind(health, pluginVersion) {
    return compareVersions(health && health.serverVersion, pluginVersion) === -1;
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
   * הסרגל אינו קובע אחוז. `scanned` סופר שורות בעץ של בר אילן (קטגוריות,
   * ספרים ופרקים), ולא ספרים: 465,701 שורות ב-CD25 לכשמונת אלפים ספרים.
   * לכן הטקסט אומר "שורות", כדי שלא ייראה כמו מספר הספרים.
   */
  function buildProgress(progress, elapsedMs) {
    const stage = (progress && progress.stage) || 'starting';
    const scanned = (progress && progress.scanned) || 0;
    const expected = progress && progress.expected;
    let fraction = null;
    let detail = '';
    if (stage === 'classifying') {
      fraction = 0.99;
      detail = t('נקראו {count} שורות מהעץ של בר אילן (קטגוריות, ספרים ופרקים)', { count: formatCount(scanned) });
    } else if (expected > 0 && scanned > 0) {
      // לעולם לא 100% לפני הסיום: המכנה הוא הערכה מהקריאה הקודמת.
      fraction = Math.min(scanned / expected, 0.98);
      detail = t('נקראו {count} מתוך כ-{total} שורות בעץ של בר אילן (קטגוריות, ספרים ופרקים)', {
        count: formatCount(scanned),
        total: formatCount(expected),
      });
    } else if (scanned > 0 || (progress && progress.sectionsTotal > 0)) {
      // מהדורה בלי מכנה ידוע: אין אחוז, אבל מספר השורות שעולה מראה שהקריאה
      // מתקדמת. בלעדיו קריאה איטית (חלק אחד בכמה דקות) נראית תקועה.
      detail = [
        scanned > 0 ? t('נקראו {count} שורות בעץ של בר אילן', { count: formatCount(scanned) }) : '',
        progress.sectionsTotal > 0
          ? t('חלק {done} מתוך {total}', {
              done: formatCount(progress.sectionsDone || 0),
              total: formatCount(progress.sectionsTotal),
            })
          : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return {
      label: stageLabel(stage),
      fraction,
      percent: fraction === null ? null : Math.round(fraction * 100),
      detail,
      remaining: remainingLabel(fraction, elapsedMs),
      ...buildNotes(progress),
    };
  }

  /**
   * שורות נוספות מאירוע ההתקדמות (שירות 0.5.2 ומעלה). כל אירוע מחליף את
   * הקודם, ולכן שורה שאינה באירוע הבא נעלמת.
   * - `waiting`: בר אילן לא עונה, והקריאה ממתינה לו (עד 3 דקות). בלי ההסבר
   *   המספרים עומדים, והמשתמש מבטל קריאה שהייתה ממשיכה.
   * - `notice`: מה שהשירות עשה בעצמו (למשל הפעיל מחדש את בר אילן שקרס).
   *   בעברית — הטקסט של השירות; בשפה אחרת — הסבר כללי, כי השירות כותב בעברית.
   */
  function buildNotes(progress) {
    const notice = progress && typeof progress.notice === 'string' ? progress.notice.trim() : '';
    return {
      waiting: progress && progress.waiting === true
        ? t('בר אילן לא מגיב כרגע. הקריאה ממתינה לו וממשיכה מעצמה; אין צורך לבטל.')
        : '',
      notice: !notice
        ? ''
        : I18n.language === I18n.SOURCE_LANGUAGE
          ? shortText(notice, 300)
          : t('בר אילן נתקל בתקלה, והשירות טיפל בה. הקריאה ממשיכה.'),
    };
  }

  function shortText(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
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
    catalogUnreadable: N('לא ניתן לקרוא את רשימת הספרים. אפשר לבנות אותה מחדש בלשונית "הגדרות".'),
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
   * הערה על שירות ישן: `apiVersion` שלו זהה, ולכן הלשונית עובדת. שירות לפני
   * 0.5.0 (בלי `notify`) אינו מבין את הבקשות שאוצריא שולחת בלחיצה הימנית
   * ובחיפוש הספרייה, ולכן הם מוסתרים (`Engine.syncPort`). שירות אחר שישן
   * מהתוסף חסר תיקונים: התוסף מתעדכן מהחנות, והשירות רק מהמתקין. `null`
   * כשהכול תקין.
   */
  function serviceNotice(health, pluginVersion) {
    if (!health) return null;
    if (!serviceCan(health, 'notify')) {
      return {
        kind: 'serviceOld',
        text: t('שירות בר אילן שבמחשב ישן, ולכן "חיפוש בבר אילן" בלחיצה ימנית ופתיחת ספרים מחיפוש הספרייה אינם זמינים. כדאי להוריד את הגרסה החדשה.'),
      };
    }
    if (!serviceBehind(health, pluginVersion)) return null;
    return {
      kind: 'serviceBehind',
      text: t('שירות בר אילן שבמחשב (גרסה {service}) ישן מהתוסף (גרסה {plugin}). התוסף מתעדכן מהחנות של אוצריא, והשירות רק מהמתקין: כדאי להוריד ולהתקין אותו.', {
        service: health.serverVersion,
        plugin: pluginVersion,
      }),
    };
  }

  /**
   * במסך "השירות לא מגיב", כשהשירות ישן מהתוסף: התקלה כנראה כבר תוקנה
   * בשירות החדש, והפתרון הוא המתקין ולא בדיקה חוזרת. `null` אחרת.
   */
  function serviceUpdateHint(health, pluginVersion) {
    if (!serviceBehind(health, pluginVersion)) return null;
    return t('שירות בר אילן שבמחשב ישן (גרסה {service}), והתיקון לתקלה הזו נמצא כנראה בגרסה החדשה ({plugin}). התקינו את המתקין החדש.', {
      service: health.serverVersion,
      plugin: pluginVersion,
    });
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

  /** יש רשימת ספרים (לבחירת קטגוריות בחיפוש בטקסט). */
  function catalogReady(status) {
    return Boolean(status && status.catalog && status.catalog.exists);
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

  /** `http://127.0.0.1:39701` ← `39701`; כל דבר אחר ← `null`. */
  function portOf(baseUrl) {
    const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(String(baseUrl || ''));
    if (!match) return null;
    const port = Number(match[1]);
    return port >= 1 && port <= 65535 ? port : null;
  }

  /** ההודעה אחרי פתיחה: גם מאיפה החלון, כש-Windows לא הביא אותו לחזית. */
  function openedMessage(title, result) {
    const name = title || t('הספר');
    if (result && result.broughtToFront === false) {
      return t('"{title}" נפתח בבר אילן. אם החלון לא הופיע, הוא בשורת המשימות.', {
        title: name,
      });
    }
    return t('"{title}" נפתח בבר אילן', { title: name });
  }

  // ------------------------------------------------------------- דיווח

  function section(title, body) {
    return '\n\n--- ' + title + ' ---\n' + body;
  }

  function linesOf(text) {
    const value = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    return value ? value.split('\n') : [];
  }

  /** אורך השורות כשהן מחוברות ב-`\n`. */
  function joinedLength(lines) {
    return lines.reduce((sum, line) => sum + line.length, 0) + Math.max(lines.length - 1, 0);
  }

  /** השורות הראשונות ([fromEnd]: האחרונות) שנכנסות ב-[room] תווים. */
  function fitting(lines, room, fromEnd) {
    const order = fromEnd ? lines.slice().reverse() : lines;
    const kept = [];
    let used = -1;
    for (const line of order) {
      if (used + 1 + line.length > room) break;
      used += 1 + line.length;
      kept.push(line);
    }
    return fromEnd ? kept.reverse() : kept;
  }

  /** כמו [fitting], ו-`…` בשורה משלה במקום מה שהושמט. */
  function fitWithGap(lines, room, fromEnd) {
    if (joinedLength(lines) <= room) return lines;
    const kept = fitting(lines, room - 2, fromEnd);
    if (!kept.length) return [];
    return fromEnd ? ['…', ...kept] : [...kept, '…'];
  }

  /** `summary` של השירות, או ההערה שאומרת למה לא התקבל. */
  function serviceSummary(service) {
    return (service && (service.summary || service.note)) || '';
  }

  /**
   * הטקסט של "העתקת הפרטים" ושל המייל, בלי הגבלת אורך. `parts`:
   * `{ status, log, service }`; [service] מ-`ServiceClient.diagnostics`, או
   * `null` כששירות ישן אינו מוסר פרטים.
   */
  function diagnosticsText(parts) {
    const service = parts.service || {};
    const summary = serviceSummary(service);
    return (
      parts.status +
      (parts.log ? section(t('יומן פעולות'), parts.log) : '') +
      (summary ? section(t('שירות בר אילן'), summary) : '') +
      (service.logTail ? section(t('יומן השירות'), service.logTail) : '')
    );
  }

  /**
   * פרטי הדיווח, עד [max] תווים, ואף שורה אינה נחתכת באמצע. הסדר הוא סדר
   * העדיפות: התיאור, פרטי המערכת, סיכום השירות, יומן התוסף, יומן השירות.
   * מיומן התוסף נשמרות שורות ההפעלה (`startup`: הגרסאות, השירות שנמצא),
   * ואחריהן הסוף, החדש (`log`); מיומן השירות — הסוף. ליומן השירות שמור
   * [SERVICE_LOG_RESERVE], כדי שיומן תוסף ארוך לא ידחק אותו לגמרי.
   */
  function reportDetails(parts, max) {
    let details = (parts.text + '\n\n---\n' + parts.status).slice(0, max);
    const add = (title, lines) => {
      if (lines.length) details += section(title, lines.join('\n'));
    };
    const room = (title) => max - details.length - section(title, '').length;
    const service = parts.service || {};

    const summaryTitle = t('שירות בר אילן');
    add(summaryTitle, fitWithGap(linesOf(serviceSummary(service)), room(summaryTitle), false));

    const serviceLog = linesOf(service.logTail);
    const logTitle = t('יומן פעולות');
    const reserve = serviceLog.length
      ? Math.min(SERVICE_LOG_RESERVE, section(t('יומן השירות'), service.logTail).length)
      : 0;
    const logRoom = room(logTitle) - reserve;
    const startup = linesOf(parts.startup);
    const rest = linesOf(parts.log);
    if (joinedLength(startup.concat(rest)) <= logRoom) {
      add(logTitle, startup.concat(rest));
    } else {
      const head = fitting(startup, logRoom, false);
      add(logTitle, head.concat(fitWithGap(rest, logRoom - (head.length ? joinedLength(head) + 1 : 0), true)));
    }

    const serviceLogTitle = t('יומן השירות');
    add(serviceLogTitle, fitWithGap(serviceLog, room(serviceLogTitle), true));
    return details;
  }

  const api = {
    FIRST_PORT,
    PORT_COUNT,
    API_VERSION,
    SERVICE_ID,
    PAGE_SIZE,
    LOCALHOST_PERMISSION,
    LIBRARY_PERMISSION,
    LIBRARY_PROVIDER,
    STARTUP_PERMISSION,
    CONTEXT_MENU_ITEM,
    LOCATE_MENU_ITEM,
    COMMAND_TABS,
    Links,
    SUPPORT_EMAIL,
    MAX_REPORT_TEXT,
    Command,
    Screen,
    SETUP_SCREENS,
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
    compareVersions,
    serviceBehind,
    serviceUpdateHint,
    catalogReady,
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
    portOf,
    openedMessage,
    diagnosticsText,
    reportDetails,
    subtitleFor,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaDomain = api;
})(typeof self !== 'undefined' ? self : globalThis);
