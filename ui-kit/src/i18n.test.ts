import { describe, expect, it } from 'vitest';
import { fill, pickLang } from './i18n';

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
