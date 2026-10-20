// The command palette: one box, two kinds of answers - an action of the page and an entry of its data (a task, a
// rule). Words match loosely (the letters in order are enough). What the person chose before comes first (frecency).
// All of this is plain functions; what an action does and what an entry is are the page's own business.

/** One thing the palette can run. */
export interface PaletteAction {
  /** A stable name (the key of the frecency). */
  key: string;
  label: string;
  /** A second line (what it acts on), may be empty. */
  hint?: string;
  run: () => void | Promise<void>;
}

/** What the page offers to jump to: an id and a title. */
export interface PaletteEntry {
  id: string;
  title: string;
}

/** An answer in the list. */
export type PaletteItem =
  | { kind: 'action'; key: string; label: string; hint: string; action: PaletteAction; score: number }
  | { kind: 'entry'; key: string; label: string; hint: string; id: string; score: number };

/** What the person chose: how often, and when last (ms since the epoch). */
export type Frecency = Record<string, { n: number; last: number }>;

/** The prefix of the frecency key of an action. */
export const ACTION_PREFIX = 'action:';
/** Entries kept; the weakest are dropped past this. */
export const FRECENCY_MAX = 200;
/** Answers shown at most. */
export const PALETTE_LIMIT = 30;

const DAY = 24 * 60 * 60 * 1000;

/**
 * How well `text` matches one word: higher is better, `null` is no match. A start of the text beats a start of a
 * word, that beats a place inside a word, and the letters in order with gaps come last.
 */
export function wordScore(text: string, word: string): number | null {
  const t = text.toLowerCase();
  const w = word.toLowerCase();
  if (w === '') return 0;
  if (t.startsWith(w)) return 1000 - Math.min(t.length - w.length, 200);
  // The best place the word occurs at: the start of a word beats the inside of one, and earlier beats later.
  let best: number | null = null;
  for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
    // A letter or a digit before the place means it is inside a word.
    const startsWord = at === 0 || !/[\p{L}\p{N}]/u.test(t.charAt(at - 1));
    const score = (startsWord ? 700 : 500) - Math.min(at, 200);
    if (best === null || score > best) best = score;
  }
  if (best !== null) return best;
  // The letters of the word in order, anywhere: the fewer the gaps, the better.
  let from = 0;
  let gaps = 0;
  let last = -1;
  for (const ch of w) {
    const found = t.indexOf(ch, from);
    if (found < 0) return null;
    if (last >= 0) gaps += found - last - 1;
    last = found;
    from = found + ch.length;
  }
  return Math.max(1, 300 - gaps);
}

/** Every word of the box must match somewhere in `text`; the scores add up. */
export function matchScore(text: string, query: string): number | null {
  const words = query.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return 0;
  let total = 0;
  for (const word of words) {
    const score = wordScore(text, word);
    if (score === null) return null;
    total += score;
  }
  return total;
}

/** What the earlier choices add: more for often, less as the days go by (a half life of two weeks). */
export function frecencyBonus(entry: Frecency[string] | undefined, now: number): number {
  if (!entry) return 0;
  const days = Math.max(0, now - entry.last) / DAY;
  return Math.min(entry.n, 20) * 25 * 0.5 ** (days / 14);
}

/** `key` chosen once more; the weakest entries go when there are too many. */
export function bumped(frecency: Frecency, key: string, now: number): Frecency {
  const next: Frecency = { ...frecency, [key]: { n: (frecency[key]?.n ?? 0) + 1, last: now } };
  const keys = Object.keys(next);
  if (keys.length <= FRECENCY_MAX) return next;
  const weakest = keys
    .sort((a, b) => frecencyBonus(next[a], now) - frecencyBonus(next[b], now))
    .slice(0, keys.length - FRECENCY_MAX);
  for (const key of weakest) delete next[key];
  return next;
}

/**
 * The stored text read back. Anything that is not what `bumped` makes is left out; with `prefixes`, a key that
 * starts with none of them is left out too (a page that remembers no entry lists only `action:`).
 */
