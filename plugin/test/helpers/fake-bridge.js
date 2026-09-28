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
  }

  call(method, payload) {
    this.calls.push({ method, payload });
    if (method === 'network.fetchStream') return this._stream(payload);
    return Promise.resolve({ success: true, data: true, error: null });
  }

  on() {}

  async *_stream(params) {
    const path = params.url.replace(/^https?:\/\/[^/]+/, '');
    this.requests.push({ path, params, body: params.body ? JSON.parse(params.body) : null });
    await Promise.resolve();
    let route = this.routes[path];
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
