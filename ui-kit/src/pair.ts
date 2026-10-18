// The pairing code travels in the URL fragment: it never goes to a server
// or a referrer. It is taken out of the address bar at once (concept 5.6).

export interface LocationLike {
  hash: string;
  pathname: string;
  search: string;
}

export interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

const CODE = /^[0-9a-f]{32,128}$/;

/** A code that was handed to the page by the shell around it (a native window sets it before the page runs). */
function injectedCode(injected: unknown): string | null {
  return typeof injected === 'string' && CODE.test(injected) ? injected : null;
}

/**
 * The pairing code in the fragment, if there is one. Removes the fragment.
 *
 * `injected` is the code a native shell put into the page itself (the app reads the global it
 * names, e.g. from an initialization script, and passes it here): a window of the shell has no
 * address bar to carry a fragment. The fragment wins when both are there; the injected one is
 * checked like it.
 */
export function takePairingCode(
  location: LocationLike,
  history: HistoryLike,
  injected?: unknown,
): string | null {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (hash === '') return injectedCode(injected);
  let code: string | null = null;
  for (const part of hash.split('&')) {
    const [key, value] = part.split('=');
    if (key === 'pair' && value && CODE.test(value)) code = value;
  }
  // Whatever the fragment held, it is not left in the history.
  history.replaceState(null, '', location.pathname + location.search);
  return code ?? injectedCode(injected);
}
