import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hintAttributes,
  hintDelay,
  HIDE_DELAY_MS,
  installTooltips,
  MAX_DELAY_MS,
  placeTip,
  SHOW_DELAY_MS,
  tooltip,
  withToken,
  withoutToken,
} from './tooltip';

const view = { width: 1000, height: 600 };

/** A type test (the tests run without a DOM): the kit has no word of its own, so the app must name the region. */
export function needsALabel(doc: Document, win: Window & typeof globalThis): void {
  // @ts-expect-error the name of the region is the app's word; an install without one is a type error
  installTooltips(doc, win);
}

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

describe('hintDelay and hintAttributes', () => {
  it('takes a number of milliseconds, else the default, and caps it', () => {
    expect(hintDelay(undefined)).toBe(SHOW_DELAY_MS);
    expect(hintDelay('abc')).toBe(SHOW_DELAY_MS);
    expect(hintDelay('-5')).toBe(SHOW_DELAY_MS);
    expect(hintDelay('0')).toBe(0);
    expect(hintDelay('800')).toBe(800);
    expect(hintDelay('999999')).toBe(MAX_DELAY_MS);
  });
  it('writes the attributes of a text, a title and a pause, and none for an empty text', () => {
    expect(hintAttributes('Hi')).toEqual({ 'data-hint': 'Hi' });
    expect(hintAttributes({ text: 'Hi', title: 'T', delay: 120.7 })).toEqual({
      'data-hint': 'Hi',
      'data-hint-title': 'T',
      'data-hint-delay': '120',
    });
    expect(hintAttributes({ text: '', title: 'T' })).toEqual({});
    expect(hintAttributes({ text: 'Hi', delay: Number.NaN })).toEqual({ 'data-hint': 'Hi' });
  });
});

// A DOM in miniature (the tests run in node): just what the popup touches.
class FNode {
  parent: FNode | null = null;
  children: FNode[] = [];
  text = '';
  get parentElement(): FNode | null {
    return this.parent;
  }
  appendChild<T extends FNode>(c: T): T {
    c.parent?.removeChild(c);
    c.parent = this;
    this.children.push(c);
    return c;
  }
  removeChild(c: FNode): void {
    this.children = this.children.filter((x) => x !== c);
    c.parent = null;
  }
  remove(): void {
    this.parent?.removeChild(this);
  }
  replaceChildren(): void {
    for (const c of [...this.children]) this.removeChild(c);
  }
  contains(n: FNode): boolean {
    return n === this || this.children.some((c) => c.contains(n));
  }
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    this.replaceChildren();
    this.text = v;
  }
}
class FEl extends FNode {
  attrs = new Map<string, string>();
  hidden = false;
  className = '';
  id = '';
  style: Record<string, string> = {};
  rect = { x: 10, y: 10, width: 100, height: 20 };
  constructor(public tag: string) {
    super();
  }
  getAttribute(n: string): string | null {
    return this.attrs.get(n) ?? null;
  }
  setAttribute(n: string, v: string): void {
    this.attrs.set(n, v);
  }
  removeAttribute(n: string): void {
    this.attrs.delete(n);
  }
  hasAttribute(n: string): boolean {
    return this.attrs.has(n);
  }
  get dataset(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.attrs) {
      if (k.startsWith('data-')) out[k.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())] = v;
    }
    return out;
  }
  closest<T>(sel: string): T | null {
    for (let n: FNode | null = this; n; n = n.parent) {
      if (!(n instanceof FEl)) continue;
      if (sel === '[data-hint]' ? n.hasAttribute('data-hint') : n.tag === sel) return n as unknown as T;
    }
    return null;
  }
  getBoundingClientRect() {
    return this.rect;
  }
}
type Handler = (e: Record<string, unknown>) => void;
function fakePage() {
  const listeners = new Map<string, Handler[]>();
  const body = new FEl('body');
  const doc = {
    body,
    createElement: (tag: string) => new FEl(tag),
    createTextNode: (t: string) => Object.assign(new FNode(), { text: t }),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: Handler) =>
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((f) => f !== fn),
      ),
  };
  const win = {
    Element: FEl,
    Node: FNode,
    innerWidth: 1000,
    innerHeight: 600,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: number | undefined) => clearTimeout(id),
  };
  function fire(type: string, target: FNode, extra: Record<string, unknown> = {}) {
    const e = { target, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra };
    for (const fn of listeners.get(type) ?? []) fn(e);
    return e;
  }
  const button = (hint: Record<string, string>) => {
    const b = new FEl('button');
    for (const [k, v] of Object.entries(hint)) b.setAttribute(k, v);
    body.appendChild(b);
    return b;
  };
  const off = installTooltips(doc as unknown as Document, win as unknown as Window & typeof globalThis, {
    regionLabel: () => 'Explanation',
  });
  const host = body.children.find((c) => c instanceof FEl && c.className === 'hint-host') as FEl;
  const tip = host.children[0] as FEl;
  return { fire, button, host, tip, off };
}

