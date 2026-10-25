import { describe, expect, it, vi } from 'vitest';
import { buildContextMenu, ContextRegistry, placeMenu, type ContextEntry, type ContextTarget } from './contextmenu';
import { toBlocks } from './menu';

const act = (label: string, id?: string): ContextEntry => ({ kind: 'action', label, onselect: () => {}, ...(id ? { id } : {}) });
const labels = (items: ReturnType<typeof buildContextMenu>) =>
  items.map((i) => (i.kind === 'separator' ? '-' : i.label));

describe('buildContextMenu', () => {
  const tile: ContextTarget = { kind: 'tile', id: 't1' };
  const view: ContextTarget = { kind: 'view', id: 'board' };
  const tab: ContextTarget = { kind: 'tab', id: 'tasks' };

  it('asks the providers of every target around the pointer, the innermost first, a separator between', () => {
    const r = new ContextRegistry();
    r.provide('tile', () => [act('Open tile')]);
    r.provide('view', () => [act('View thing')]);
    r.provide('tab', () => [act('Tab thing')]);
    expect(labels(buildContextMenu(r, [tile, view, tab]))).toEqual(['Open tile', '-', 'View thing', '-', 'Tab thing']);
  });

  it('gives the same kind of target another menu in another view', () => {
    const r = new ContextRegistry();
    r.provide('tile', () => [act('Open')]);
    r.provide('view', (t) => (t.id === 'board' ? [act('Move to stage')] : [act('Sort by priority')]));
    const a = labels(buildContextMenu(r, [tile, { kind: 'view', id: 'board' }]));
    const b = labels(buildContextMenu(r, [tile, { kind: 'view', id: 'list' }]));
    expect(a).toEqual(['Open', '-', 'Move to stage']);
    expect(b).toEqual(['Open', '-', 'Sort by priority']);
  });

  it('lets the innermost entry of an id win, and an inner provider hide an outer entry', () => {
    const r = new ContextRegistry();
    r.provide('tile', () => [act('Open here', 'open'), { kind: 'hide', id: 'reload' }, act('Own', 'own')]);
    r.provide('view', () => [act('Open', 'open'), act('Reload', 'reload'), act('Rest')]);
    expect(labels(buildContextMenu(r, [tile, view]))).toEqual(['Open here', 'Own', '-', 'Rest']);
  });

  it('does not hide an entry of its own group, and takes no group that is empty', () => {
    const r = new ContextRegistry();
    r.provide('tile', () => [act('A', 'a'), { kind: 'hide', id: 'a' }]);
    r.provide('view', () => undefined);
    r.provide('tab', () => []);
    expect(labels(buildContextMenu(r, [tile, view, tab]))).toEqual(['A']);
  });

  it('hands the whole selection on when the target is part of it, else the target alone', () => {
    const seen = vi.fn();
    const r = new ContextRegistry();
    r.provide('tile', (_t, env) => {
      seen(env.selection.map((s) => s.id));
      return [act('x')];
    });
    const other: ContextTarget = { kind: 'tile', id: 't2' };
    buildContextMenu(r, [tile], [tile, other]);
    buildContextMenu(r, [{ kind: 'tile', id: 't9' }], [tile, other]);
    expect(seen.mock.calls).toEqual([[['t1', 't2']], [['t9']]]);
  });

  it('is empty without a target, and a provider can be taken away again', () => {
    const r = new ContextRegistry();
    const off = r.provide('tile', () => [act('x')]);
    expect(buildContextMenu(r, [])).toEqual([]);
    off();
    expect(toBlocks(buildContextMenu(r, [tile]))).toEqual([]);
  });
});

describe('placeMenu', () => {
  const view = { width: 800, height: 600 };
  const size = { width: 200, height: 300 };
  it('opens at the point when it fits', () => {
    expect(placeMenu({ x: 100, y: 100 }, size, view)).toEqual({ x: 100, y: 100 });
  });
  it('turns left and up at the edges of the window', () => {
    expect(placeMenu({ x: 700, y: 500 }, size, view)).toEqual({ x: 500, y: 200 });
  });
  it('stays inside a window that is smaller than the menu', () => {
    expect(placeMenu({ x: 50, y: 50 }, { width: 200, height: 900 }, view)).toEqual({ x: 50, y: 4 });
  });
});
