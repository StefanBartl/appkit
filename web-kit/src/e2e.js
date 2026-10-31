// What the browser tests (Playwright) of every web variant share: the watch on what the page must never do (a request,
// a violation of its policy) and the record of what it writes to IndexedDB.
//
// The Playwright page comes in by argument; nothing here imports Playwright. The functions given to `addInitScript`
// and `evaluate` run in the page, so they use nothing from this module.

/**
 * Watch `page` from now on: every request that leaves the page (the page itself at `pageUrl`, `blob:` and `data:` are
 * not the network), every error of the page, and every violation of its policy (read with `violations`). Call it before
 * the page is opened.
 */
export async function watchPage(page, { pageUrl }) {
  if (typeof pageUrl !== 'string' || pageUrl === '') throw new Error('watchPage: the address of the page is missing');
  const seen = { requests: [], violations: [], errors: [] };
  page.on('request', (request) => {
    const url = request.url();
    if (url === pageUrl || url.startsWith('blob:') || url.startsWith('data:')) return;
    seen.requests.push(`${request.method()} ${url}`);
  });
  page.on('pageerror', (error) => seen.errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return seen;
}

/** The violations of the page's policy since it was loaded (`watchPage` records them). */
export async function violations(page) {
  return page.evaluate(() => window.__violations);
}

/**
 * Record every write the page makes to IndexedDB (before the page's own scripts run). The state of the database at the
 * end shows only what is left; this shows what was ever tried, which is what "never reaches IndexedDB" is about, and in
 * which database (another app's database in the same file:// origin must stay untouched).
 */
export async function spyOnIndexedDb(page) {
  await page.addInitScript(() => {
    const writes = [];
    window.__idbWrites = writes;
    for (const op of ['put', 'add', 'clear', 'delete']) {
      const original = IDBObjectStore.prototype[op];
      IDBObjectStore.prototype[op] = function (...args) {
        let json = '';
        if (op === 'put' || op === 'add') {
          try {
            json = JSON.stringify(args[0]);
          } catch {
            json = '<not JSON>';
          }
        }
        writes.push({ db: this.transaction.db.name, store: this.name, op, json });
        return original.apply(this, args);
      };
    }
  });
}

/** The writes the spy saw, in order. */
export async function idbWrites(page) {
  return page.evaluate(() => window.__idbWrites);
}
