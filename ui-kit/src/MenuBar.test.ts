import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MenuBar from './MenuBar.svelte';
import source from './MenuBar.svelte?raw';
import type { Menu } from './menu';

const noop = () => {};
const menus: Menu[] = [
  {
    id: 'project',
    label: 'Project',
    mnemonic: 'o',
    items: [
      { kind: 'action', label: 'New', onselect: noop, shortcut: 'Ctrl+N' },
      { kind: 'section', label: 'Vault' },
      { kind: 'action', label: 'Open vault', onselect: noop },
      { kind: 'separator' },
      { kind: 'check', label: 'Watch', checked: true, onselect: noop },
    ],
  },
  { id: 'view', label: 'View', items: [{ kind: 'action', label: 'Zoom', onselect: noop }] },
];

// The hydration comments and the scoped class of the compiler are not what is tested.
const html = (props: Record<string, unknown> = {}) =>
  render(MenuBar, { props: { menus, label: 'Menu', ...props } })
    .body.replace(/<!--.*?-->/g, '')
    .replace(/ class="svelte-\w+"/g, '');

describe('MenuBar', () => {
  it('renders the bar closed, with the mnemonic underlined and announced', () => {
    const out = html();
    expect(out).toContain('Pr<u>o</u>ject');
    expect(out).toContain('aria-keyshortcuts="Alt+O"');
    expect(out).not.toContain('role="menu"');
  });
  it('renders sections as labelled groups with their heading, and the lines between', () => {
    const out = html({ initialOpen: 'project' });
    expect(out).toContain('role="menu"');
    expect(out).toMatch(/<div role="group" aria-labelledby="([\w-]+)"><p class="mb-section[^"]*" id="\1"[^>]*>Vault<\/p>/);
    expect(out.match(/<hr/g)).toHaveLength(2);
  });
  it('shows the shortcut on the right and names it for assistive technology', () => {
    const out = html({ initialOpen: 'project' });
    expect(out).toContain('aria-keyshortcuts="Control+N"');
    expect(out).toMatch(/<span class="mb-shortcut[^"]*"[^>]*>Ctrl\+N<\/span>/);
    // Only the item that has one shows it.
    expect(out.match(/class="mb-shortcut/g)).toHaveLength(1);
  });
  it('does not give a note the class of the info button (base.css draws that one as a pill)', () => {
    const out = html({
      initialOpen: 'p',
      menus: [{ id: 'p', label: 'P', items: [{ kind: 'info', label: 'Last opened' }] }],
    });
    expect(out).toMatch(/class="mb-note[ "]/);
    expect(out).not.toMatch(/class="info[ "]/);
  });
  it('names every class of its own with the prefix mb-, so that no CSS of an app or of base.css reaches it', () => {
    const classes = [...source.matchAll(/class="([^"{]+)"/g)].flatMap((m) => (m[1] ?? '').split(/\s+/));
    expect(classes.length).toBeGreaterThan(5);
    expect(classes.filter((c) => c !== '' && !c.startsWith('mb-'))).toEqual([]);
  });
  it('keeps a transparent outline on a focused item: in forced colours the fill is gone and only it is drawn', () => {
    const rule = /\}\s*\.mb-item:focus-visible\s*\{([^}]*)\}/.exec(source.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(rule?.[1]).toMatch(/outline:\s*2px solid transparent/);
  });
  it('opens no other menu than the one asked for', () => {
    const out = html({ initialOpen: 'view' });
    expect(out).toContain('Zoom');
    expect(out).not.toContain('Open vault');
  });
});
