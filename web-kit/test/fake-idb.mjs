// A small fake of IndexedDB for the tests: one factory is one origin, its databases are told apart by name, as in the
// browser. Only what `idbKeyValue` uses: open (with the upgrade on the first open), a transaction, get and put.
// (After the fake of tasks-desktop's web/entry.test.mjs, with the databases named.)

const later = (fn) => setTimeout(fn, 0);

/** The structured clone of the browser, for what the tests store: a folder handle is cloned as the same handle. */
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object' && value !== null) {
    if (value.kind === 'directory' && typeof value.queryPermission === 'function') return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)]));
  }
  if (typeof value === 'function') throw Object.assign(new Error('could not be cloned'), { name: 'DataCloneError' });
  return value;
}

/** `failOpen`: so many opens fail first; `abortWrites`: every put aborts its transaction (quota). */
export function fakeIdb({ failOpen = 0, abortWrites = false } = {}) {
  // name -> store name -> key -> value
  const databases = new Map();
  let opens = 0;
  return {
    opens: () => opens,
    /** The names of the databases of the origin, and what each one holds: what a test looks at. */
    dump: () => Object.fromEntries([...databases].map(([name, stores]) => [name, Object.fromEntries([...stores].map(([s, m]) => [s, Object.fromEntries(m)]))])),
    open(name) {
      opens++;
      const request = { result: null, error: null };
      later(() => {
        if (opens <= failOpen) {
          request.error = new Error('open failed');
          request.onerror?.();
          return;
        }
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const stores = databases.get(name);
        const db = {
          name,
          createObjectStore: (store) => stores.set(store, new Map()),
          transaction(store) {
            const tx = { error: null };
            const data = stores.get(store);
            if (!data) throw Object.assign(new Error(`no store ${store} in ${name}`), { name: 'NotFoundError' });
            return Object.assign(tx, {
              objectStore: () => ({
                put(value, key) {
                  const req = { result: key };
                  later(() => {
                    if (abortWrites) {
                      tx.error = new Error('quota');
                      tx.onabort?.();
                    } else {
                      data.set(key, clone(value));
                      tx.oncomplete?.();
                    }
                  });
                  return req;
                },
                get(key) {
                  const req = { result: undefined };
                  later(() => {
                    req.result = data.get(key);
                    tx.oncomplete?.();
                  });
                  return req;
                },
              }),
            });
          },
        };
        request.result = db;
        // The first open of a database: the upgrade comes before success.
        if (fresh) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}
