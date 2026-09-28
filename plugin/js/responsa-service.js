// לקוח לשירות המקומי (docs/PROTOCOL.md) מעל `network.fetchStream`. זה הערוץ
// היחיד: `fetch()` ישיר מה-WebView נחסם ב-CORS, והשירות דוחה בקשות דפדפן.
(function (root) {
  'use strict';

  /** כשל עם `code` מהחוזה. ההחלטות נשענות על הקוד, לא על ההודעה. */
  class ServiceError extends Error {
    constructor(code, message, status, details) {
      super(message);
      this.name = 'ServiceError';
      this.code = code;
      this.status = status || 0;
      this.details = details || null;
    }
  }

  const UNAVAILABLE_MESSAGE =
    'שירות בר אילן אינו פועל במחשב. אם הוא לא מותקן, יש להתקין אותו.';

  /** `fetchStream` נחתך אחרי 120 שניות לכל היותר (API_REFERENCE). */
  const MAX_STREAM_MS = 120000;

  class ServiceClient {
    /**
     * @param bridge   האובייקט `window.Otzaria`.
     * @param baseUrl  כתובת השירות.
     */
    constructor(bridge, baseUrl) {
      this.bridge = bridge;
      this.baseUrl = baseUrl;
    }

    health() {
      return this.request('GET', '/health', undefined, { timeoutMs: 4000 });
    }

    status() {
      return this.request('GET', '/status', undefined, { timeoutMs: 15000 });
    }

    search(query, offset, limit) {
      return this.request('POST', '/catalog/search', {
        q: query,
        offset: offset || 0,
        limit,
      });
    }

    books(keys) {
      return this.request('POST', '/catalog/books', { keys });
    }

    /** פתיחה יכולה לכלול הפעלה של בר אילן, ולכן החסם הארוך ביותר. */
    open(key) {
      return this.request('POST', '/book/open', { key }, {
        timeoutMs: MAX_STREAM_MS,
      });
    }

    cancelBuild() {
      return this.request('POST', '/catalog/cancel', {});
    }

    icon() {
      return this.request('GET', '/icon', undefined, { timeoutMs: 15000 });
    }

    /** בקשה אחת, תשובת JSON אחת. זורק [ServiceError]. */
    async request(method, path, body, options) {
      const timeoutMs = (options && options.timeoutMs) || 15000;
      let status = null;
      let text = '';
      try {
        const chunks = this.bridge.call('network.fetchStream', this._params(
          method,
          path,
          body,
          timeoutMs,
        ));
        for await (const chunk of chunks) {
          if (chunk.type === 'response') status = chunk.status;
          else if (chunk.type === 'data') text += chunk.body;
        }
      } catch (error) {
        throw translateTransportError(error, status !== null);
      }
      return parseResponse(status, text);
    }

    /**
     * מתחיל בנייה או מצטרף אליה, ומעביר כל אירוע ל-[onEvent] עד אירוע סיום
     * (`done` או `error`), שמוחזר. זרם שנחתך בגלל חסם הזמן נפתח מחדש: השירות
     * מצרף אותו לבנייה שרצה. [signal] עוצר את ההאזנה, לא את הבנייה.
     */
    async watchBuild(onEvent, signal, options) {
      // רק הבקשה הראשונה רשאית להתחיל בנייה; כל חיבור מחדש מצטרף בלבד.
      let mode = options && options.attachOnly ? 'attach' : 'start';
      for (;;) {
        if (signal && signal.aborted) return null;
        let status = null;
        let pending = '';
        let terminal = null;
        const chunks = this.bridge.call('network.fetchStream', this._params(
          'POST',
          '/catalog/build',
          { mode },
          MAX_STREAM_MS,
        ));
        mode = 'attach';
        try {
          for await (const chunk of chunks) {
            if (signal && signal.aborted) break;
            if (chunk.type === 'response') {
              status = chunk.status;
              continue;
            }
            if (chunk.type !== 'data') continue;
            if (status === null || status >= 400) {
              pending += chunk.body;
              continue;
            }
            pending += chunk.body;
            const lines = pending.split('\n');
            pending = lines.pop();
            for (const line of lines) {
              const event = parseLine(line);
              if (!event || event.type === 'heartbeat') continue;
              onEvent(event);
              if (
                event.type === 'done' ||
                event.type === 'error' ||
                event.type === 'idle'
              ) {
                terminal = event;
              }
            }
            if (terminal) break;
          }
        } catch (error) {
          if (status === null) throw translateTransportError(error, false);
          // חסם הזמן או ניתוק באמצע: נפתח מחדש ונצטרף לבנייה.
        }
        if (terminal) return terminal;
        if (status !== null && status >= 400) {
          parseResponse(status, pending);
        }
        if (signal && signal.aborted) return null;
      }
    }

    _params(method, path, body, timeoutMs) {
      const params = {
        url: this.baseUrl + path,
        method,
        timeoutMs,
      };
      if (body !== undefined) {
        params.headers = { 'Content-Type': 'application/json' };
        params.body = JSON.stringify(body);
      }
      return params;
    }
  }

  function parseLine(line) {
    if (line.trim() === '') return null;
    try {
      return JSON.parse(line);
    } catch (_) {
      return null;
    }
  }

  function parseResponse(status, text) {
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (_) {
        throw new ServiceError(
          'badResponse',
          'השירות החזיר תשובה לא תקינה.',
          status,
        );
      }
    }
    if (status !== null && status < 400) return json;
    const error = json && json.error;
    if (error && typeof error.code === 'string') {
      throw new ServiceError(error.code, error.message, status, error.details);
    }
    throw new ServiceError(
      'badResponse',
      'השירות החזיר שגיאה (HTTP ' + status + ').',
      status,
    );
  }

  /**
   * כשל לפני שהגיעה תשובה = אין שירות מאזין (או שנחסם). כשל אחרי תשובה =
   * החיבור נפל באמצע.
   */
  function translateTransportError(error, gotResponse) {
    if (error instanceof ServiceError) return error;
    const message = String((error && error.message) || error || '');
    if (/permission_denied|forbidden/i.test(message)) {
      return new ServiceError(
        'permissionDenied',
        'לתוסף אין הרשאה לגשת לשירות המקומי. יש לאשר את ההרשאה בהגדרות התוסף.',
      );
    }
    if (/timeout|timed out/i.test(message)) {
      return new ServiceError(
        'timeout',
        'השירות לא הגיב בזמן. ייתכן שבר אילן עסוק; אפשר לנסות שוב.',
      );
    }
    if (gotResponse) {
      return new ServiceError(
        'connectionLost',
        'החיבור לשירות נקטע. אפשר לנסות שוב.',
      );
    }
    return new ServiceError('serviceUnavailable', UNAVAILABLE_MESSAGE);
  }

  const api = { ServiceClient, ServiceError, translateTransportError };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaService = api;
})(typeof self !== 'undefined' ? self : globalThis);
