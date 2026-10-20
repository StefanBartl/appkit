import { describe, expect, it } from 'vitest';
import { ApiError, HubClient, etagOf, failure, textOf } from './client';

interface Sent {
  url: string;
  init: RequestInit;
  headers: Headers;
}

/** A fetch that answers each call with the next response (after its gate) and keeps what was sent. */
function recording(answers: ({ make: () => Response; gate?: Promise<void> } | (() => Response))[]): { fetchFn: typeof fetch; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetchFn = (async (url: unknown, init: RequestInit = {}) => {
    sent.push({ url: String(url), init, headers: new Headers(init.headers) });
    const step = answers.shift();
    if (!step) return json({});
    if (typeof step === 'function') return step();
    if (step.gate) await step.gate;
    return step.make();
  }) as typeof fetch;
  return { fetchFn, sent };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const client = (fetchFn: typeof fetch, base = '') => new HubClient<{ n: number }>(fetchFn, '/api/demo', base);

describe('the request', () => {
  it('sends the session as a bearer token, without cache, cookie or referrer', async () => {
    const { fetchFn, sent } = recording([() => json({ ok: 1 })]);
    const hub = client(fetchFn);
    hub.setToken('tok');
    await hub.json('/api/demo/x');
    expect(sent[0]?.headers.get('Authorization')).toBe('Bearer tok');
    expect(sent[0]?.init.cache).toBe('no-store');
    expect(sent[0]?.init.credentials).toBe('omit');
    expect(sent[0]?.init.referrerPolicy).toBe('no-referrer');
  });

  it('sends no Authorization header without a token, and puts the origin in front', async () => {
    const { fetchFn, sent } = recording([() => json({})]);
    await client(fetchFn, 'http://hub').json('/api/demo/x');
    expect(sent[0]?.headers.has('Authorization')).toBe(false);
    expect(sent[0]?.url).toBe('http://hub/api/demo/x');
  });

  it('names the routes of the app and its stream', () => {
    const hub = client(recording([]).fetchFn, 'http://hub');
    expect(hub.route('snapshot')).toBe('/api/demo/snapshot');
    expect(hub.eventsUrl).toBe('http://hub/api/demo/events');
  });

  it('says the session is gone when the token that was sent is the one still held', async () => {
    const { fetchFn } = recording([() => json({}, 401)]);
    const hub = client(fetchFn);
    hub.setToken('old');
    let told = 0;
    hub.onUnauthorized = () => (told += 1);
    await expect(hub.json('/api/demo/x')).rejects.toBeInstanceOf(ApiError);
    expect(told).toBe(1);
  });

  it('ignores a late refusal of a question asked with a token that is no longer the one held', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { fetchFn, sent } = recording([{ make: () => json({}, 401), gate }]);
    const hub = client(fetchFn);
    hub.setToken('old');
    let told = 0;
    hub.onUnauthorized = () => (told += 1);
    const late = hub.json('/api/demo/x').catch(() => undefined);
    hub.setToken('fresh');
    release();
    await late;
    expect(sent[0]?.headers.get('Authorization')).toBe('Bearer old');
    expect(told).toBe(0);
  });
});

describe('the refusal', () => {
  it('is an error with the code and message of the hub', async () => {
    const error = await failure(json({ error: { code: 'write_refused', message: 'no class' } }, 403));
    expect(error).toBeInstanceOf(ApiError);
    expect([error.status, error.code, error.message]).toEqual([403, 'write_refused', 'no class']);
  });

  it('keeps the general words when the body is not the hub\'s, or its fields are not texts', async () => {
    expect((await failure(new Response('<html>', { status: 502 }))).message).toBe('HTTP 502');
    const odd = await failure(json({ error: { code: 7, message: { a: 1 } } }, 500));
    expect([odd.code, odd.message]).toEqual(['http_error', 'HTTP 500']);
  });
});

