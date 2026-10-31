// The cache of a page that works on any folder: one value (a list, a snapshot) kept in the browser for one folder at a
// time, and given back only while the app still lets it be kept.
//
// The store is the app's (`indexedDbStore` of appkit-ui/cache, in a database of the app's own name: every local file
// shares the origin file://); this module never opens a database itself. It adds two rules to it:
//
// - The value is named by the folder it is of (the id the folders used before give it, `Recent.id`). Another folder's
//   value is not shown, not even for a moment, and not this folder's to clear; a folder the browser could not remember
//   has no name to keep a value under and keeps none.
// - `releases` is asked at every read and write: a value it does not release now (the data classes of the folder
//   changed since it was saved, or while a question was under way) is neither written nor given back, and what is
//   stored goes.

/** A cache that keeps nothing: for a folder the browser could not remember, which has no name to keep a value under. */
export const noCache = { load: async () => null, save: async () => {}, clear: async () => {} };

/** The cache of `store` for the folder `folder` (`null`: none), giving back only what `releases` lets be kept. */
export function folderCache(store, folder, releases) {
  if (folder === null) return noCache;
  return {
    async load() {
      const value = await store.load();
      if (!value) return null;
      // Another folder's value (or one saved before values were named by folder): not shown, and not this folder's to clear.
      if (value.folder !== folder) return null;
      // A value that holds what may not be kept now was saved under other rules: it goes.
      if (!releases(value)) {
        await store.clear();
        return null;
      }
      return value;
    },
    async save(value) {
      // The same rule on the way in as on the way out: a value built from an answer to a question asked before the
      // rules changed must not be written, and what is stored under it is of the same old rules, so it goes too.
      if (!releases(value)) {
        await store.clear();
        return;
      }
      await store.save({ ...value, folder });
    },
    clear: () => store.clear(),
  };
}

/**
 * Forget the value kept for one folder (the person forgot the folder): nothing of it stays in the browser. The value of
 * another folder is not this folder's to clear.
 */
export async function forgetFolderCache(store, folder) {
  const value = await store.load();
  if (value && value.folder === folder) await store.clear();
}
