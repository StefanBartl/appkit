import { describe, expect, it } from 'vitest';
import {
  FRECENCY_MAX,
  PALETTE_LIMIT,
  bumped,
  frecencyBonus,
  matchScore,
  paletteItems,
  parseFrecency,
  stepIndex,
  wordScore,
  type PaletteAction,
  type PaletteEntry,
  type PaletteOptions,
} from './palette';

const NOW = Date.UTC(2026, 9, 13);
const DAY = 24 * 60 * 60 * 1000;

const entry = (id: string, title: string): PaletteEntry => ({ id, title });
const action = (key: string, label: string, hint = ''): PaletteAction => ({ key, label, hint, run: () => undefined });
const keyOf = (id: string) => `task:${id}`;
// A page that remembers the entries it opened (tasks) and one that does not (rules).
const REMEMBERED: PaletteOptions = { entryPrefix: 'task:', recent: 5 };

describe('matching', () => {
  it('ranks the start of the text over the start of a word over the inside of a word over scattered letters', () => {
    const start = wordScore('board view', 'boa');
    const word = wordScore('go to board', 'boa');
    const inside = wordScore('keyboard', 'boa');
    const scattered = wordScore('b-o-x-a', 'boa');
    expect([start, word, inside, scattered].every((s) => s !== null)).toBe(true);
    expect(start as number).toBeGreaterThan(word as number);
    expect(word as number).toBeGreaterThan(inside as number);
    expect(inside as number).toBeGreaterThan(scattered as number);
  });

  it('takes the best place a word occurs at, not the first', () => {
    expect(wordScore('palette e2e 2', '2') as number).toBeGreaterThan(wordScore('palette e2e 1', '2') as number);
  });

  it('is no match when a letter is missing or out of order, and ignores the case', () => {
    expect(wordScore('board', 'bz')).toBeNull();
    expect(wordScore('board', 'ob')).toBeNull();
    expect(wordScore('Board', 'BOA')).not.toBeNull();
  });

  it('wants every word of the box somewhere in the text', () => {
    expect(matchScore('Mark all shown', 'mark shown')).not.toBeNull();
    expect(matchScore('Mark all shown', 'mark board')).toBeNull();
    expect(matchScore('anything', '   ')).toBe(0);
  });

  it('counts a letter after a non-ASCII letter as inside a word', () => {
    expect(wordScore('a xt', 'xt') as number).toBeGreaterThan(wordScore('äxt', 'xt') as number);
  });
});

describe('frecency', () => {
  it('weighs often and recent, and forgets with the days', () => {
    const fresh = frecencyBonus({ n: 3, last: NOW }, NOW);
    expect(fresh).toBeGreaterThan(frecencyBonus({ n: 1, last: NOW }, NOW));
    expect(frecencyBonus({ n: 3, last: NOW - 28 * DAY }, NOW)).toBeCloseTo(fresh / 4, 5);
    expect(frecencyBonus(undefined, NOW)).toBe(0);
    expect(frecencyBonus({ n: 1000, last: NOW }, NOW)).toBe(frecencyBonus({ n: 20, last: NOW }, NOW));
  });

  it('counts a choice and drops the weakest entries past the limit', () => {
    let f = bumped({}, 'action:a', NOW);
    f = bumped(f, 'action:a', NOW + 1);
    expect(f['action:a']).toEqual({ n: 2, last: NOW + 1 });
    let many = {};
    for (let i = 0; i < FRECENCY_MAX + 20; i++) many = bumped(many, `k${i}`, NOW + i * DAY);
    expect(Object.keys(many)).toHaveLength(FRECENCY_MAX);
    expect(many).not.toHaveProperty('k0');
    expect(many).toHaveProperty(`k${FRECENCY_MAX + 19}`);
  });

  it('reads back only what it wrote', () => {
    expect(parseFrecency(null)).toEqual({});
    expect(parseFrecency('not json')).toEqual({});
    expect(parseFrecency('[1]')).toEqual({});
    expect(parseFrecency('{"a":{"n":2,"last":5},"b":{"n":"x","last":1},"c":null,"d":{"n":0,"last":1}}')).toEqual({
      a: { n: 2, last: 5 },
    });
  });

  it('does not let a __proto__ key of the profile become the prototype of every entry', () => {
    const read = parseFrecency('{"__proto__":{"n":9,"last":1},"action:a":{"n":1,"last":5}}');
    expect(Object.keys(read)).toEqual(['action:a']);
    expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
    expect(read['action:other']).toBeUndefined();
  });

  it('keeps only the prefixes a page asks for, so an id it never remembers does not come back', () => {
    const text = JSON.stringify({ 'action:a': { n: 1, last: 5 }, 'rule:x': { n: 1, last: 5 } });
    expect(parseFrecency(text, ['action:'])).toEqual({ 'action:a': { n: 1, last: 5 } });
    expect(Object.keys(parseFrecency(text, ['action:', 'rule:']))).toHaveLength(2);
  });
});

