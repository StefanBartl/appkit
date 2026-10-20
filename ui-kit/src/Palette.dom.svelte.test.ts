// @vitest-environment jsdom
// The palette in a DOM: opening, the words, the arrow keys, Enter, a click, Escape.
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Palette from './Palette.svelte';
import { paletteItems, type PaletteAction, type PaletteItem } from './palette';

const labels = { title: 'Palette', label: 'Command', placeholder: 'Type', none: 'Nothing', action: 'Action', entry: 'Task' };
const NOW = Date.UTC(2026, 9, 13);

let ran: string[];
let chosen: PaletteItem[];
let closed: number;
let app: ReturnType<typeof mount> | undefined;
const props = $state({ open: false });

const actions: PaletteAction[] = ['one', 'two', 'three'].map((k) => ({ key: k, label: `Do ${k}`, run: () => void ran.push(k) }));
const entries = [{ id: 'a/b', title: 'Board undo' }];

// jsdom has a dialog but no modal: showModal() and close() only flip `open`.
beforeEach(() => {
  ran = [];
  chosen = [];
  closed = 0;
  document.body.innerHTML = '';
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  Element.prototype.scrollIntoView = () => {};
  props.open = false;
  app = mount(Palette, {
    target: document.body,
    props: {
      get open() {
        return props.open;
      },
      items: (q: string) => paletteItems(q, actions, entries, {}, NOW),
      onchoose: (item: PaletteItem) => void chosen.push(item),
      onclose: () => void closed++,
      labels,
    },
  });
  flushSync();
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  vi.restoreAllMocks();
});

const dialog = () => document.querySelector('dialog') as HTMLDialogElement;
const input = () => document.querySelector('input') as HTMLInputElement;
const options = () => [...document.querySelectorAll('[role=option]')];
const key = (k: string) => {
  input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  flushSync();
};
const type = async (text: string) => {
  input().value = text;
  input().dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
};
const open = async () => {
  props.open = true;
  flushSync();
  await tick();
};

describe('Palette', () => {
  it('stays shut and lists nothing until it is opened', () => {
    expect(dialog().open).toBe(false);
    expect(options()).toHaveLength(0);
  });

  it('opens with the actions listed and the first one chosen', async () => {
    await open();
    expect(dialog().open).toBe(true);
    expect(options().map((o) => o.querySelector('.label')?.textContent)).toEqual(['Do one', 'Do two', 'Do three']);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe('palette-option-0');
  });

  it('moves the choice with the arrow keys, stops at the ends, and Enter hands the choice to the page', async () => {
    await open();
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(options()[2]?.getAttribute('aria-selected')).toBe('true');
    key('ArrowUp');
    key('Enter');
    expect(chosen.map((c) => c.key)).toEqual(['action:two']);
    // The page runs the action; the component runs nothing itself.
    expect(ran).toEqual([]);
  });

  it('narrows the list with the words, labels the kind, and says so when nothing matches', async () => {
    await open();
    await type('board');
    expect(options()).toHaveLength(1);
    expect(options()[0]?.querySelector('.kind')?.textContent).toBe('Task');
    expect(options()[0]?.querySelector('.hint')?.textContent).toBe('a/b');
    await type('zzzz');
    expect(options()).toHaveLength(0);
    expect(document.querySelector('.none')?.textContent).toBe('Nothing');
    key('Enter');
    expect(chosen).toEqual([]);
  });

  it('ignores Enter and the arrows while an input method is composing', async () => {
    await open();
    for (const k of ['ArrowDown', 'Enter']) {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: k, isComposing: true, bubbles: true, cancelable: true }));
    }
    flushSync();
    expect(chosen).toEqual([]);
    expect(options()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('chooses by click', async () => {
    await open();
    (options()[1] as HTMLElement).click();
    expect(chosen.map((c) => c.key)).toEqual(['action:two']);
  });

  it('makes a hidden character in a text visible', async () => {
    document.body.innerHTML = '';
    if (app) await unmount(app);
    app = mount(Palette, {
      target: document.body,
      props: {
        open: true,
        items: () => paletteItems('', [{ key: 'x', label: `a${String.fromCharCode(0x202e)}b`, run: () => undefined }], [], {}, NOW),
        onchoose: () => undefined,
        onclose: () => undefined,
        labels,
      },
    });
    flushSync();
    await tick();
    expect(options()[0]?.querySelector('.label')?.textContent).toBe('a⟦U+202E⟧b');
  });

  it('tells the page when the dialog is cancelled, and not for a close that comes after it was shut and opened again', async () => {
    await open();
    dialog().dispatchEvent(new Event('cancel'));
    expect(closed).toBe(1);
    // A late `close` event of the dialog that was shut before: it is open again now, so it does not count.
    dialog().dispatchEvent(new Event('close'));
    expect(closed).toBe(1);
    dialog().removeAttribute('open');
    dialog().dispatchEvent(new Event('close'));
    expect(closed).toBe(2);
  });

  it('starts from an empty box and the first answer every time it opens', async () => {
    await open();
    await type('two');
    props.open = false;
    flushSync();
    await tick();
    expect(dialog().open).toBe(false);
    await open();
    expect(input().value).toBe('');
    expect(options()).toHaveLength(3);
  });
});
