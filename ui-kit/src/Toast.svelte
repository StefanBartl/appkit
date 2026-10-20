<script lang="ts">
  // What a write did, in one line, and the way back when there is one. The page keeps the toast and its timer; this
  // component only shows it.
  import type { ToastMessage } from './toast';

  let {
    toast,
    busy = false,
    onundo,
    ondismiss,
    labels,
  }: {
    toast: ToastMessage | null;
    /** An answer is awaited: the way back waits too. */
    busy?: boolean;
    onundo: () => void | Promise<void>;
    ondismiss: () => void;
    labels: { undo: string; dismiss: string };
  } = $props();
</script>

{#snippet body(shown: ToastMessage)}
  <div class="toast" class:warn={shown.kind === 'warn'} class:error={shown.kind === 'error'}>
    <span>{shown.text}</span>
    {#if shown.undo}
      <button type="button" disabled={busy} onclick={() => void onundo()}>{labels.undo}</button>
    {/if}
    <button type="button" class="close" aria-label={labels.dismiss} onclick={() => ondismiss()}>×</button>
  </div>
{/snippet}

<!-- Two live regions that stand from the start and never nest: a refusal is an alert (it interrupts), a "Saved."
     waits its turn in the status region. A live region inside another is read twice, or at the wrong time. -->
<div class="toasts">
  <div role="status" aria-live="polite">
    {#if toast && toast.kind !== 'error'}{@render body(toast)}{/if}
  </div>
  <div role="alert">
    {#if toast && toast.kind === 'error'}{@render body(toast)}{/if}
  </div>
</div>

<style>
  .toasts {
    position: fixed;
    left: 1rem;
    bottom: 1rem;
    z-index: 30;
    max-width: min(34rem, calc(100vw - 2rem));
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-left: 4px solid var(--ok);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0.5rem 0.75rem;
  }
  .toast.warn {
    border-left-color: var(--warn);
  }
  .toast.error {
    border-left-color: var(--bad);
  }
  button {
    background: none;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--text);
    cursor: pointer;
    padding: 0.15rem 0.6rem;
  }
  .close {
    border: 0;
    color: var(--muted);
    font-size: 1.1rem;
    line-height: 1;
  }
</style>
