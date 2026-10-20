// What every app has of a refused change: the list is kept in one place instead of one toast each, the newest first, a
// newer refusal of the same change replaces the older, and the person chooses how the list is shown (all at once, or
// one at a time). What a change is, and how it is tried again, is the app's own business.

/** The refusals that say "not now, or not like this": the file changed, is gone or is locked. */
export const CONFLICT_CODES: readonly string[] = ['conflict', 'not_found', 'locked', 'lock_stuck'];

/** Entries kept; the oldest go. */
export const CONFLICTS_MAX = 50;

/** How the conflict center shows the list: every conflict at once, or the first one with a count of the rest. */
export type ConflictMode = 'list' | 'single';

/** The mode when the person has not chosen. */
export const DEFAULT_CONFLICT_MODE: ConflictMode = 'list';

/** The stored text read back; anything but the two modes gives the default. */
export function parseConflictMode(text: string | null): ConflictMode {
  return text === 'single' || text === 'list' ? text : DEFAULT_CONFLICT_MODE;
}

/** `add` in front of `list`: a newer refusal of the same change replaces the older, the newest come first. */
export function mergeConflicts<T extends { key: string }>(list: readonly T[], add: readonly T[], max = CONFLICTS_MAX): T[] {
  if (add.length === 0) return [...list];
  const fresh = new Set(add.map((c) => c.key));
  return [...add, ...list.filter((c) => !fresh.has(c.key))].slice(0, max);
}

/** A value as the list shows it: a list joined, nothing as a dash. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) return value.length === 0 ? '-' : value.map(String).join(', ');
  return String(value);
}

/** One field of a change: what was wanted next to what is there now. */
export interface ConflictRow {
  key: string;
  label: string;
  wanted: string;
  now: string;
}

/** What the person can do about one conflict. The app names it and does it. */
export interface ConflictAction {
  name: string;
  label: string;
  /** The one that writes (drawn with the accent). */
  primary?: boolean;
  disabled?: boolean;
}

/** One conflict as the center shows it, worded by the app. */
export interface ConflictItem {
  key: string;
  /** What the change was about (the title). */
  title: string;
  /** The id, shown small under it; may be empty. */
  id: string;
  /** Lines of explanation (it is gone, it is locked, nothing is left to write). */
  notes: readonly string[];
  /** The fields; empty when there is nothing to compare. */
  rows: readonly ConflictRow[];
  actions: readonly ConflictAction[];
}