describe('hello and the pairing code', () => {
  it('reads hello with the capabilities, or none for an engine that names none', async () => {
    const { fetchFn } = recording([
      () => json({ instance: 'i', version: '1', engine: { ready: true, problem: null, capabilities: ['a'] } }),
      () => json({ instance: 'i', version: '1', engine: { ready: false, problem: 'x' } }),
    ]);
    const hub = client(fetchFn);
    expect((await hub.hello()).engine).toEqual({ ready: true, problem: null, capabilities: ['a'] });
    expect((await hub.hello()).engine).toEqual({ ready: false, problem: 'x', capabilities: null });
  });

  it('trades a code for a token, with no session header, and refuses an answer without one', async () => {
    const { fetchFn, sent } = recording([() => json({ token: 'T' }), () => json({ token: 5 }), () => json({}, 403)]);
    const hub = client(fetchFn);
    hub.setToken('stale');
    expect(await hub.exchange('code')).toBe('T');
    expect(sent[0]?.url).toBe('/auth/exchange');
    expect(sent[0]?.headers.has('Authorization')).toBe(false);
    expect(JSON.parse(String(sent[0]?.init.body))).toEqual({ code: 'code' });
    await expect(hub.exchange('c')).rejects.toMatchObject({ status: 502, code: 'bad_reply' });
    await expect(hub.exchange('c')).rejects.toMatchObject({ status: 403 });
  });
});

describe('the snapshot', () => {
  it('asks with the tag it holds and takes a 304 as not modified', async () => {
    const { fetchFn, sent } = recording([() => new Response(null, { status: 304 })]);
    const hub = client(fetchFn);
    expect(await hub.snapshot('sha256:abc')).toEqual({ kind: 'not_modified' });
    expect(sent[0]?.headers.get('If-None-Match')).toBe('"sha256:abc"');
    expect(sent[0]?.url).toBe('/api/demo/snapshot');
  });

  it('gives the document and its tag, without the marks of a weak tag', async () => {
    const { fetchFn, sent } = recording([() => json({ n: 1 }, 200, { ETag: 'W/"x1"' })]);
    const result = await client(fetchFn).snapshot(null);
    expect(result).toEqual({ kind: 'fresh', doc: { n: 1 }, etag: 'x1' });
    expect(sent[0]?.headers.has('If-None-Match')).toBe(false);
  });

  it('passes a refusal on', async () => {
    await expect(client(recording([() => json({}, 500)]).fetchFn).snapshot(null)).rejects.toBeInstanceOf(ApiError);
  });

  it('reads the tag of a header', () => {
    expect(etagOf('"a"')).toBe('a');
    expect(etagOf('W/"b"')).toBe('b');
    expect(etagOf(null)).toBeNull();
  });
});

describe('posting', () => {
  it('sends the body as JSON and reads the answer as JSON, and passes the signal on', async () => {
    const { fetchFn, sent } = recording([() => json({ done: true })]);
    const controller = new AbortController();
    const out = await client(fetchFn).postJson<{ done: boolean }>('/api/demo/ops', { a: 1 }, controller.signal);
    expect(out).toEqual({ done: true });
    expect(sent[0]?.init.method).toBe('POST');
    expect(sent[0]?.headers.get('Content-Type')).toBe('application/json');
    expect(sent[0]?.init.body).toBe('{"a":1}');
    expect(sent[0]?.init.signal).toBe(controller.signal);
  });

  it('asks for a rescan with an empty body, and raises the refusal of a post that only says it went through', async () => {
    const { fetchFn, sent } = recording([() => json({}), () => json({ error: { code: 'busy', message: 'm' } }, 429)]);
    const hub = client(fetchFn);
    await hub.rescan();
    expect(sent[0]?.url).toBe('/api/demo/rescan');
    expect(sent[0]?.init.body).toBe('{}');
    await expect(hub.post('/api/demo/open', { id: 'x' })).rejects.toMatchObject({ status: 429, code: 'busy' });
  });
});

describe('textOf', () => {
  it('takes a text and nothing else', () => {
    expect(textOf('a')).toBe('a');
    expect(textOf(1)).toBeNull();
    expect(textOf(null)).toBeNull();
  });
});
