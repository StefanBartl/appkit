import { describe, expect, it } from 'vitest';
import { installNav, type NavHistory, type NavWindow } from './nav';

interface S {
  view: string;
  id: string | null;
}
const isS = (v: unknown): v is S =>
  typeof v === 'object' && v !== null && typeof (v as S).view === 'string' && ((v as S).id === null || typeof (v as S).id === 'string');

function fixture() {
  const calls: Array<[string, unknown, unknown]> = [];
  let listener: ((e: { state: unknown }) => void) | null = null;
  const history: NavHistory = {
    pushState: (d, _u, url) => void calls.push(['push', d, url]),
    replaceState: (d, _u, url) => void calls.push(['replace', d, url]),
  };
  const win: NavWindow = {
    addEventListener: (_t, l) => void (listener = l),
    removeEventListener: () => void (listener = null),
  };
  const restored: S[] = [];
  const nav = installNav<S>({ history, window: win, isState: isS, restore: (s) => void restored.push(s) });
  return { calls, restored, nav, pop: (state: unknown) => listener?.({ state }), listening: () => listener !== null };
}

describe('installNav', () => {
  it('marks the first place as the entry the page started on and makes an entry for each new place', () => {
    const f = fixture();
    f.nav.record({ view: 'overview', id: null });
    f.nav.record({ view: 'rules', id: null });
    f.nav.record({ view: 'rules', id: 'AA-01' });
    expect(f.calls.map((c) => c[0])).toEqual(['replace', 'push', 'push']);
  });

  it('does not add an entry for the same place twice', () => {
    const f = fixture();
    f.nav.record({ view: 'rules', id: null });
    f.nav.record({ view: 'rules', id: null });
    expect(f.calls).toHaveLength(1);
  });

  it('never gives a URL: the address, and the fragment of a pairing link, stay as they are', () => {
    const f = fixture();
    f.nav.record({ view: 'rules', id: null });
    f.nav.record({ view: 'families', id: null });
    expect(f.calls.every((c) => c[2] === undefined)).toBe(true);
  });

  it('restores the state of the entry Back brings, and that is not a new entry', () => {
    const f = fixture();
    f.nav.record({ view: 'overview', id: null });
    f.nav.record({ view: 'rules', id: 'AA-01' });
    const before = f.calls.length;
    f.pop(f.calls[0]?.[1]);
    expect(f.restored).toEqual([{ view: 'overview', id: null }]);
    // The page reports the restored state back: it is the current place, so no entry is made.
    f.nav.record({ view: 'overview', id: null });
    expect(f.calls).toHaveLength(before);
    // Going on from there is a new entry again.
    f.nav.record({ view: 'families', id: null });
    expect(f.calls.at(-1)?.[0]).toBe('push');
  });

  it('leaves alone an entry it did not make or that holds something else', () => {
    const f = fixture();
    f.nav.record({ view: 'overview', id: null });
    for (const foreign of [null, undefined, 'x', {}, { appkitNav: 2, state: { view: 'a', id: null } }, { appkitNav: 1, state: { view: 3 } }]) {
      f.pop(foreign);
    }
    expect(f.restored).toEqual([]);
  });

  it('stops listening', () => {
    const f = fixture();
    expect(f.listening()).toBe(true);
    f.nav.stop();
    expect(f.listening()).toBe(false);
  });
});
