<script lang="ts" module>
  export type { Menu, MenuItem } from './menu';
</script>

<script lang="ts">
  // The menu bar of an application: a row of menus, each a button that opens a list. The list falls into sections
  // (a heading and a line), an item may show its shortcut on the right. Keys: Enter, Space or Down open a menu;
  // Up and Down walk the items; a letter goes to the next item that starts with it; Left and Right go to the next
  // menu; Escape closes; Alt+letter opens the menu whose `mnemonic` that is. The shortcut is only shown: the app
  // binds the key itself.

  import { tick, untrack } from 'svelte';
  import {
    ariaShortcut,
    letterOfCode,
    menuForMnemonic,
    splitMnemonic,
    toBlocks,
    TYPE_AHEAD_MS,
    typeAheadIndex,
    type Menu,
    type MenuItem,
  } from './menu';

  let {
    menus,
    label,
    initialOpen = null,
  }: {
    menus: readonly Menu[];
    label: string;
    /** The id of a menu that is open from the start (a page that renders the list at once, a test). */
    initialOpen?: string | null;
  } = $props();

  // Stable between the server and the client (Math.random would differ on hydration).
  const uid = $props.id();
  let openId = $state<string | null>(untrack(() => initialOpen));
  let typed = '';
  let typedTimer: ReturnType<typeof setTimeout> | undefined;
  // One tab stop for the whole bar (the ARIA menubar pattern): the trigger that was used last takes it, the others
  // are reached with Left and Right, Home and End.
  let stop = $state<string | null>(null);
  const stopId = $derived(stop !== null && menus.some((m) => m.id === stop) ? stop : (menus[0]?.id ?? null));
  let root: HTMLElement | undefined = $state();

  const roleOf = (item: MenuItem): string =>
    item.kind === 'radio' ? 'menuitemradio' : item.kind === 'check' ? 'menuitemcheckbox' : 'menuitem';

  function triggers(): HTMLButtonElement[] {
    return root ? [...root.querySelectorAll<HTMLButtonElement>('button.trigger')] : [];
  }

  function itemButtons(id: string): HTMLButtonElement[] {
    return root
      ? [...root.querySelectorAll<HTMLButtonElement>(`[data-menu="${id}"] button.item:not(:disabled)`)]
      : [];
  }

  async function open(id: string, focusItem: 'first' | 'last' | null): Promise<void> {
    openId = id;
    if (focusItem === null) return;
    await tick();
    const items = itemButtons(id);
    (focusItem === 'first' ? items[0] : items[items.length - 1])?.focus();
  }

  function close(focusTrigger: boolean): void {
    const was = openId;
    openId = null;
    if (focusTrigger && was) triggers().find((t) => t.dataset.for === was)?.focus();
  }

  function pick(item: MenuItem): void {
    if (item.kind === 'separator' || item.kind === 'info' || item.kind === 'section') return;
    if ((item.kind === 'action' || item.kind === 'radio') && item.disabled) return;
    close(true);
    item.onselect();
  }

  function onTriggerKey(event: KeyboardEvent, id: string): void {
    const list = triggers();
    const at = list.findIndex((t) => t.dataset.for === id);
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        void open(id, 'first');
        break;
      case 'ArrowUp':
        event.preventDefault();
        void open(id, 'last');
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = list[(at + step + list.length) % list.length];
        next?.focus();
        if (openId !== null && next?.dataset.for) void open(next.dataset.for, null);
        break;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        const edge = list[event.key === 'Home' ? 0 : list.length - 1];
        edge?.focus();
        if (openId !== null && edge?.dataset.for) void open(edge.dataset.for, null);
        break;
      }
      case 'Escape':
        if (openId !== null) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
        break;
    }
  }

  function onItemKey(event: KeyboardEvent, id: string): void {
    const items = itemButtons(id);
    const at = items.indexOf(event.currentTarget as HTMLButtonElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focus(at + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focus(at - 1);
        break;
      case 'Home':
        event.preventDefault();
        focus(0);
        break;
      case 'End':
        event.preventDefault();
        focus(items.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault();
        const list = triggers();
        const here = list.findIndex((t) => t.dataset.for === id);
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = list[(here + step + list.length) % list.length];
        if (next?.dataset.for) void open(next.dataset.for, 'first');
        break;
      }
      case 'Tab':
        close(false);
        break;
      default:
        if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          clearTimeout(typedTimer);
          typed += event.key;
          typedTimer = setTimeout(() => (typed = ''), TYPE_AHEAD_MS);
          const labels = items.map((b) => b.querySelector('.text')?.textContent?.trim() ?? '');
          const to = typeAheadIndex(labels, at, typed);
          if (to >= 0) items[to]?.focus();
        }
    }
  }

  function modalOpen(): boolean {
    try {
      return document.querySelector('dialog:modal') !== null;
    } catch {
      return false; // a browser that does not know :modal
    }
  }

  function onWindowKey(event: KeyboardEvent): void {
    if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // A modal dialog makes the page behind it inert: its keys are not the bar's.
    if (modalOpen()) return;
    const menu =
      menuForMnemonic(menus, event.key) ?? menuForMnemonic(menus, letterOfCode(event.code) ?? '');
    if (!menu) return;
    event.preventDefault();
    void open(menu.id, 'first');
  }

  function onWindowClick(event: MouseEvent): void {
    if (openId !== null && root && event.target instanceof Node && !root.contains(event.target)) {
      close(false);
    }
  }
