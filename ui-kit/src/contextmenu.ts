// The model of the context menu (right click, the context key, Shift+F10). The menu never belongs to the page, it
// belongs to the target under the pointer: an element declares what it is (`use:contextTarget`), the apps register
// providers per kind of target, and the menu is what the providers of every target around the pointer say, the
// innermost first. A tile therefore inherits the entries of its view and of its tab without knowing them.
//
// No DOM beyond the walk up from an element; the rendering and the keys are `ContextMenu.svelte`.

import type { MenuItem } from './menu';

/** What an element is, for the context menu: a `kind` the providers are registered for, and what it stands for. */
export interface ContextTarget {
  kind: string;
  /** The thing the element shows (a task id, a view name); how it is read is the provider's business. */
  id?: string;
  /** Anything else the providers need; the kit does not look at it. */
  data?: unknown;
}

/** An entry that can be named (`id`): the innermost entry of an id wins, and an inner provider can hide an outer one. */
export type ContextItem = MenuItem & { id?: string };

/** `hide` takes the entries with that id of the providers further out away. */
export type ContextEntry = ContextItem | { kind: 'hide'; id: string };

export interface ContextEnv {
  /** The targets the entries work on: the whole selection when the target is part of it, else just the target. */
  selection: readonly ContextTarget[];
  /** Every target around the pointer, the innermost first. */
  chain: readonly ContextTarget[];
}

/** Entries for one target; nothing (or undefined) when the provider has none for it. */
export type ContextProvider = (target: ContextTarget, env: ContextEnv) => readonly ContextEntry[] | undefined;

/** The providers of an app, by kind of target. */
export class ContextRegistry {
  #byKind = new Map<string, Set<ContextProvider>>();

  /** Register a provider for a kind of target; the returned function takes it away again. */
  provide(kind: string, provider: ContextProvider): () => void {
    let set = this.#byKind.get(kind);
    if (!set) {
      set = new Set();
      this.#byKind.set(kind, set);
    }
    set.add(provider);
    return () => {
      set.delete(provider);
    };
  }

  providers(kind: string): ContextProvider[] {
    return [...(this.#byKind.get(kind) ?? [])];
  }
}

const sameTarget = (a: ContextTarget, b: ContextTarget): boolean => a.kind === b.kind && a.id === b.id;

/**
 * The entries for a pointer on `chain` (innermost target first). Each target asks the providers of its kind; the
 * answers are groups, kept apart by a separator. An entry with an `id` that an inner group had already is dropped
 * (the innermost wins), and so is one that an inner group hid. Sections without entries and doubled separators are
 * `toBlocks`' to remove.
 */
export function buildContextMenu(
  registry: ContextRegistry,
  chain: readonly ContextTarget[],
  selection: readonly ContextTarget[] = [],
): MenuItem[] {
  const first = chain[0];
  if (!first) return [];
  const env: ContextEnv = {
    chain,
    selection: selection.some((s) => sameTarget(s, first)) ? selection : [first],
  };
  const seen = new Set<string>();
  const hidden = new Set<string>();
  const out: MenuItem[] = [];
  for (const target of chain) {
    const group: MenuItem[] = [];
    for (const provider of registry.providers(target.kind)) {
      const entries = provider(target, env) ?? [];
      // A hide of this very group is for the groups further out, not for its own entries.
      const hides: string[] = [];
      for (const entry of entries) {
        if (entry.kind === 'hide') {
          hides.push(entry.id);
          continue;
        }
        if (entry.id !== undefined) {
          if (seen.has(entry.id) || hidden.has(entry.id)) continue;
          seen.add(entry.id);
        }
        group.push(entry);
      }
      for (const id of hides) hidden.add(id);
    }
    if (group.length > 0) {
      if (out.length > 0) out.push({ kind: 'separator' });
      out.push(...group);
    }
  }
  return out;
}

const targets = new WeakMap<Element, ContextTarget>();

/**
 * `use:contextTarget={{ kind: 'task', id }}`: this element is a target for the context menu. Without a target (a
 * component that is a target only sometimes) the element is none.
 */
export function contextTarget(node: HTMLElement, target?: ContextTarget) {
  const set = (t: ContextTarget | undefined) => (t ? targets.set(node, t) : targets.delete(node));
  set(target);
  return {
    update(next?: ContextTarget) {
      set(next);
    },
    destroy() {
      targets.delete(node);
    },
  };
}

/** The targets around an element (itself first, then its ancestors) and the element of the innermost one. */
export function targetChain(from: Element | null): { chain: ContextTarget[]; element: HTMLElement | null } {
  const chain: ContextTarget[] = [];
  let element: HTMLElement | null = null;
  for (let el: Element | null = from; el; el = el.parentElement) {
    const target = targets.get(el);
    if (target) {
      chain.push(target);
      if (!element && el instanceof HTMLElement) element = el;
    }
  }
  return { chain, element };
}

/** A field the browser's own menu belongs to (cut, copy, paste): the kit leaves it alone. */
export function isEditable(el: Element | null): boolean {
  return el?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') != null;
}

/**
 * Where a menu of `size` goes when it opens at `at` in a window of `view`: at the point, moved left or up when it would
 * leave the window, and never above or left of the window itself.
 */
export function placeMenu(
  at: { x: number; y: number },
  size: { width: number; height: number },
  view: { width: number; height: number },
  margin = 4,
): { x: number; y: number } {
  const x = at.x + size.width + margin > view.width ? at.x - size.width : at.x;
  const y = at.y + size.height + margin > view.height ? at.y - size.height : at.y;
  return {
    x: Math.max(margin, Math.min(x, view.width - size.width - margin)),
    y: Math.max(margin, Math.min(y, view.height - size.height - margin)),
  };
}
