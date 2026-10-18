// Back and forward in the browser: each place the person reaches (a view, an open item) is an entry of the
// session history of the tab, and Back and Forward bring the app to the state that entry holds.
//
// The state lives in `history.state`, never in the address: the pairing code leaves the fragment at once
// (`pair.ts`), and the name of an item has no place in a URL that is copied, synced or logged. The URL is left as it
// is (`pushState` without one), so a pairing link pasted later still changes only the fragment.
//
// The kit knows no view and no item: the app says what its state is (`record`), checks what comes back from the
// history (`isState`) and puts the page into a state (`restore`).

export interface NavHistory {
  pushState(data: unknown, unused: string, url?: string | URL | null): void;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

export interface NavWindow {
  addEventListener(type: 'popstate', listener: (event: { state: unknown }) => void): void;
  removeEventListener(type: 'popstate', listener: (event: { state: unknown }) => void): void;
}

export interface NavOptions<S> {
  history: NavHistory;
  window: NavWindow;
  /** Is this what the app put into the history? An entry that is not (another page's, an old one) is left alone. */
  isState: (value: unknown) => value is S;
  /** Bring the page to this state. It must not call `record` for it: the entry exists already. */
  restore: (state: S) => void;
  /** Are two states the same place? Default: the same JSON. */
  same?: (a: S, b: S) => boolean;
}

export interface Nav<S> {
  /** The page is at this state now. The first call marks the entry the page started on; a changed state is a new entry. */
  record(state: S): void;
  /** Stop listening. */
  stop(): void;
}

/** What is stored: marked, so that an entry of something else is not taken for ours. */
interface Entry<S> {
  appkitNav: 1;
  state: S;
}

function entryOf<S>(value: unknown, isState: (v: unknown) => v is S): Entry<S> | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as { appkitNav?: unknown; state?: unknown };
  return entry.appkitNav === 1 && isState(entry.state) ? { appkitNav: 1, state: entry.state } : null;
}

export function installNav<S>(options: NavOptions<S>): Nav<S> {
  const same = options.same ?? ((a: S, b: S) => JSON.stringify(a) === JSON.stringify(b));
  let current: S | null = null;
  const onPop = (event: { state: unknown }): void => {
    const entry = entryOf(event.state, options.isState);
    if (entry === null) return;
    current = entry.state;
    options.restore(entry.state);
  };
  options.window.addEventListener('popstate', onPop);
  return {
    record(state) {
      if (current !== null && same(current, state)) return;
      const entry: Entry<S> = { appkitNav: 1, state };
      if (current === null) options.history.replaceState(entry, '');
      else options.history.pushState(entry, '');
      current = state;
    },
    stop() {
      options.window.removeEventListener('popstate', onPop);
    },
  };
}