describe('the popup in a page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows on hover after the pause, describes the element, and goes when the pointer leaves', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': 'Saves the file' });
    p.fire('mouseover', b);
    vi.advanceTimersByTime(SHOW_DELAY_MS - 1);
    expect(p.host.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(p.host.hidden).toBe(false);
    expect(p.tip.textContent).toBe('Saves the file');
    expect(p.host.getAttribute('aria-label')).toBe('Explanation');
    expect(b.getAttribute('aria-describedby')).toBe('hint-tip');
    p.fire('mouseout', b);
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    expect(p.host.hidden).toBe(true);
    expect(b.hasAttribute('aria-describedby')).toBe(false);
  });

  it('takes the pause of the element when it has one', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': 'Slow', 'data-hint-delay': '1000' });
    p.fire('mouseover', b);
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(p.host.hidden).toBe(true);
    vi.advanceTimersByTime(1000 - SHOW_DELAY_MS);
    expect(p.host.hidden).toBe(false);
  });

  it('shows at once on keyboard focus and goes when the focus leaves', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': 'By keyboard' });
    p.fire('focusin', b);
    expect(p.host.hidden).toBe(false);
    expect(p.tip.textContent).toBe('By keyboard');
    p.fire('focusout', b);
    expect(p.host.hidden).toBe(true);
  });

  it('goes with Escape (and only then takes the key), and leaves Escape alone when it is not open', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': 'Esc me' });
    const idle = p.fire('keydown', b, { key: 'Escape' });
    expect(idle.preventDefault).not.toHaveBeenCalled();
    p.fire('focusin', b);
    const e = p.fire('keydown', b, { key: 'Escape' });
    expect(p.host.hidden).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('shows a title above the text, both as text and never as markup', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': '<b>text</b>', 'data-hint-title': '<i>Title</i>' });
    p.fire('focusin', b);
    const [heading, body] = p.tip.children as [FEl, FNode];
    expect(heading.tag).toBe('strong');
    expect(heading.className).toBe('hint-title');
    expect(heading.textContent).toBe('<i>Title</i>');
    expect(body.textContent).toBe('<b>text</b>');
    expect(p.tip.children).toHaveLength(2);
  });

  it('has no title element without a title, and no leftover of the one before', () => {
    const p = fakePage();
    const a = p.button({ 'data-hint': 'A', 'data-hint-title': 'Head' });
    const b = p.button({ 'data-hint': 'B' });
    p.fire('focusin', a);
    p.fire('focusin', b);
    expect(p.tip.children).toHaveLength(1);
    expect(p.tip.textContent).toBe('B');
  });

  it('shows at once on a tap, but not on a click of the mouse', () => {
    const p = fakePage();
    const b = p.button({ 'data-hint': 'Tapped' });
    p.fire('click', b, { pointerType: 'mouse' });
    expect(p.host.hidden).toBe(true);
    p.fire('click', b, { pointerType: 'touch' });
    expect(p.host.hidden).toBe(false);
    expect(p.tip.textContent).toBe('Tapped');
    // A tap elsewhere takes it away.
    p.fire('click', p.button({}), { pointerType: 'touch' });
    expect(p.host.hidden).toBe(true);
  });

  it('goes with the element when the action is destroyed, and follows a change of the text', () => {
    const p = fakePage();
    const b = p.button({});
    const act = tooltip(b as unknown as HTMLElement, 'First');
    p.fire('focusin', b);
    expect(p.tip.textContent).toBe('First');
    act.update('Second');
    expect(p.tip.textContent).toBe('Second');
    act.update('');
    expect(p.host.hidden).toBe(true);
    act.update('Third');
    p.fire('focusin', b);
    expect(p.host.hidden).toBe(false);
    act.destroy();
    expect(p.host.hidden).toBe(true);
  });

  it('is taken away by the function it returned', () => {
    const p = fakePage();
    p.off();
    expect(p.host.parent).toBeNull();
  });
});

describe('the tooltip action', () => {
  it('sets, updates and removes the attributes the popup reads', () => {
    const el = new FEl('button');
    const act = tooltip(el as unknown as HTMLElement, { text: 'One', title: 'T', delay: 50 });
    expect(el.dataset).toEqual({ hint: 'One', hintTitle: 'T', hintDelay: '50' });
    act.update('Two');
    expect(el.dataset).toEqual({ hint: 'Two' });
    act.destroy();
    expect(el.dataset).toEqual({});
  });
});
