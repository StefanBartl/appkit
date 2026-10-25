// @vitest-environment jsdom
// The context menu in a real DOM: a right click on a target opens what its providers say, the keys walk and choose,
// Escape gives the focus back, the browser's menu is left alone without entries and in text fields.
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContextMenu from './ContextMenu.svelte';
import { contextTarget, ContextRegistry } from './contextmenu';

let app: ReturnType<typeof mount> | undefined;
let off: Array<() => void> = [];
const registry = new ContextRegistry();
const chosen = vi.fn();

beforeEach(() => {
  document.body.innerHTML = `
    <section id="view"><button id="card">Card</button><input id="field" /></section>
    <p id="plain">plain</p>`;
  const view = document.getElementById('view') as HTMLElement;
  const card = document.getElementById('card') as HTMLElement;
  contextTarget(view, { kind: 'view', id: 'board' });
  contextTarget(card, { kind: 'tile', id: 't1' });
  off = [
    registry.provide('tile', (t) => [
      { kind: 'action', label: 'Open', onselect: () => chosen('open', t.id) },
      { kind: 'action', label: 'Delete', disabled: true, onselect: () => chosen('delete') },
    ]),
    registry.provide('view', () => [{ kind: 'section', label: 'View' }, { kind: 'check', label: 'Compact', checked: true, onselect: () => chosen('compact') }]),
  ];
  app = mount(ContextMenu, { target: document.body, props: { registry, label: 'Context menu' } });
  flushSync();
  chosen.mockReset();
});
afterEach(async () => {
  for (const f of off) f();
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
});

const menu = () => document.querySelector('[role="menu"]');
const names = () => [...document.querySelectorAll('[role="menu"] .cm-item')].map((b) => b.textContent?.replace(/[●✓]/g, '').trim());
const rightClick = (el: Element) => {
  const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 30 });
  el.dispatchEvent(e);
  return e;
};
const key = (k: string, init: KeyboardEventInit = {}) =>
  document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
const settle = async () => {
  await tick();
  await tick();
  await tick();
};

describe('ContextMenu', () => {
  it('opens on a right click with the entries of the target and of the view around it, and takes over the click', async () => {
    const e = rightClick(document.getElementById('card')!);
    await settle();
    expect(e.defaultPrevented).toBe(true);
    expect(menu()?.getAttribute('aria-label')).toBe('Context menu');
    expect(names()).toEqual(['Open', 'Delete', 'Compact']);
    // The first entry has the focus; a disabled one is not reached by the keys.
    expect(document.activeElement?.textContent).toContain('Open');
  });

  it('leaves the browser menu alone where nobody offers anything, and in a text field', async () => {
    expect(rightClick(document.getElementById('plain')!).defaultPrevented).toBe(false);
    expect(rightClick(document.getElementById('field')!).defaultPrevented).toBe(false);
    await settle();
    expect(menu()).toBeNull();
  });

  it('walks with the arrow keys, wraps, and chooses with Enter (a click on the entry runs it and closes)', async () => {
    rightClick(document.getElementById('card')!);
    await settle();
    key('ArrowDown');
    expect(document.activeElement?.textContent).toContain('Compact');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toContain('Open');
    key('End');
    expect(document.activeElement?.textContent).toContain('Compact');
    (document.activeElement as HTMLButtonElement).click();
    await settle();
    expect(chosen).toHaveBeenCalledWith('compact');
    expect(menu()).toBeNull();
  });

  it('goes to the entry that a typed letter names', async () => {
    rightClick(document.getElementById('card')!);
    await settle();
    key('c');
    expect(document.activeElement?.textContent).toContain('Compact');
  });

  it('hands the target to the entry that was chosen', async () => {
    rightClick(document.getElementById('card')!);
    await settle();
    (document.querySelector('.cm-item') as HTMLButtonElement).click();
    expect(chosen).toHaveBeenCalledWith('open', 't1');
  });

  it('closes with Escape and gives the focus back to the target', async () => {
    const card = document.getElementById('card')!;
    rightClick(card);
    await settle();
    key('Escape');
    await settle();
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it('opens with the context key and with Shift+F10 on the focused target', async () => {
    const card = document.getElementById('card') as HTMLButtonElement;
    card.focus();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }));
    await settle();
    expect(names()).toEqual(['Open', 'Delete', 'Compact']);
    key('Escape');
    await settle();
    card.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(menu()).not.toBeNull();
  });

  it('an element without a target (a component that is one only sometimes) is none', async () => {
    const el = document.getElementById('plain') as HTMLElement;
    const action = contextTarget(el, undefined);
    expect(rightClick(el).defaultPrevented).toBe(false);
    action.update({ kind: 'tile', id: 'x' });
    expect(rightClick(el).defaultPrevented).toBe(true);
    await settle();
    action.update(undefined);
    expect(rightClick(el).defaultPrevented).toBe(false);
  });

  it('closes on a press beside it', async () => {
    rightClick(document.getElementById('card')!);
    await settle();
    document.getElementById('plain')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
    expect(menu()).toBeNull();
  });
});
