// How a web variant notices that the folder changed: the watcher that looks on focus and on a timer. A fake clock and a
// fake window, no browser.
//
//   node --test test/watch.test.mjs        (from web-kit/)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchFolder, WATCH_MS } from '../src/watch.js';

/** A clock and a window the test drives. */
function world(signatures, extra = {}) {
  const calls = { changed: 0, errors: [] };
  const timers = [];
  const focus = [];
  let i = 0;
  const watcher = watchFolder(signatures[0], {
    signature: async () => {
      const s = signatures[Math.min(++i, signatures.length - 1)];
      if (s instanceof Error) throw s;
      return s;
    },
    onChange: async () => void calls.changed++,
    onError: (e) => calls.errors.push(e.message),
    setTimer: (fn, ms) => (timers.push({ fn, ms, live: true }), timers.length - 1),
    clearTimer: (h) => void (timers[h].live = false),
    onFocus: (fn) => (focus.push(fn), () => focus.splice(focus.indexOf(fn), 1)),
    ...extra,
  });
  return { calls, timers, focus, watcher };
}

const settle = () => new Promise((r) => setImmediate(r));

test('a change is found on the timer and on focus, once, and nothing is told when nothing changed', async () => {
  const w = world(['s1', 's1', 's2', 's2', 's3']);
  assert.equal(w.timers[0].ms, WATCH_MS);
  assert.equal(WATCH_MS, 30_000);
  w.timers[0].fn(); // the timer looks: s1, the same as read
  await settle();
  assert.equal(w.calls.changed, 0, 'no change, nothing told');
  w.focus[0](); // the window gets the focus: s2, another
  await settle();
  assert.equal(w.calls.changed, 1);
  w.timers[0].fn(); // s2 again: the change was told once
  await settle();
  assert.equal(w.calls.changed, 1, 'the same signature again is no change');
  w.focus[0](); // s3
  await settle();
  assert.equal(w.calls.changed, 2);
});

test('the app may look at another pace', () => {
  assert.equal(world(['s'], { intervalMs: 5 }).timers[0].ms, 5);
});

test('looks do not pile up, a failed look is reported and the watcher goes on', async () => {
  let release;
  let looks = 0;
  const timers = [];
  const w = watchFolder('s0', {
    signature: () => (++looks, new Promise((r) => (release = () => r('s1')))),
    onChange: async () => {},
    setTimer: (fn) => (timers.push(fn), 0),
    clearTimer() {},
    onFocus: () => () => {},
  });
  const first = w.check();
  assert.equal(await w.check(), false, 'a second look while one is under way does nothing');
  assert.equal(looks, 1);
  release();
  assert.equal(await first, true);

  const failing = world(['s0', new Error('permission taken back'), 's1']);
  assert.equal(await failing.watcher.check(), false);
  assert.deepEqual(failing.calls.errors, ['permission taken back']);
  assert.equal(await failing.watcher.check(), true, 'the next look works');
});

test('after stop nothing is looked at; accept sets the state to compare against', async () => {
  const w = world(['s0', 's1', 's2']);
  w.watcher.accept('s1');
  assert.equal(await w.watcher.check(), false, 's1 is what was read now');
  w.watcher.stop();
  assert.equal(w.timers[0].live, false, 'the timer is gone');
  assert.equal(w.focus.length, 0, 'the focus listener is gone');
  assert.equal(await w.watcher.check(), false);
  assert.equal(w.calls.changed, 0);
});
