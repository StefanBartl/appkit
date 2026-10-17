import { describe, expect, it } from 'vitest';
import { placeTip, withToken, withoutToken } from './tooltip';

const view = { width: 1000, height: 600 };

describe('placeTip', () => {
  it('goes below the element', () => {
    expect(placeTip({ x: 100, y: 100, width: 50, height: 20 }, { width: 200, height: 40 }, view)).toEqual({
      x: 100,
      y: 126,
    });
  });
  it('goes above when there is no room below', () => {
    const at = placeTip({ x: 100, y: 570, width: 50, height: 20 }, { width: 200, height: 40 }, view);
    expect(at.y).toBe(570 - 6 - 40);
  });
  it('stays inside the window on the right and when it fits nowhere', () => {
    expect(placeTip({ x: 950, y: 100, width: 40, height: 20 }, { width: 300, height: 40 }, view).x).toBe(700);
    const tall = placeTip({ x: 10, y: 300, width: 10, height: 10 }, { width: 100, height: 900 }, view);
    expect(tall.y).toBe(0);
  });
});

describe('aria-describedby tokens', () => {
  it('adds the popup once and takes only it away', () => {
    expect(withToken(null, 'tip')).toBe('tip');
    expect(withToken('own', 'tip')).toBe('own tip');
    expect(withToken('own tip', 'tip')).toBe('own tip');
    expect(withoutToken('own tip', 'tip')).toBe('own');
    expect(withoutToken('tip', 'tip')).toBe('');
    expect(withoutToken(null, 'tip')).toBe('');
  });
});