</script>

{#snippet triggerText(menu: Menu)}
  {@const parts = splitMnemonic(menu.label, menu.mnemonic)}
  {parts.before}{#if parts.mark}<u>{parts.mark}</u>{/if}{parts.after}
{/snippet}

{#snippet rows(items: MenuItem[], id: string)}
  {#each items as item, i (i)}
    {#if item.kind === 'info'}
      <p class="info" role="none">{item.label}</p>
    {:else if item.kind !== 'separator' && item.kind !== 'section'}
      <button
        type="button"
        class="item"
        role={roleOf(item)}
        aria-checked={item.kind === 'radio' || item.kind === 'check' ? item.checked : undefined}
        aria-keyshortcuts={item.shortcut ? ariaShortcut(item.shortcut) : undefined}
        disabled={(item.kind === 'action' || item.kind === 'radio') && item.disabled}
        tabindex="-1"
        onclick={() => pick(item)}
        onkeydown={(e) => onItemKey(e, id)}
      >
        <span class="mark" aria-hidden="true"
          >{item.kind === 'radio' ? (item.checked ? '●' : '') : item.kind === 'check' ? (item.checked ? '✓' : '') : ''}</span
        >
        <span class="text">{item.label}</span>
        {#if item.shortcut}<span class="shortcut">{item.shortcut}</span>{/if}
      </button>
    {/if}
  {/each}
{/snippet}

<svelte:window onclick={onWindowClick} onkeydown={onWindowKey} />

<!-- Focus that leaves the bar (Tab) closes the menu: it must not stay open behind. -->
<div
  class="menubar"
  role="menubar"
  tabindex="-1"
  aria-label={label}
  bind:this={root}
  onfocusout={(e) => {
    const to = e.relatedTarget;
    if (openId !== null && root && !(to instanceof Node && root.contains(to))) close(false);
  }}
>
  {#each menus as menu (menu.id)}
    <div class="menu">
      <button
        type="button"
        class="trigger"
        role="menuitem"
        data-for={menu.id}
        tabindex={stopId === menu.id ? 0 : -1}
        onfocus={() => (stop = menu.id)}
        aria-haspopup="menu"
        aria-keyshortcuts={menu.mnemonic ? `Alt+${menu.mnemonic.toLocaleUpperCase()}` : undefined}
        aria-expanded={openId === menu.id}
        onclick={() => (openId === menu.id ? close(false) : void open(menu.id, null))}
        onkeydown={(e) => onTriggerKey(e, menu.id)}
        onmouseenter={() => {
          if (openId !== null && openId !== menu.id) void open(menu.id, null);
        }}>{@render triggerText(menu)}</button
      >
      {#if openId === menu.id}
        <div class="popup" role="menu" aria-label={menu.label} data-menu={menu.id}>
          {#each toBlocks(menu.items) as block, b (b)}
            {#if block.kind === 'divider'}
              <hr />
            {:else if block.heading !== null}
              <div role="group" aria-labelledby="{uid}-{menu.id}-{b}">
                <p class="section" id="{uid}-{menu.id}-{b}" role="presentation">{block.heading}</p>
                {@render rows(block.items, menu.id)}
              </div>
            {:else}
              {@render rows(block.items, menu.id)}
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .menubar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.1rem;
  }
  .trigger {
    white-space: nowrap;
  }
  .trigger u {
    text-decoration: underline;
    text-underline-offset: 0.15em;
  }
  .menu {
    position: relative;
  }
  .trigger {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    color: var(--text);
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    background: var(--surface-2);
    border-color: var(--line);
  }
  .popup {
    position: absolute;
    z-index: 20;
    top: calc(100% + 0.2rem);
    left: 0;
    min-width: 13rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0.3rem;
    max-width: calc(100vw - 1rem);
    /* Portrait or a short window: a long list scrolls inside the popup instead of leaving the screen. */
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
  }
  /* The last menu sits near the right edge in a narrow window: its popup opens to the left. */
  .menu:last-child .popup {
    left: auto;
    right: 0;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    background: none;
    border: 0;
    border-radius: var(--radius);
    padding: 0.3rem 0.5rem;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
  }
  /* As in a native menu, the item under the pointer or the key is filled with the accent. */
  .item:hover:not(:disabled),
  .item:focus-visible {
    background: var(--accent);
    color: var(--accent-text);
  }
  .item:hover:not(:disabled) .mark,
  .item:focus-visible .mark {
    color: inherit;
  }
  .text {
    flex: 1;
  }
  .shortcut {
    margin-left: 1.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .item:hover:not(:disabled) .shortcut,
  .item:focus-visible .shortcut {
    color: inherit;
  }
  .section {
    margin: 0;
    padding: 0.35rem 0.5rem 0.15rem;
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .item:disabled {
    color: var(--muted);
    cursor: default;
  }
  .mark {
    width: 1rem;
    text-align: center;
    color: var(--accent);
  }
  .info {
    margin: 0;
    padding: 0.3rem 0.5rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--line);
    margin: 0.3rem 0;
  }
</style>
