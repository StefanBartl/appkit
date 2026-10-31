// The browser-test helpers, against a fake Playwright page: which requests count, what the script put into the page
// records, and what the IndexedDB spy sees. The scripts given to the page run here against a fake window.
//
//   node --test test/e2e.test.mjs        (from web-kit/)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { idbWrites, spyOnIndexedDb, violations, watchPage } from '../src/e2e.js';

/** A page whose events the test fires; `addInitScript` runs the script at once in `globals` (a fake window). */
function fakePage(globals) {
  const listeners = {};
  const run = (fn) => {
    const saved = {};
    for (const key of Object.keys(globals)) {
      saved[key] = globalThis[key];
      globalThis[key] = globals[key];
    }
    try {
      return fn();
    } finally {
      for (const key of Object.keys(globals)) {
        if (saved[key] === undefined) delete globalThis[key];
        else globalThis[key] = saved[key];
      }
    }
  };
  return {
    on: (event, listener) => (listeners[event] ??= []).push(listener),
    fire: (event, arg) => (listeners[event] ?? []).forEach((l) => l(arg)),
    addInitScript: async (fn) => void run(fn),
    evaluate: async (fn) => run(fn),
  };
}

const request = (url, method = 'GET') => ({ url: () => url, method: () => method });
const PAGE = 'file:///C:/x/app.html';

test('a request that leaves the page is recorded; the page itself, blob: and data: are not the network', async () => {
  const window = {};
  const handlers = {};
  const document = { addEventListener: (type, fn) => (handlers[type] = fn) };
  const page = fakePage({ window, document });
  const seen = await watchPage(page, { pageUrl: PAGE });
  page.fire('request', request(PAGE));
  page.fire('request', request('blob:null/1234'));
  page.fire('request', request('data:image/png;base64,AA'));
  page.fire('request', request('https://example.com/x', 'POST'));
  page.fire('request', request('file:///C:/x/other.html'));
  assert.deepEqual(seen.requests, ['POST https://example.com/x', 'GET file:///C:/x/other.html']);

  page.fire('pageerror', new Error('boom'));
  page.fire('console', { type: () => 'error', text: () => 'bad' });
  page.fire('console', { type: () => 'log', text: () => 'fine' });
  assert.deepEqual(seen.errors, ['Error: boom', 'bad']);

  // The script in the page records each violation of the policy.
  assert.deepEqual(await violations(page), []);
  // (The event comes in the page: in the fake window.)
  await page.evaluate(() => {
    handlers.securitypolicyviolation({ violatedDirective: 'connect-src', blockedURI: 'https://example.com/' });
    handlers.securitypolicyviolation({ violatedDirective: 'worker-src', blockedURI: 'blob' });
  });
  assert.deepEqual(await violations(page), ['connect-src https://example.com/', 'worker-src blob']);
  await assert.rejects(watchPage(page, {}), /address of the page/);
});

test('the IndexedDB spy records every write, with its database, before it is made', async () => {
  const made = [];
  class Store {
    constructor(db, name) {
      this.name = name;
      this.transaction = { db: { name: db } };
    }
    put(value, key) {
      made.push(['put', key]);
      return 'request';
    }
    add() {}
    clear() {
      made.push(['clear']);
    }
    delete() {}
  }
  const window = {};
  const page = fakePage({ window, IDBObjectStore: Store });
  await spyOnIndexedDb(page);
  const handles = new Store('tasks-web', 'handles');
  assert.equal(handles.put({ id: 'a' }, 'recent'), 'request', 'the write is still made');
  new Store('testing-web', 'handles').put({ self: undefined, f() {} }, 'k');
  const cyclic = {};
  cyclic.self = cyclic;
  new Store('testing-web', 'list').put(cyclic, 'c');
  new Store('testing-web', 'list').clear();
  assert.deepEqual(made, [['put', 'recent'], ['put', 'k'], ['put', 'c'], ['clear']]);
  assert.deepEqual(await idbWrites(page), [
    { db: 'tasks-web', store: 'handles', op: 'put', json: '{"id":"a"}' },
    { db: 'testing-web', store: 'handles', op: 'put', json: '{}' },
    { db: 'testing-web', store: 'list', op: 'put', json: '<not JSON>' },
    { db: 'testing-web', store: 'list', op: 'clear', json: '' },
  ]);
});
