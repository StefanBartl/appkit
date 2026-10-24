// @vitest-environment jsdom
// The name at the left end of the bar: a button with a hint when the app gives it an action, plain text without one.
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Brand from './Brand.svelte';

let app: ReturnType<typeof mount> | undefined;
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
});

function show(props: { label: string; hint?: string; onclick?: () => void }) {
  app = mount(Brand, { target: document.body, props });
  flushSync();
}

describe('Brand', () => {
  it('is a button with the hint when it has an action, and runs it on a click', () => {
    const onclick = vi.fn();
    show({ label: 'Tasks', hint: 'Back to today', onclick });
    const button = document.querySelector('button.kit-brand') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('Tasks');
    expect(button.getAttribute('data-hint')).toBe('Back to today');
    button.click();
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('is plain text without an action: no button that does nothing', () => {
    show({ label: 'Tasks' });
    expect(document.querySelector('button')).toBeNull();
    expect(document.querySelector('strong.kit-brand')?.textContent?.trim()).toBe('Tasks');
  });
});
