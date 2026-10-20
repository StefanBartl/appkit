// What every app that keeps a copy in the browser shares: which class of data may be kept at all, and an IndexedDB
// store behind a small interface (so that tests need no browser). What is kept, and how a copy is cut so that nothing
// of an area that must not be kept survives through a reference, is the app's own business.

/** The classes of data of a hub: only `public` and `internal` may be written to the browser. */
export type DataClass = 'public' | 'internal' | 'private' | 'unclassified';

/** May data of this class be written to the cache? Fail closed: no class, or `unclassified`, is no. */
export function cacheableClass(dataClass: string | undefined): boolean {
  return dataClass === 'public' || dataClass === 'internal';
}

/** Where a copy is kept. */
export interface CacheStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
  clear(): Promise<void>;
}

export interface IndexedDbOptions<T> {
  /** The name of the database, and of the one store in it. */
  db: string;
  store: string;
  /** The key of the one value. */
  key: string;
  /** Whether what was read is what `save` wrote: anything else is a miss. */
  valid: (value: unknown) => value is T;
}

function open(factory: IDBFactory, name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** IndexedDB behind `CacheStore`. Every failure is a miss, never an error. */
export function indexedDbStore<T>(factory: IDBFactory | undefined, options: IndexedDbOptions<T>): CacheStore<T> {
  const { db: name, store, key, valid } = options;
  const run = async <R>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<R>): Promise<R | null> => {
    if (!factory) return null;
    try {
      const db = await open(factory, name, store);
      try {
        return await done(work(db.transaction(store, mode).objectStore(store)));
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  };
  return {
    async load() {
      const value = await run('readonly', (s) => s.get(key));
      return valid(value) ? value : null;
    },
    async save(value) {
      await run('readwrite', (s) => s.put(value, key));
    },
    async clear() {
      await run('readwrite', (s) => s.delete(key));
    },
  };
}
