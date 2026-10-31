// A web variant has no server to tell the page that a file changed. The page looks itself: when the window gets the
// focus back and every 30 seconds it asks for the signature of the folder (what the app makes of sizes and times, no
// content) and, when it differs from the one it read, tells the app to read the folder again.

export const WATCH_MS = 30_000;

/** Start watching. `known` is the signature of the folder as it was read. */
export function watchFolder(known, deps) {
  let last = known;
  let looking = false;
  let stopped = false;

  async function check() {
    // One look at a time: a slow folder must not pile up looks, and a change must not be told twice.
    if (looking || stopped) return false;
    looking = true;
    try {
      const now = await deps.signature();
      if (stopped || now === last) return false;
      last = now;
      await deps.onChange();
      return true;
    } catch (error) {
      deps.onError?.(error);
      return false;
    } finally {
      looking = false;
    }
  }

  const timer = deps.setTimer(() => void check(), deps.intervalMs ?? WATCH_MS);
  const unfocus = deps.onFocus(() => void check());
  return {
    check,
    accept(signature) {
      last = signature;
    },
    stop() {
      stopped = true;
      deps.clearTimer(timer);
      unfocus();
    },
  };
}