describe('the list', () => {
  const actions = [
    action('go.today', 'Go to Today'),
    action('go.board', 'Go to Board'),
    action('rescan', 'Read the vault again'),
  ];
  const entries = [
    entry('lib.nvim/board-undo', 'Board: undo after a renumber'),
    entry('lib.nvim/other', 'Something else'),
    entry('docs/readme', 'Write the readme'),
  ];

  it('shows the actions and nothing else for an empty box, the ones chosen before first', () => {
    const items = paletteItems('', actions, entries, {}, NOW, REMEMBERED);
    expect(items.map((i) => i.key)).toEqual(['action:go.today', 'action:go.board', 'action:rescan']);
    const chosen = paletteItems('', actions, entries, { 'action:rescan': { n: 2, last: NOW } }, NOW, REMEMBERED);
    expect(chosen[0]?.key).toBe('action:rescan');
  });

  it('shows the entries chosen before for an empty box, a few at most', () => {
    const f = { [keyOf('docs/readme')]: { n: 1, last: NOW } };
    const items = paletteItems('', actions, entries, f, NOW, REMEMBERED);
    expect(items.filter((i) => i.kind === 'entry').map((i) => i.key)).toEqual([keyOf('docs/readme')]);
    const many = Array.from({ length: 12 }, (_, i) => entry(`a/t${i}`, `T ${i}`));
    const fr = Object.fromEntries(many.map((t) => [keyOf(t.id), { n: 1, last: NOW }]));
    expect(paletteItems('', [], many, fr, NOW, REMEMBERED).filter((i) => i.kind === 'entry')).toHaveLength(5);
  });

  it('keeps the entries chosen before in sight with an empty box, however many actions the page has', () => {
    const crowd = Array.from({ length: PALETTE_LIMIT + 5 }, (_, i) => action(`a${i}`, `Action ${i}`));
    const f = { [keyOf('docs/readme')]: { n: 1, last: NOW }, 'action:a3': { n: 2, last: NOW } };
    const items = paletteItems('', crowd, entries, f, NOW, REMEMBERED);
    expect(items).toHaveLength(PALETTE_LIMIT);
    expect(items[0]?.key).toBe('action:a3');
    expect(items.map((i) => i.key)).toContain(keyOf('docs/readme'));
  });

  it('shows no entry for an empty box on a page that remembers none, whatever the frecency holds', () => {
    const f = { 'entry:docs/readme': { n: 9, last: NOW }, [keyOf('docs/readme')]: { n: 9, last: NOW } };
    const items = paletteItems('', actions, entries, f, NOW);
    expect(items.every((i) => i.kind === 'action')).toBe(true);
    // And the words give an entry no head start either.
    const twins = [entry('a/x1', 'same title'), entry('a/x2', 'same title')];
    const boosted = { 'entry:a/x2': { n: 20, last: NOW } };
    expect(paletteItems('same', [], twins, boosted, NOW)[0]?.key).toBe('entry:a/x1');
  });

  it('matches the id and the title of an entry and the label of an action', () => {
    const items = paletteItems('board', actions, entries, {}, NOW, REMEMBERED);
    expect(items.map((i) => i.key).sort()).toEqual(['action:go.board', keyOf('lib.nvim/board-undo')].sort());
    expect(paletteItems('readme', actions, entries, {}, NOW, REMEMBERED).map((i) => i.key)).toEqual([keyOf('docs/readme')]);
  });

  it('finds an entry by words that are split between its id and its title', () => {
    const split = [entry('docs.nvim/fix-x', 'Write the changelog'), entry('lib.nvim/other', 'Something else')];
    expect(paletteItems('nvim changelog', [], split, {}, NOW, REMEMBERED).map((i) => i.key)).toEqual([keyOf('docs.nvim/fix-x')]);
    expect(paletteItems('nvim zzzz', [], split, {}, NOW, REMEMBERED)).toEqual([]);
  });

  it('puts the entries first when an entry matches better than any action', () => {
    const items = paletteItems('board-undo', actions, entries, {}, NOW, REMEMBERED);
    expect(items[0]?.kind).toBe('entry');
    expect(paletteItems('go to board', actions, entries, {}, NOW, REMEMBERED)[0]?.key).toBe('action:go.board');
  });

  it('lifts what was chosen before above an equal match, and keeps the limit', () => {
    const twins = [entry('a/x1', 'same title'), entry('a/x2', 'same title')];
    const f = { [keyOf('a/x2')]: { n: 2, last: NOW } };
    expect(paletteItems('same', [], twins, f, NOW, REMEMBERED)[0]?.key).toBe(keyOf('a/x2'));
    const many = Array.from({ length: 100 }, (_, i) => entry(`a/t${i}`, `match ${i}`));
    expect(paletteItems('match', [], many, {}, NOW)).toHaveLength(PALETTE_LIMIT);
    expect(paletteItems('match', [], many, {}, NOW, { limit: 7 })).toHaveLength(7);
  });

  it('gives nothing for words that match nothing', () => {
    expect(paletteItems('zzzz', actions, entries, {}, NOW)).toEqual([]);
  });
});

describe('stepIndex', () => {
  it('stops at the ends and copes with an empty list', () => {
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(5, 1, 0)).toBe(0);
  });
});
