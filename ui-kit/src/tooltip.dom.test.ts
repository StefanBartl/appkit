// @vitest-environment jsdom
// The popup in a real DOM: a press of the mouse focuses what it hits (the browser does it as the default action of
// mousedown), and the popup that focus would show lay under the pointer once the browser had scrolled the element into
// view. The press shows nothing; the keyboard focus does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltips, SHOW_DELAY_MS, TIP_ID } from './tooltip';

let uninstall: (() => void) | undefined;

function page() {
  document.body.innerHTML = '<button id="a" data-hint="First">A</button><button id="b" data-hint="Second">B</button>';
  uninstall = installTooltips(document, window, { regionLabel: () => 'Hints' });
  const a = document.getElementById('a') as HTMLButtonElement;
  const b = document.getElementById('b') as HTMLButtonElement;
  // What the browser does with a press on a button: it focuses it, between mousedown and mouseup.
  for (const el of [a, b]) el.addEventListener('mousedown', () => el.focus());
  const tip = document.getElementById(TIP_ID) as HTMLElement;
  const fire = (el: Element, type: string) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  return { a, b, tip, fire };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('the popup and the press of the mouse', () => {
  it('shows nothing for the focus of a press, also when the popup of another element is warm', () => {
    const { a, b, tip, fire } = page();
    fire(a, 'mouseover');
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('First');
    // The pointer goes to the second button and presses it: its focus follows, and the popup of the first goes with the
    // focus it had.
    a.focus();
    fire(b, 'mousedown');
    expect(document.activeElement).toBe(b);
    expect(tip.hidden).toBe(true);
    fire(b, 'mouseup');
    expect(tip.hidden).toBe(true);
  });

  it('still shows at once for the focus of the keyboard', () => {
    const { a, b, tip, fire } = page();
    fire(a, 'mousedown');
    fire(a, 'mouseup');
    a.blur();
    b.focus();
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe('Second');
  });
});
