// @vitest-environment jsdom
// The hint of a menu in the bar: shown on its trigger, and gone while the menu is open (the popup would lie over the
// first items of the menu).
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MenuBar from './MenuBar.svelte';
import type { Menu } from './menu';
import { installTooltips } from './tooltip';

const noop = () => {};
const menus: Menu[] = [
  { id: 'project', label: 'Project', hint: 'The project', items: [{ kind: 'action', label: 'New', onselect: noop }] },
  { id: 'view', label: 'View', items: [{ kind: 'action', label: 'Zoom', onselect: noop }] },
];

let app: ReturnType<typeof mount> | undefined;
let uninstall: (() => void) | undefined;
beforeEach(() => {
  document.body.innerHTML = '';
  app = mount(MenuBar, { target: document.body, props: { menus, label: 'Menu' } });
  flushSync();
  uninstall = installTooltips(document, window, { regionLabel: () => 'Hints' });
});
afterEach(async () => {
  uninstall?.();
  if (app) await unmount(app);
  app = undefined;
});

const trigger = (id: string) => document.querySelector<HTMLButtonElement>(`button.mb-trigger[data-for="${id}"]`)!;
const tip = () => document.getElementById('hint-tip')!;
const settle = async () => {
  await tick();
  await tick();
};

describe('the hint of a menu', () => {
  it('is on the trigger of the menu that has one, and on no other', () => {
    expect(trigger('project').getAttribute('data-hint')).toBe('The project');
    expect(trigger('view').hasAttribute('data-hint')).toBe(false);
  });

  it('shows on focus, and is gone from the trigger and from the screen while the menu is open', async () => {
    trigger('project').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tip().hidden).toBe(false);
    expect(tip().textContent).toBe('The project');
    trigger('project').click();
    await settle();
    expect(document.querySelector('[data-menu="project"]')).not.toBeNull();
    expect(trigger('project').hasAttribute('data-hint')).toBe(false);
    expect(tip().hidden).toBe(true);
  });

  it('is back on the trigger once the menu is closed', async () => {
    trigger('project').click();
    await settle();
    trigger('project').click();
    await settle();
    expect(document.querySelector('[data-menu="project"]')).toBeNull();
    expect(trigger('project').getAttribute('data-hint')).toBe('The project');
  });
});
