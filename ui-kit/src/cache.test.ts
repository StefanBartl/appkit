import { describe, expect, it } from 'vitest';
import { cacheableClass, indexedDbStore } from './cache';

describe('cacheableClass', () => {
  it('lets public and internal data be kept, and fails closed for everything else', () => {
    expect(cacheableClass('public')).toBe(true);
    expect(cacheableClass('internal')).toBe(true);
    for (const other of ['private', 'unclassified', '', 'PUBLIC', undefined]) expect(cacheableClass(other)).toBe(false);
  });
});

/** A factory that keeps what is put into it, with the few calls the store makes. */
function fakeFactory(fail = false): { factory: IDBFactory; data: Map<string, unknown>; closed: () => number } {
  const data = new Map<string, unknown>();
  let closed = 0;
  const request = <T>(run: () => T): IDBRequest<T> => {
    const r = {} as IDBRequest<T>;
    queueMicrotask(() => {
      if (fail) {
        Object.assign(r, { error: new Error('x') });
        r.onerror?.(new Event('error'));
      } else {
        Object.assign(r, { result: run() });
        r.onsuccess?.(new Event('success'));
      }
    });
    return r;
  };
  const factory = {
    open(): IDBOpenDBRequest {
      const r = {} as IDBOpenDBRequest;
      const db = {
        createObjectStore: () => undefined,
        close: () => void closed++,
        transaction: () => ({
          objectStore: () => ({
            get: (k: string) => request(() => data.get(k)),
            put: (v: unknown, k: string) => request(() => (data.set(k, v), k)),
            delete: (k: string) => request(() => (data.delete(k), undefined)),
          }),
        }),
      };
      queueMicrotask(() => {
        if (fail) {
          Object.assign(r, { error: new Error('no db') });
          r.onerror?.(new Event('error'));
          return;
        }
        Object.assign(r, { result: db });
        r.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent);
        r.onsuccess?.(new Event('success'));
      });
      return r;
    },
  } as unknown as IDBFactory;
  return { factory, data, closed: () => closed };
}

const options = {
  db: 'demo',
  store: 'list',
  key: 'current',
  valid: (v: unknown): v is { n: number } => typeof v === 'object' && v !== null && typeof (v as { n?: unknown }).n === 'number',
};

describe('indexedDbStore', () => {
  it('keeps one value under its key, reads it back, and clears it', async () => {
    const { factory, data, closed } = fakeFactory();
    const store = indexedDbStore(factory, options);
    expect(await store.load()).toBeNull();
    await store.save({ n: 3 });
    expect(data.get('current')).toEqual({ n: 3 });
    expect(await store.load()).toEqual({ n: 3 });
    await store.clear();
    expect(await store.load()).toBeNull();
    // Every use closes its database again.
    expect(closed()).toBe(5);
  });

  it('takes a value that is not what was saved for a miss', async () => {
    const { factory, data } = fakeFactory();
    data.set('current', { n: 'three' });
    expect(await indexedDbStore(factory, options).load()).toBeNull();
    data.set('current', 'text');
    expect(await indexedDbStore(factory, options).load()).toBeNull();
  });

  it('is a miss, never an error, without a browser store or when it fails', async () => {
    const none = indexedDbStore(undefined, options);
    expect(await none.load()).toBeNull();
    await expect(none.save({ n: 1 })).resolves.toBeUndefined();
    await expect(none.clear()).resolves.toBeUndefined();
    const broken = indexedDbStore(fakeFactory(true).factory, options);
    expect(await broken.load()).toBeNull();
    await expect(broken.save({ n: 1 })).resolves.toBeUndefined();
  });
});
