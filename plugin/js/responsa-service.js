// לקוח לשירות המקומי (docs/PROTOCOL.md) מעל `network.fetchStream`. זה הערוץ
// היחיד: `fetch()` ישיר מה-WebView נחסם ב-CORS, והשירות דוחה בקשות דפדפן.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;

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

  /** בדיקת פורט: חיבור שנדחה חוזר מיד; זה רק למקרה של תוכנה תקועה. */
  const PROBE_MS = 2500;

  /** זרמי בנייה ריקים ברצף שאחריהם מוותרים: השירות עונה ואינו מתקדם. */
  const MAX_EMPTY_STREAMS = 10;

  class ServiceClient {
    /**
     * @param bridge האובייקט `window.Otzaria`.
     * @param urls   הכתובות האפשריות של השירות, לפי סדר.
     */
    constructor(bridge, urls, options) {
      this.bridge = bridge;
      this.urls = urls || Domain.serviceUrls();
      this.baseUrl = null;
      this.sleep =
        (options && options.sleep) ||
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    /**
     * מוצא את השירות של המשתמש הזה ומחזיר את `/health` שלו. פורט שתפוס
     * בידי משתמש Windows אחר עונה `otherSession`, ומדלגים עליו.
     */
    async connect() {
      let foreign = false;
      const ordered = this.baseUrl
        ? [this.baseUrl, ...this.urls.filter((url) => url !== this.baseUrl)]
        : this.urls;
      for (const url of ordered) {
        try {
          const health = await this._request(url, 'GET', '/health', undefined, PROBE_MS);
          if (health && health.service === Domain.SERVICE_ID) {
            this.baseUrl = url;
            return health;
          }
          foreign = true;
        } catch (error) {
          if (error.code === 'permissionDenied' || error.code === 'hostBusy') {
            throw error;
          }
          if (error.code !== 'serviceUnavailable' && error.code !== 'otherSession') {
            foreign = true;
          }
        }
      }
      this.baseUrl = null;
      throw foreign
        ? new ServiceError(
            'portTaken',
            'תוכנה אחרת במחשב משתמשת בחיבור של השירות.',
          )
        : new ServiceError('serviceUnavailable', UNAVAILABLE_MESSAGE);
    }

    status() {
      return this.request('GET', '/status');
    }

    search(query, offset, limit) {
      return this.request('POST', '/catalog/search', {
        q: query,
        offset: offset || 0,
        limit,
      });
    }

    /** פתיחה יכולה לכלול הפעלה של בר אילן, ולכן החסם הארוך ביותר. */
    open(key) {
      return this.request('POST', '/book/open', { key }, MAX_STREAM_MS);
    }

    cancelBuild() {
      return this.request('POST', '/catalog/cancel', {});
    }

    /** בקשה אחת לשירות שנמצא ב-[connect]. זורק [ServiceError]. */
    async request(method, path, body, timeoutMs) {
      if (!this.baseUrl) await this.connect();
      try {
        return await this._request(this.baseUrl, method, path, body, timeoutMs || 15000);
      } catch (error) {
        // השירות נעלם או הוחלף: בפעם הבאה מחפשים אותו מחדש.
        if (error.code === 'serviceUnavailable' || error.code === 'otherSession') {
          this.baseUrl = null;
        }
        throw error;
      }
    }

    async _request(baseUrl, method, path, body, timeoutMs) {
      let status = null;
      let text = '';
      try {
        const chunks = this.bridge.call(
          'network.fetchStream',
          params(baseUrl, method, path, body, timeoutMs),
        );
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
     * (`done`, `error`, או `idle` כשאין בנייה), שמוחזר. זרם שנחתך בגלל חסם
     * הזמן נפתח מחדש במצב `attach`, כך שחיבור מחדש לעולם לא מתחיל בנייה.
     * [signal] עוצר את ההאזנה מיד, לא את הבנייה.
     */
    async watchBuild(onEvent, signal, options) {
      let mode = options && options.attachOnly ? 'attach' : 'start';
      let emptyStreams = 0;
      if (!this.baseUrl) await this.connect();
      for (;;) {
        if (signal && signal.aborted) return null;
        const outcome = await this._watchOnce(mode, onEvent, signal);
        mode = 'attach';
        if (outcome.terminal) return outcome.terminal;
        if (signal && signal.aborted) return null;
        emptyStreams = outcome.events > 0 ? 0 : emptyStreams + 1;
        if (emptyStreams >= MAX_EMPTY_STREAMS) {
          throw new ServiceError(
            'connectionLost',
            'השירות מפסיק לענות בזמן קריאת הרשימה. אפשר לנסות שוב.',
          );
        }
        if (emptyStreams > 1) await this.sleep(1000 * emptyStreams);
      }
    }

    async _watchOnce(mode, onEvent, signal) {
      let status = null;
      let pending = '';
      let events = 0;
      let terminal = null;
      const chunks = this.bridge.call(
        'network.fetchStream',
        params(this.baseUrl, 'POST', '/catalog/build', { mode }, MAX_STREAM_MS),
      );
      // בלי זה, ביטול מחכה ל-heartbeat הבא (עד 10 שניות) ותופס זרם.
      const stop = () => {
        if (chunks && typeof chunks.return === 'function') chunks.return();
      };
      if (signal) signal.addEventListener('abort', stop);
      try {
        for await (const chunk of chunks) {
          if (signal && signal.aborted) break;
          if (chunk.type === 'response') {
            status = chunk.status;
            continue;
          }
          if (chunk.type !== 'data') continue;
          pending += chunk.body;
          if (status === null || status >= 400) continue;
          const lines = pending.split('\n');
          pending = lines.pop();
          for (const line of lines) {
            const event = parseLine(line);
            if (!event || event.type === 'heartbeat') continue;
            events++;
            onEvent(event);
            if (event.type === 'done' || event.type === 'error' || event.type === 'idle') {
              terminal = event;
            }
          }
          if (terminal) break;
        }
      } catch (error) {
        if (status === null) throw translateTransportError(error, false);
        // חסם הזמן או ניתוק באמצע: הקורא יתחבר מחדש ויצטרף לבנייה.
      } finally {
        if (signal) signal.removeEventListener('abort', stop);
      }
      if (!terminal && status !== null && status >= 400) parseResponse(status, pending);
      return { terminal, events };
    }
  }

  function params(baseUrl, method, path, body, timeoutMs) {
    const result = { url: baseUrl + path, method, timeoutMs };
    if (body !== undefined) {
      result.headers = { 'Content-Type': 'application/json' };
      result.body = JSON.stringify(body);
    }
    return result;
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
        throw new ServiceError('badResponse', 'השירות החזיר תשובה לא תקינה.', status);
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
   * אוצריא מעבירה לזרם רק את הודעת השגיאה, בלי קוד, ובעברית. כשל לפני שהגיעה
   * תשובה בלי הודעה מוכרת = אין שירות מאזין; אחרי תשובה = החיבור נפל באמצע.
   */
  function translateTransportError(error, gotResponse) {
    if (error instanceof ServiceError) return error;
    const message = String((error && error.message) || error || '');
    if (/permission|הרשא|allowlist|רשימת ההיתר|forbidden/i.test(message)) {
      return new ServiceError(
        'permissionDenied',
        'לתוסף אין הרשאה לגשת לשירות המקומי.',
      );
    }
    if (/rate.?limit|too many active/i.test(message)) {
      return new ServiceError(
        'hostBusy',
        'אוצריא עסוקה כרגע. אפשר לנסות שוב בעוד רגע.',
      );
    }
    if (/timeout|timed out/i.test(message)) {
      return new ServiceError(
        'timeout',
        'השירות לא הגיב בזמן. ייתכן שבר אילן עסוק; אפשר לנסות שוב.',
      );
    }
    if (gotResponse) {
      return new ServiceError('connectionLost', 'החיבור לשירות נקטע. אפשר לנסות שוב.');
    }
    return new ServiceError('serviceUnavailable', UNAVAILABLE_MESSAGE);
  }

  const api = { ServiceClient, ServiceError, translateTransportError };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaService = api;
})(typeof self !== 'undefined' ? self : globalThis);
