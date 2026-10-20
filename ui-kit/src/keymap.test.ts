import { describe, expect, it } from 'vitest';
import { defaultKeymap, matches, resolveKey, withChord, type ChordState, type KeyPress } from './keymap';

const map = withChord(defaultKeymap, { h: 'overview', f: 'families', l: 'rules', w: 'waivers' });

function press(key: string, extra: Partial<KeyPress> = {}): KeyPress {
  return { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, typing: false, ...extra };
}

/** Feed keys at the given times; the commands that came out. */
function run(keys: [string, number, Partial<KeyPress>?][], shortcuts = true, m = map): (string | null)[] {
  let chord: ChordState = null;
  return keys.map(([key, at, extra]) => {
    const result = resolveKey(m, press(key, extra), chord, at, shortcuts);
    chord = result.chord;
    const c = result.command;
    return c === null ? null : c.arg === undefined ? c.name : `${c.name}:${c.arg}`;
  });
}

describe('the keys of the page', () => {
  it('go to a view with g and a letter the app named', () => {
    expect(run([['g', 0], ['h', 10], ['g', 20], ['f', 30], ['g', 40], ['l', 50]])).toEqual([
      null, 'go:overview', null, 'go:families', null, 'go:rules',
    ]);
  });

  it('knows no target of a chord until the app names them', () => {
    expect(defaultKeymap.chord.targets).toEqual({});
    expect(run([['g', 0], ['h', 10]], true, defaultKeymap)).toEqual([null, null]);
  });

  it('forgets a g that nothing follows in time', () => {
    const t = map.chord.timeoutMs;
    expect(run([['g', 0], ['h', t]])).toEqual([null, null]);
    expect(run([['g', 0], ['h', t - 1]])).toEqual([null, 'go:overview']);
  });

  it('takes another key after g as itself, and waits through a modifier', () => {
    expect(run([['g', 0], ['j', 1]])).toEqual([null, 'next']);
    expect(run([['g', 0], ['Shift', 1], ['l', 2]])).toEqual([null, null, 'go:rules']);
    expect(run([['h', 0], ['l', 1]])).toEqual([null, null]);
  });

  it('moves, opens, searches and closes', () => {
    expect(run([['j', 0], ['k', 1], ['Enter', 2], ['/', 3], ['Escape', 4]])).toEqual(['next', 'previous', 'open', 'search', 'escape']);
    // `/` is Shift and 7 on a German keyboard; CapsLock makes `J` without Shift.
    expect(run([['/', 0, { shiftKey: true }], ['J', 1]])).toEqual(['search', 'next']);
    expect(run([['J', 0, { shiftKey: true }]])).toEqual([null]);
  });

  it('opens the palette with Ctrl or Cmd and K, also in a field and with the single keys off', () => {
    expect(run([['k', 0, { ctrlKey: true }], ['K', 1, { metaKey: true, typing: true }]], false)).toEqual(['palette', 'palette']);
    expect(run([['k', 0, { ctrlKey: true, altKey: true }]])).toEqual([null]);
    // CapsLock or a shifted layout gives K with Shift: still the palette.
    expect(run([['K', 0, { ctrlKey: true, shiftKey: true }]])).toEqual(['palette']);
  });

  it('leaves a field and a modified key alone', () => {
    expect(run([['j', 0, { typing: true }], ['Enter', 1, { typing: true }], ['Escape', 2, { typing: true }]])).toEqual([null, null, null]);
    expect(run([['j', 0, { ctrlKey: true }], ['g', 1, { altKey: true }], ['h', 2]])).toEqual([null, null, null]);
  });

  it('with the single keys off takes no letter and no slash, but Enter and Escape', () => {
    expect(run([['g', 0], ['h', 1], ['j', 2], ['/', 3], ['Enter', 4], ['Escape', 5]], false)).toEqual([null, null, null, null, 'open', 'escape']);
  });

  it('takes a key and a prefix from the map, not from the code', () => {
    const other = { ...map, palette: 'Ctrl+P', chord: { ...map.chord, prefix: 'x' }, keys: { ...map.keys, n: 'next' } };
    expect(run([['p', 0, { ctrlKey: true }], ['k', 1, { ctrlKey: true }]], true, other)).toEqual(['palette', null]);
    expect(run([['x', 0], ['h', 1], ['g', 2], ['h', 3]], true, other)).toEqual([null, 'go:overview', null, null]);
    expect(run([['n', 0], ['j', 1]], true, other)).toEqual(['next', 'next']);
  });
});

describe('matches', () => {
  it('reads Mod as Ctrl or Cmd, and wants the others exactly', () => {
    expect(matches('Mod+K', press('k', { ctrlKey: true }))).toBe(true);
    expect(matches('Mod+K', press('k', { metaKey: true }))).toBe(true);
    expect(matches('Mod+K', press('k'))).toBe(false);
    expect(matches('Mod+K', press('l', { ctrlKey: true }))).toBe(false);
    expect(matches('Ctrl+K', press('k', { metaKey: true }))).toBe(false);
    expect(matches('Ctrl+Shift+P', press('p', { ctrlKey: true }))).toBe(false);
    expect(matches('Ctrl+Shift+P', press('P', { ctrlKey: true, shiftKey: true }))).toBe(true);
  });
});

describe('withChord', () => {
  it('adds targets without touching the map it started from', () => {
    expect(map.chord.targets).toEqual({ h: 'overview', f: 'families', l: 'rules', w: 'waivers' });
    expect(defaultKeymap.chord.targets).toEqual({});
    expect(withChord(map, { s: 'sources' }).chord.targets).toHaveProperty('h', 'overview');
  });
});
