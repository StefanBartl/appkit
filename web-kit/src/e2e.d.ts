// The types of e2e.js. `PageLike` is the part of Playwright's `Page` the helpers use, so that the kit does not depend on
// Playwright: a `Page` is one.

export interface PageLike {
  on(event: 'request', listener: (request: { url(): string; method(): string }) => void): unknown;
  on(event: 'pageerror', listener: (error: Error) => void): unknown;
  on(event: 'console', listener: (message: { type(): string; text(): string }) => void): unknown;
  addInitScript(script: () => void): Promise<unknown>;
  evaluate<R>(fn: () => R): Promise<R>;
}

/** Everything the page did that it must not have: a request outside the page, a violation of its own policy. */
export interface Watch {
  requests: string[];
  violations: string[];
  errors: string[];
}

export function watchPage(page: PageLike, options: { pageUrl: string }): Promise<Watch>;
export function violations(page: PageLike): Promise<string[]>;

/** One write of the page to IndexedDB, as it was made: the database, the object store, what it did and the value. */
export interface IdbWrite {
  db: string;
  store: string;
  op: 'put' | 'add' | 'clear' | 'delete';
  json: string;
}

export function spyOnIndexedDb(page: PageLike): Promise<void>;
export function idbWrites(page: PageLike): Promise<IdbWrite[]>;