export function parseFrecency(text: string | null, prefixes?: readonly string[]): Frecency {
  if (!text) return {};
  try {
    const raw: unknown = JSON.parse(text);
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Frecency = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      // `__proto__` from JSON is an own key, and assigning it would make its value the prototype of the result.
      if (key === '__proto__') continue;
      if (prefixes && !prefixes.some((p) => key.startsWith(p))) continue;
      const entry = value as { n?: unknown; last?: unknown } | null;
      if (entry && typeof entry.n === 'number' && typeof entry.last === 'number' && entry.n > 0) {
        out[key] = { n: entry.n, last: entry.last };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** How a page wants its entries treated. */
export interface PaletteOptions {
  /**
   * The prefix of the frecency key of an entry (`task:`). Without it entries are not remembered: nothing of them is
   * kept in the browser, and an entry never comes first.
   */
  entryPrefix?: string;
  /** Remembered entries shown for an empty box (needs `entryPrefix`). */
  recent?: number;
  /** Answers shown at most. */
  limit?: number;
}

/**
 * The list for the words in the box. An empty box shows the actions (those chosen before first) and the entries
 * chosen before; words match the label of an action, and the id and title of an entry.
 */
export function paletteItems(
  query: string,
  actions: readonly PaletteAction[],
  entries: readonly PaletteEntry[],
  frecency: Frecency,
  now: number,
  options: PaletteOptions = {},
): PaletteItem[] {
  const limit = options.limit ?? PALETTE_LIMIT;
  const prefix = options.entryPrefix;
  const entryKey = (id: string): string => `${prefix ?? 'entry:'}${id}`;
  const actionItems: PaletteItem[] = [];
  actions.forEach((action, index) => {
    const match = matchScore(`${action.label} ${action.hint ?? ''}`, query);
    if (match === null) return;
    // The order the page gave them breaks a tie.
    const key = `${ACTION_PREFIX}${action.key}`;
    const score = match + frecencyBonus(frecency[key], now) - index * 0.01;
    actionItems.push({ kind: 'action', key, label: action.label, hint: action.hint ?? '', action, score });
  });
  actionItems.sort((a, b) => b.score - a.score);

  const words = query.trim();
  let entryItems: PaletteItem[] = [];
  for (const entry of entries) {
    const bonus = prefix === undefined ? 0 : frecencyBonus(frecency[entryKey(entry.id)], now);
    if (words === '') {
      // Only what was chosen before, and only a few.
      if (bonus > 0) {
        entryItems.push({ kind: 'entry', key: entryKey(entry.id), label: entry.title, hint: entry.id, id: entry.id, score: bonus });
      }
      continue;
    }
    // The words may be split between the id and the title ("lib board"): the two together count as a third text.
    const best = Math.max(
      matchScore(entry.id, words) ?? -1,
      matchScore(entry.title, words) ?? -1,
      matchScore(`${entry.id} ${entry.title}`, words) ?? -1,
    );
    if (best < 0) continue;
    entryItems.push({ kind: 'entry', key: entryKey(entry.id), label: entry.title, hint: entry.id, id: entry.id, score: best + bonus });
  }
  entryItems.sort((a, b) => b.score - a.score);

  if (words === '') {
    entryItems = entryItems.slice(0, options.recent ?? 0);
    // What was chosen before stays in sight however many actions the page has: the actions give way to the entries.
    const room = Math.max(0, limit - entryItems.length);
    return [...actionItems.slice(0, room), ...entryItems].slice(0, limit);
  }
  // Actions first when the words name one well, entries first when an entry matches better than any action does.
  const topAction = actionItems[0]?.score ?? -Infinity;
  const topEntry = entryItems[0]?.score ?? -Infinity;
  const merged = topEntry > topAction ? [...entryItems, ...actionItems] : [...actionItems, ...entryItems];
  return merged.slice(0, limit);
}

/** The index after a step in the list: it stops at the ends (an arrow key does not wrap away from the choice). */
export function stepIndex(current: number, delta: 1 | -1, length: number): number {
  if (length === 0) return 0;
  return Math.min(length - 1, Math.max(0, current + delta));
}
