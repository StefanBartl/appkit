// @vitest-environment jsdom
// The hint of a choice: on its button, described to assistive technology through the popup, and gone while the
// choice is open (the popup would lie over the list).
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MultiSelect from './MultiSelect.svelte';
import { installTooltips } from './tooltip';

let app: ReturnType<typeof mount> | undefined;
let uninstall: (() => void) | undefined;

function build(hint?: string) {
  document.body.innerHTML = '';
  app = mount(MultiSelect, {
    target: document.body,
    props: {
      label: 'Areas',
      options: [{ value: 'a', label: 'A' }],
      selected: [],
      onchange: () => undefined,
      resetLabel: 'Reset',
      searchLabel: 'Search',
      ...(hint === undefined ? {} : { hint }),
    },
  });
  flushSync();
  uninstall = installTooltips(document, window, { regionLabel: () => 'Hints' });
}
beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(async () => {
  uninstall?.();
  if (app) await unmount(app);
  app = undefined;
});

const button = () => document.querySelector<HTMLButtonElement>('button.trigger')!;
const tip = () => document.getElementById('hint-tip')!;

describe('the hint of a choice', () => {
  it('is on the button when the app gives one, and nowhere when it does not', () => {
    build('Only these areas');
    expect(button().getAttribute('data-hint')).toBe('Only these areas');
    build();
    expect(button().hasAttribute('data-hint')).toBe(false);
  });

  it('shows on focus and describes the button itself for a screen reader (not a wrapper)', () => {
    build('Only these areas');
    button().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(tip().hidden).toBe(false);
    expect(tip().textContent).toBe('Only these areas');
    expect(button().getAttribute('aria-describedby')).toContain('hint-tip');
  });

  it('is gone while the choice is open and back when it is shut', async () => {
    build('Only these areas');
    button().dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    button().click();
    await tick();
    await tick();
    expect(document.querySelector('.popup')).not.toBeNull();
    expect(button().hasAttribute('data-hint')).toBe(false);
    expect(tip().hidden).toBe(true);
    button().click();
    await tick();
    await tick();
    expect(button().getAttribute('data-hint')).toBe('Only these areas');
  });
});
