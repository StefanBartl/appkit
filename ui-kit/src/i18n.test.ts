import { describe, expect, it } from 'vitest';
import { ago, fill, formatNumber, hintOf, kitTexts, labelOf, lookup, pickLang, type AgoKey } from './i18n';

describe('fill', () => {
  it('fills the holes it has values for and leaves the others', () => {
    expect(fill('{shown} of {total}', { shown: 2, total: 9 })).toBe('2 of 9');
    expect(fill('{shown} of {total}', { shown: 2 })).toBe('2 of {total}');
    expect(fill('no holes')).toBe('no holes');
  });
});

describe('pickLang', () => {
  it('takes the first language the app has, by its base tag, else the fallback', () => {
    expect(pickLang(['de-AT', 'en'], ['de', 'en'], 'en')).toBe('de');
    expect(pickLang(['fr', 'en-GB'], ['de', 'en'], 'en')).toBe('en');
    expect(pickLang(['fr'], ['de', 'en'], 'en')).toBe('en');
    expect(pickLang([], ['de', 'en'], 'de')).toBe('de');
  });
});

describe('lookup, labelOf and hintOf', () => {
  const dict = { 'status.doing': 'In progress', 'hint.status.doing': 'Somebody works on it.', 'n.items': '{n} items' };

  it('shows a key that is not there as itself, and fills holes', () => {
    expect(lookup(dict, 'n.items', { n: 3 })).toBe('3 items');
    expect(lookup(dict, 'missing.key')).toBe('missing.key');
    // A key of Object.prototype is no word.
    expect(lookup(dict, 'constructor')).toBe('constructor');
  });

  it('gives the word of a value, or the value itself when it is new, or ? when there is none', () => {
    expect(labelOf(dict, 'status', 'doing')).toBe('In progress');
    expect(labelOf(dict, 'status', 'frozen')).toBe('frozen');
    expect(labelOf(dict, 'status', undefined)).toBe('?');
  });

  it('gives the hint of a value, or nothing', () => {
    expect(hintOf(dict, 'hint.status', 'doing')).toBe('Somebody works on it.');
    expect(hintOf(dict, 'hint.status', 'frozen')).toBe('');
    expect(hintOf(dict, 'hint.status', undefined)).toBe('');
  });
});

describe('ago', () => {
  const text = (key: AgoKey, p: { n: number }) => `${key}:${p.n}`;
  it('picks the unit that fits, at the edges of 90 and 48', () => {
    expect(ago(text, 0)).toBe('kit.ago.seconds:0');
    expect(ago(text, -5000)).toBe('kit.ago.seconds:0');
    expect(ago(text, 89_000)).toBe('kit.ago.seconds:89');
    expect(ago(text, 90_000)).toBe('kit.ago.minutes:2');
    expect(ago(text, 89 * 60_000)).toBe('kit.ago.minutes:89');
    expect(ago(text, 90 * 60_000)).toBe('kit.ago.hours:2');
    expect(ago(text, 47 * 3_600_000)).toBe('kit.ago.hours:47');
    expect(ago(text, 48 * 3_600_000)).toBe('kit.ago.days:2');
  });
});

describe('formatNumber', () => {
  it('writes the number the way the language does, with two decimals at most', () => {
    expect(formatNumber('en', 1234.567)).toBe('1,234.57');
    expect(formatNumber('de', 1234.5)).toBe('1.234,5');
  });
});

describe('kitTexts', () => {
  it('has the same keys in both languages, all under the prefix kit., and every key of ago', () => {
    expect(Object.keys(kitTexts.de).sort()).toEqual(Object.keys(kitTexts.en).sort());
    for (const key of ['kit.ago.seconds', 'kit.ago.minutes', 'kit.ago.hours', 'kit.ago.days']) {
      expect(kitTexts.en).toHaveProperty(key);
    }
    for (const dict of [kitTexts.en, kitTexts.de]) {
      for (const key of Object.keys(dict)) expect(key.startsWith('kit.')).toBe(true);
    }
  });
});
