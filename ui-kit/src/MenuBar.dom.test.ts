// @vitest-environment jsdom
// The keys of the menu bar, in a DOM: the component is mounted and the keys are sent to it.
import { flushSync, mount, tick, unmount } from 'svelte';

// The focus goes to an item one tick after the menu is drawn (open() waits for it).
const settle = async (): Promise<void> => {
  await tick();
  await tick();
};
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MenuBar from './MenuBar.svelte';
import type { Menu } from './menu';

const picked: string[] = [];
const menus: Menu[] = [
  {
    id: 'project',
    label: 'Project',
    mnemonic: 'o',
    items: [
      { kind: 'action', label: 'New', onselect: () => picked.push('New'), shortcut: 'Ctrl+N' },
      { kind: 'section', label: 'Vault' },
      { kind: 'action', label: 'Open vault', onselect: () => picked.push('Open vault') },
      { kind: 'action', label: 'Off', onselect: () => {}, disabled: true },
      { kind: 'action', label: 'Options', onselect: () => picked.push('Options') },
    ],
  },
  { id: 'view', label: 'View', mnemonic: 'v', items: [{ kind: 'action', label: 'Zoom', onselect: () => {} }] },
];

let app: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  picked.length = 0;
  document.body.innerHTML = '';
  app = mount(MenuBar, { target: document.body, props: { menus, label: 'Menu' } });
  flushSync();
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  vi.restoreAllMocks();
});

const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const popup = (id: string) => document.querySelector(`[data-menu="${id}"]`);
const active = () => (document.activeElement as HTMLElement | null)?.textContent?.trim();
const trigger = (id: string) => document.querySelector<HTMLButtonElement>(`button.mb-trigger[data-for="${id}"]`)!;

describe('MenuBar keys', () => {
  it('opens the menu of an Alt+letter and puts the focus on its first item', async () => {
    const e = key(document.body, 'o', { altKey: true });
    await settle();
    expect(e.defaultPrevented).toBe(true);
    expect(popup('project')).not.toBeNull();
    expect(active()).toContain('New');
  });

  it('finds the mnemonic by the physical key where Alt+letter writes another character', async () => {
    key(document.body, 'å', { altKey: true, code: 'KeyV' });
    await settle();
    expect(popup('view')).not.toBeNull();
  });

  it('leaves Alt+letter alone with another modifier, when it was handled, and behind a modal dialog', async () => {
    key(document.body, 'o', { altKey: true, ctrlKey: true });
    key(document.body, 'o', { altKey: true, shiftKey: true });
    const handled = new KeyboardEvent('keydown', { key: 'o', altKey: true, bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    await settle();
    expect(popup('project')).toBeNull();
    const real = document.querySelector.bind(document);
    vi.spyOn(document, 'querySelector').mockImplementation((sel: string) =>
      sel === 'dialog:modal' ? document.createElement('dialog') : real(sel),
    );
    key(document.body, 'o', { altKey: true });
    await settle();
    expect(popup('project')).toBeNull();
  });

  it('goes to the item that starts with the typed letter, skips a disabled one, and wraps', async () => {
    key(document.body, 'o', { altKey: true });
    await settle();
    expect(active()).toContain('New');
    key(document.activeElement!, 'o');
    expect(active()).toContain('Open vault');
    key(document.activeElement!, 'o'); // "Off" is disabled: next is Options
    expect(active()).toContain('Options');
    key(document.activeElement!, 'o');
    expect(active()).toContain('Open vault');
  });

  it('walks the items with the arrows, over the end, and closes with Escape onto the trigger', async () => {
    key(document.body, 'o', { altKey: true });
    await settle();
    key(document.activeElement!, 'ArrowDown');
    expect(active()).toContain('Open vault');
    key(document.activeElement!, 'ArrowUp');
    key(document.activeElement!, 'ArrowUp');
    expect(active()).toContain('Options');
    const esc = key(document.activeElement!, 'Escape');
    await settle();
    expect(esc.defaultPrevented).toBe(true);
    expect(popup('project')).toBeNull();
    expect(document.activeElement).toBe(trigger('project'));
  });

  it('changes to the next menu with Right and chooses with Enter on a click', async () => {
    key(trigger('project'), 'ArrowDown');
    await settle();
    key(document.activeElement!, 'ArrowRight');
    await settle();
    expect(popup('project')).toBeNull();
    expect(active()).toContain('Zoom');
    key(document.activeElement!, 'ArrowLeft');
    await settle();
    (document.activeElement as HTMLElement).click();
    await settle();
    expect(picked).toEqual(['New']);
    expect(popup('project')).toBeNull();
  });
});

describe('MenuBar opens an item apart', () => {
  const opened: string[] = [];
  const apartMenus: Menu[] = [
    {
      id: 'view',
      label: 'View',
      items: [
        {
          kind: 'radio',
          label: 'Plan',
          checked: false,
          onselect: () => picked.push('Plan'),
          onopennew: () => opened.push('Plan'),
        },
        { kind: 'radio', label: 'Board', checked: true, onselect: () => picked.push('Board') },
        {
          kind: 'action',
          label: 'Off',
          disabled: true,
          onselect: () => picked.push('Off'),
          onopennew: () => opened.push('Off'),
        },
      ],
    },
  ];
  const item = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('button.mb-item')].find((b) => b.textContent?.includes(label))!;
  const mouse = (target: EventTarget, type: string, init: MouseEventInit): MouseEvent => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(e);
    return e;
  };

  beforeEach(async () => {
    opened.length = 0;
    if (app) await unmount(app);
    document.body.innerHTML = '';
    app = mount(MenuBar, { target: document.body, props: { menus: apartMenus, label: 'Menu', initialOpen: 'view' } });
    flushSync();
  });

  it('a middle click opens it apart and closes the menu; its press starts no autoscroll', async () => {
    expect(mouse(item('Plan'), 'mousedown', { button: 1 }).defaultPrevented).toBe(true);
    expect(mouse(item('Plan'), 'auxclick', { button: 1 }).defaultPrevented).toBe(true);
    await settle();
    expect(opened).toEqual(['Plan']);
    expect(picked).toEqual([]);
    expect(popup('view')).toBeNull();
  });

  it('Ctrl+click and Cmd+click open it apart, a plain click chooses it', async () => {
    mouse(item('Plan'), 'click', { button: 0, ctrlKey: true });
    await settle();
    await trigger('view').click();
    await settle();
    mouse(item('Plan'), 'click', { button: 0, metaKey: true });
    await settle();
    trigger('view').click();
    await settle();
    item('Plan').click();
    expect(opened).toEqual(['Plan', 'Plan']);
    expect(picked).toEqual(['Plan']);
  });

  it('Ctrl+Enter opens it apart from the keyboard', async () => {
    const e = key(item('Plan'), 'Enter', { ctrlKey: true });
    await settle();
    expect(e.defaultPrevented).toBe(true);
    expect(opened).toEqual(['Plan']);
    expect(picked).toEqual([]);
  });

  it('an item without the way apart, and a disabled one, do nothing on a middle click; Ctrl+click chooses it', async () => {
    expect(mouse(item('Board'), 'mousedown', { button: 1 }).defaultPrevented).toBe(false);
    mouse(item('Board'), 'auxclick', { button: 1 });
    mouse(item('Off'), 'auxclick', { button: 1 });
    await settle();
    expect(opened).toEqual([]);
    expect(picked).toEqual([]);
    expect(popup('view')).not.toBeNull();
    mouse(item('Board'), 'click', { button: 0, ctrlKey: true });
    expect(picked).toEqual(['Board']);
  });
});
