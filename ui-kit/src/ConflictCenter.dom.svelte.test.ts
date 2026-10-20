// @vitest-environment jsdom
// The conflict center in a DOM: the two ways of showing the list, the actions, Escape.
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConflictCenter from './ConflictCenter.svelte';
import type { ConflictItem, ConflictMode } from './conflicts';

const labels = {
  title: 'Conflicts',
  intro: 'Intro',
  field: 'Field',
  wanted: 'Wanted',
  now: 'Now',
  more: (n: number) => `${n} more`,
  discardAll: 'Let all go',
  close: 'Close',
  view: 'Show',
  viewList: 'All',
  viewSingle: 'One at a time',
};
const item = (key: string, extra: Partial<ConflictItem> = {}): ConflictItem => ({
  key,
  title: `Title ${key}`,
  id: `area/${key}`,
  notes: [],
  rows: [{ key: 'status', label: 'Status', wanted: 'doing', now: 'open' }],
  actions: [
    { name: 'retry', label: 'Try again', primary: true },
    { name: 'drop', label: 'Let go' },
  ],
  ...extra,
});

const state = $state({ open: true, mode: 'list' as ConflictMode, items: [item('a'), item('b'), item('c')] });
let acted: string[];
let modes: ConflictMode[];
let closed: number;
let cancelled: number;
let app: ReturnType<typeof mount> | undefined;

function build(extra: Record<string, unknown> = {}) {
  app = mount(ConflictCenter, {
    target: document.body,
    props: {
      get open() {
        return state.open;
      },
      get items() {
        return state.items;
      },
      get mode() {
        return state.mode;
      },
      onmode: (m: ConflictMode) => {
        modes.push(m);
        state.mode = m;
      },
      onaction: (key: string, action: string) => void acted.push(`${key}:${action}`),
      onclose: () => void closed++,
      labels,
      ...extra,
    },
  });
  flushSync();
}

beforeEach(() => {
  acted = [];
  modes = [];
  closed = 0;
  cancelled = 0;
  state.open = true;
  state.mode = 'list';
  state.items = [item('a'), item('b'), item('c')];
  document.body.innerHTML = '';
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
});

const lis = () => [...document.querySelectorAll('li')];
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

describe('ConflictCenter', () => {
  it('shows every conflict by default, with the count in the title', async () => {
    build();
    await tick();
    expect(lis()).toHaveLength(3);
    expect(document.querySelector('h2')?.textContent).toBe('Conflicts (3)');
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('shows the first one and the count of the rest in the single mode, and switches both ways', async () => {
    build();
    button('One at a time').click();
    flushSync();
    expect(modes).toEqual(['single']);
    expect(lis()).toHaveLength(1);
    expect(lis()[0]?.textContent).toContain('Title a');
    expect(document.querySelector('.more')?.textContent).toBe('2 more');
    button('All').click();
    flushSync();
    expect(lis()).toHaveLength(3);
    expect(document.querySelector('.more')).toBeNull();
  });

  it('marks the chosen way for assistive software', async () => {
    build();
    expect(button('All').getAttribute('aria-pressed')).toBe('true');
    expect(button('One at a time').getAttribute('aria-pressed')).toBe('false');
  });

  it('says no "more" for a single conflict', async () => {
    state.items = [item('a')];
    state.mode = 'single';
    build();
    expect(document.querySelector('.more')).toBeNull();
  });

  it('hands an action to the app with the key of its conflict, and runs nothing itself', async () => {
    build();
    const second = lis()[1] as HTMLElement;
    [...second.querySelectorAll('button')].find((b) => b.textContent === 'Try again')?.click();
    expect(acted).toEqual(['b:retry']);
  });

  it('draws only the actions the app gave, and a disabled one disabled', async () => {
    state.items = [item('a', { actions: [{ name: 'drop', label: 'Let go' }, { name: 'retry', label: 'Try again', disabled: true }] })];
    build();
    expect(button('Try again').disabled).toBe(true);
    expect(button('Let go').disabled).toBe(false);
  });

  it('leaves the table out when there is nothing to compare, and shows the notes', async () => {
    state.items = [item('a', { rows: [], notes: ['It is gone.'] })];
    build();
    expect(document.querySelector('table')).toBeNull();
    expect(document.querySelector('.note')?.textContent).toBe('It is gone.');
  });

  it('makes a hidden character in a title and a value visible', async () => {
    const evil = `a${String.fromCharCode(0x202e)}b`;
    state.items = [item('a', { title: evil, rows: [{ key: 'x', label: 'X', wanted: evil, now: 'y' }] })];
    build();
    expect(document.querySelector('.what')?.textContent).toBe('a⟦U+202E⟧b');
    expect(document.querySelector('td pre')?.textContent).toBe('a⟦U+202E⟧b');
  });

  it('has a button for letting all go only when the app can', async () => {
    build();
    expect(button('Let all go')).toBeUndefined();
    await unmount(app!);
    document.body.innerHTML = '';
    let all = 0;
    build({ ondiscardall: () => void all++ });
    button('Let all go').click();
    expect(all).toBe(1);
  });

  it('turns Escape into the cancel of the app, which closes by default', async () => {
    build();
    const e = new Event('cancel', { cancelable: true });
    document.querySelector('dialog')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(closed).toBe(1);
    await unmount(app!);
    document.body.innerHTML = '';
    build({ oncancel: () => void cancelled++ });
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(cancelled).toBe(1);
    expect(closed).toBe(1);
  });

  it('is shut while the app says so', async () => {
    state.open = false;
    build();
    await tick();
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });
});
