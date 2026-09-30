// גשר מדומה: `network.fetchStream` מוחזר לפי מסלול, וכל קריאה נרשמת.
'use strict';

/** תשובה מדומה אחת: status + גוף, מחולק למקטעים כמו ב-fetchStream. */
function reply(status, body, options) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, chunks: (options && options.chunks) || [text] };
}

class FakeBridge {
  constructor(routes) {
    /** `path → reply | (params) => reply | Error` */
    this.routes = routes || {};
    this.calls = [];
    this.requests = [];
    /** `method → data | (payload) => data | { error }`; ברירת מחדל: `true`. */
    this.methods = {};
  }

  call(method, payload) {
    this.calls.push({ method, payload });
    if (method === 'network.fetchStream') return this._iterator(payload);
    let answer = Object.hasOwn(this.methods, method) ? this.methods[method] : true;
    if (typeof answer === 'function') answer = answer(payload);
    if (answer && typeof answer === 'object' && answer.error) {
      return Promise.resolve({ success: false, data: null, error: answer.error });
    }
    return Promise.resolve({ success: true, data: answer, error: null });
  }

  on() {}

  /**
   * כמו הזרם של אוצריא (plugin_tab_page.dart, createRpcStream): `return()`
   * סוגר מיד, גם כשקריאת `next()` ממתינה. ל-async generator רגיל זה לא נכון:
   * ה-return שלו ממתין עד שהגנרטור ממשיך.
   */
  _iterator(params) {
    const source = this._stream(params);
    let closed = false;
    let wake = null;
    return {
      next() {
        if (closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve, reject) => {
          wake = resolve;
          source.next().then(
            (item) => !closed && resolve(item),
            (error) => !closed && reject(error),
          );
        });
      },
      return() {
        closed = true;
        if (wake) wake({ value: undefined, done: true });
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  async *_stream(params) {
    const path = params.url.replace(/^https?:\/\/[^/]+/, '');
    const port = Number((params.url.match(/:(\d+)\//) || [])[1]);
    this.requests.push({ path, port, params, body: params.body ? JSON.parse(params.body) : null });
    await Promise.resolve();
    // מסלול לפי פורט ונתיב (`39701/health`) קודם למסלול לפי נתיב בלבד.
    let route = this.routes[port + path] !== undefined ? this.routes[port + path] : this.routes[path];
    if (typeof route === 'function') route = await route(params, this);
    if (route instanceof Error) throw route;
    if (!route) throw new Error('SocketException: Connection refused');
    yield { type: 'response', sequence: 0, status: route.status, ok: route.status < 400, headers: {} };
    let sequence = 1;
    for (const body of route.chunks) {
      if (body instanceof Error) throw body;
      yield { type: 'data', sequence: sequence++, body };
    }
    if (route.hang) await new Promise(() => {});
  }

  notifications(method) {
    return this.calls.filter((c) => c.method === method).map((c) => c.payload.message);
  }
}

module.exports = { FakeBridge, reply };
