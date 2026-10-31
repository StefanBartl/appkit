// The cache of a page that works on any folder: one value per folder, read back and written only while the app releases
// it. A store in memory with one slot (what `indexedDbStore` of appkit-ui/cache keeps).
//
//   node --test test/folder-cache.test.mjs        (from web-kit/)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { folderCache, forgetFolderCache, noCache } from '../src/folder-cache.js';

function slot() {
  const state = { value: null, cleared: 0, saved: 0 };
  return {
    state,
    load: async () => structuredClone(state.value),
    save: async (value) => {
      state.saved += 1;
      state.value = structuredClone(value);
    },
    clear: async () => {
      state.cleared += 1;
      state.value = null;
    },
  };
}

/** A value of an app: rows, each of a group the app may or may not release. */
const value = (...groups) => ({ savedAt: 5, rows: groups.map((group, i) => ({ id: i, group })) });
const releasing = (...ok) => (v) => v.rows.every((row) => ok.includes(row.group));

test('a value is kept named by its folder and read back by that folder', async () => {
  const store = slot();
  const mine = folderCache(store, 'f1', releasing('a', 'b'));
  await mine.save(value('a', 'b'));
  assert.equal(store.state.value.folder, 'f1', 'the folder is part of what is kept');
  assert.deepEqual((await mine.load()).rows.map((r) => r.group), ['a', 'b']);
  assert.deepEqual(Object.keys(store.state.value).sort(), ['folder', 'rows', 'savedAt'], 'the value as it is, plus the folder');
});

test('the value of another folder is not shown, and it is left where it is', async () => {
  const store = slot();
  await folderCache(store, 'f1', releasing('a')).save(value('a'));
  assert.equal(await folderCache(store, 'f2', releasing('a')).load(), null);
  assert.equal(store.state.cleared, 0, "a miss, not a clear: the value is that folder's");
  // A value saved without a folder is nobody's.
  store.state.value = value('a');
  assert.equal(await folderCache(store, 'f1', releasing('a')).load(), null);
  assert.equal(await folderCache(slot(), 'f1', releasing('a')).load(), null, 'an empty store is a miss');
});

test('what the app does not release now is not given back, and goes', async () => {
  const store = slot();
  await folderCache(store, 'f1', releasing('a', 'b')).save(value('a', 'b'));
  // The rules changed since: `b` may not be kept any more.
  assert.equal(await folderCache(store, 'f1', releasing('a')).load(), null);
  assert.equal(store.state.cleared, 1);
  assert.equal(store.state.value, null, 'nothing of it stays in the browser');
});

test('what the app does not release is not written, and what is kept of older rules goes', async () => {
  const store = slot();
  let ok = ['a', 'b'];
  const cache = folderCache(store, 'f1', (v) => v.rows.every((row) => ok.includes(row.group)));
  await cache.save(value('a', 'b'));
  assert.equal(store.state.saved, 1);
  // The rules changed, and an answer to a question asked before still hands in `a` and `b`: the rule is asked again.
  ok = ['a'];
  await cache.save(value('a', 'b'));
  assert.equal(store.state.saved, 1, 'the late value is not written');
  assert.equal(store.state.value, null, 'and the value of the old rules does not stay');
  await cache.save(value('a'));
  assert.deepEqual(store.state.value.rows.map((r) => r.group), ['a']);
  await cache.clear();
  assert.equal(store.state.value, null, 'clear passes through');
});

test('a folder the browser could not remember keeps nothing', async () => {
  const store = slot();
  const cache = folderCache(store, null, () => true);
  assert.equal(cache, noCache);
  await cache.save(value('a'));
  assert.equal(store.state.saved, 0);
  store.state.value = { ...value('a'), folder: null };
  assert.equal(await cache.load(), null);
  await cache.clear();
  assert.equal(store.state.cleared, 0, 'and clears nothing of another');
});

test('forgetting a folder clears its value, and only its own', async () => {
  const store = slot();
  await folderCache(store, 'f1', () => true).save(value('a'));
  await forgetFolderCache(store, 'f2');
  assert.equal(store.state.cleared, 0, 'the value of another folder stays');
  await forgetFolderCache(store, 'f1');
  assert.equal(store.state.value, null);
  await forgetFolderCache(store, 'f1');
  assert.equal(store.state.cleared, 1, 'nothing kept, nothing to clear');
});
