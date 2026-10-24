<script lang="ts">
  // The name of the app (or its logo) at the left end of the bar. With `onclick` it is a button that does what the app
  // says (the start view); without it, plain text. The hover and the focus draw a line under it and tint it with the
  // accent; the movement stays out for a person who asked for less of it.
  import type { Snippet } from 'svelte';
  import { tooltip } from './tooltip';

  let {
    label,
    hint,
    onclick,
    children,
  }: {
    /** The name: shown as text, and the accessible name when `children` (a logo) take its place. */
    label: string;
    /** What a click does, in the hint popup. */
    hint?: string;
    onclick?: () => void;
    children?: Snippet;
  } = $props();
</script>

{#if onclick}
  <button type="button" class="kit-brand kit-brand-link" aria-label={children ? label : undefined} use:tooltip={hint ?? ''} {onclick}>
    {#if children}{@render children()}{:else}{label}{/if}
  </button>
{:else}
  <strong class="kit-brand" aria-label={children ? label : undefined}>
    {#if children}{@render children()}{:else}{label}{/if}
  </strong>
{/if}

<style>
  .kit-brand {
    position: relative;
    display: inline-block;
    font: inherit;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text);
    background: none;
    border: 0;
    padding: 0;
    border-radius: var(--radius);
  }
  .kit-brand-link {
    cursor: pointer;
  }
  .kit-brand-link::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.05rem;
    height: 2px;
    border-radius: var(--radius-pill);
    background: linear-gradient(90deg, var(--accent), transparent);
    transform: scaleX(0);
    transform-origin: left center;
  }
  .kit-brand-link:hover,
  .kit-brand-link:focus-visible {
    color: var(--accent);
  }
  .kit-brand-link:hover::after,
  .kit-brand-link:focus-visible::after {
    transform: scaleX(1);
  }
  .kit-brand-link:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: no-preference) {
    .kit-brand-link {
      transition:
        color 0.2s ease,
        letter-spacing 0.25s ease;
    }
    .kit-brand-link::after {
      transition: transform 0.3s ease;
    }
    .kit-brand-link:hover {
      letter-spacing: 0.06em;
    }
  }
</style>
