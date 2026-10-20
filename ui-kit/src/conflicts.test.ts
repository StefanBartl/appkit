import { describe, expect, it } from 'vitest';
import { CONFLICTS_MAX, DEFAULT_CONFLICT_MODE, formatValue, mergeConflicts, parseConflictMode } from './conflicts';

const c = (key: string, at = 0) => ({ key, at });

describe('mergeConflicts', () => {
  it('puts the newest in front and replaces an older refusal of the same change', () => {
    const merged = mergeConflicts([c('a', 1), c('b', 1)], [c('b', 2), c('c', 2)]);
    expect(merged).toEqual([c('b', 2), c('c', 2), c('a', 1)]);
  });

  it('returns a copy when there is nothing to add', () => {
    const list = [c('a')];
    const same = mergeConflicts(list, []);
    expect(same).toEqual(list);
    expect(same).not.toBe(list);
  });

  it('drops the oldest past the limit', () => {
    const many = Array.from({ length: CONFLICTS_MAX }, (_, i) => c(`k${i}`));
    const merged = mergeConflicts(many, [c('new')]);
    expect(merged).toHaveLength(CONFLICTS_MAX);
    expect(merged[0]?.key).toBe('new');
    expect(merged.map((x) => x.key)).not.toContain(`k${CONFLICTS_MAX - 1}`);
    expect(mergeConflicts(many, [c('new')], 3)).toHaveLength(3);
  });
});

describe('formatValue', () => {
  it('joins a list and shows nothing as a dash', () => {
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue([])).toBe('-');
    expect(formatValue(null)).toBe('-');
    expect(formatValue(undefined)).toBe('-');
    expect(formatValue('')).toBe('-');
    expect(formatValue(0)).toBe('0');
    expect(formatValue(false)).toBe('false');
  });
});

describe('parseConflictMode', () => {
  it('reads back the two modes and gives the default for anything else', () => {
    expect(DEFAULT_CONFLICT_MODE).toBe('list');
    expect(parseConflictMode('single')).toBe('single');
    expect(parseConflictMode('list')).toBe('list');
    expect(parseConflictMode(null)).toBe('list');
    expect(parseConflictMode('grid')).toBe('list');
  });
});
