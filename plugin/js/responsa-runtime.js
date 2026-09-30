// הגבול היחיד מול ה-SDK של אוצריא (מלבד זרמי הרשת של responsa-service.js):
// כל קריאה עוברת כאן, ולכן לכל כשל אותה צורה, ואף אירוע אינו הופך לדחייה
// שאיש אינו תופס.
(function (root) {
  'use strict';

  const CODES = Object.freeze({
    unknownMethod: 'error.unknown_method',
    unavailable: 'error.unavailable',
    permissionDenied: 'permission_denied',
    notFound: 'error.not_found',
    rateLimited: 'error.rate_limited',
  });

  /** השיטה חסרה או חסומה במארח הזה: היכולת פשוט לא מוצעת. */
  const SOFT_CODES = Object.freeze([
    CODES.unknownMethod,
    CODES.unavailable,
    CODES.permissionDenied,
    'error.permission_denied',
    'error.unsupported_context',
  ]);

  class SdkError extends Error {
    constructor(method, response) {
      const failure = (response && response.error) || {};
      const code = failure.code || 'error.unknown';
      super(method + ' [' + code + ']: ' + (failure.message || ''));
      this.name = 'SdkError';
      this.method = method;
      this.code = code;
      this.hostMessage = failure.message || '';
    }

    get isUnsupported() {
      return SOFT_CODES.includes(this.code);
    }
  }

  // דלי האסימונים של אוצריא (50, אסימון לכל 10ms, והשארית נזרקת) הוא צוק ולא
  // האטה: 50 קריאות צפופות עוברות, וכל השאר נדחות בשקט. שומרים עותק שלו
  // ומחכים במקום להידחות; ניסיון חוזר רק על `rate_limited`, שנדחה לפני
  // שהקריאה רצה ולכן בטוח לחזור עליו בכל שיטה.
  const BUCKET_SIZE = 45;
  const REFILL_MS = 10;
  const WAIT_MS = 15;
  const RETRY_BACKOFF_MS = Object.freeze([20, 60, 150, 400, 900]);

  const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * @param bridge  `window.Otzaria`.
   * @param options `{ now, sleep, logger }` להחלפה בבדיקות. ברירת המחדל של
   *                [logger] היא יומן הדף (responsa-log.js), אם נטען.
   */
  function createRuntime(bridge, options) {
    const opts = options || {};
    const now = opts.now || (() => Date.now());
    const sleep = opts.sleep || defaultSleep;
    const logger = opts.logger || (root.ResponsaLog && root.ResponsaLog.shared) || console;
    const debug = (message, detail) => {
      if (typeof logger.debug === 'function') logger.debug(message, detail);
    };

    let tokens = BUCKET_SIZE;
    let refilledAt = now();
    let gate = Promise.resolve();

    function takeToken() {
      const time = now();
      // שעון שחוזר אחורה (NTP) היה נועל את כל הקריאות לזמן רב.
      tokens = Math.min(
        BUCKET_SIZE,
        tokens + Math.max(0, Math.floor((time - refilledAt) / REFILL_MS)),
      );
      refilledAt = time;
      if (tokens <= 0) return false;
      tokens -= 1;
      return true;
    }

    /** רק ההמתנה מסודרת בתור; הקריאות עצמן רצות במקביל. */
    function reserveSlot() {
      const reservation = gate.then(async () => {
        while (!takeToken()) await sleep(WAIT_MS);
      });
      gate = reservation.then(
        () => {},
        () => {},
      );
      return reservation;
    }

    async function callRaw(method, payload) {
      if (!bridge || typeof bridge.call !== 'function') {
        return { success: false, error: { code: CODES.unavailable, message: 'no SDK' } };
      }
      const params = payload || {};
      await reserveSlot();
      let response = await bridge.call(method, params);
      for (const backoff of RETRY_BACKOFF_MS) {
        if (!(response && response.error && response.error.code === CODES.rateLimited)) {
          break;
        }
        tokens = 0;
        await sleep(backoff);
        response = await bridge.call(method, params);
      }
      return response;
    }

    /** מחזיר `data`, או זורק [SdkError]. */
    async function call(method, payload) {
      const response = await callRaw(method, payload);
      if (!response || response.success === false) {
        const error = new SdkError(method, response);
        debug(method + ' נכשלה', error);
        throw error;
      }
      return response.data;
    }

    /**
     * לקריאות שכשלונן אינו צריך לעצור את הזרימה (הודעה, רישום אופציונלי).
     * לעולם לא לפעולה שהמשתמש ביקש: כל לחיצה נגמרת בתוצאה או בהודעה.
     */
    async function callSoft(method, payload, fallback) {
      try {
        return await call(method, payload);
      } catch (error) {
        if (!(error instanceof SdkError && error.isUnsupported)) {
          logger.warn('[responsa] ' + method + ' failed', error);
        }
        return fallback === undefined ? null : fallback;
      }
    }

    /** כל הודעה שהמשתמש ראה נרשמת: כך היומן מספר את הסיפור כפי שהוא חווה אותו. */
    const show = (method, level, message) => {
      if (typeof logger[level] === 'function') logger[level]('הודעה: ' + message);
      return callSoft(method, { message });
    };
    const notify = Object.freeze({
      info: (message) => show('ui.showMessage', 'info', message),
      success: (message) => show('ui.showSuccess', 'info', message),
      error: (message) => show('ui.showError', 'warn', message),
    });

    /** `Otzaria.on` שכשל במטפל נרשם בלוג ואינו בורח כדחייה. */
    function on(eventName, handler) {
      if (!bridge || typeof bridge.on !== 'function') return () => {};
      const wrapped = (payload) =>
        Promise.resolve()
          .then(() => handler(payload))
          .catch((error) => logger.error('[responsa] event ' + eventName + ' failed', error));
      bridge.on(eventName, wrapped);
      return () => bridge.off && bridge.off(eventName, wrapped);
    }

    return Object.freeze({ bridge, call, callRaw, callSoft, notify, on });
  }

  const api = { CODES, SdkError, createRuntime };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaRuntime = api;
})(typeof self !== 'undefined' ? self : globalThis);
