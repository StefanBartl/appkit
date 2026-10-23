// @vitest-environment jsdom
// The choice itself: the button keeps its width while the popup is open, the search finds an option by more than its
// label, the note says how the values combine, and the any/all switch reports the side chosen.
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MultiSelect from './MultiSelect.svelte';

let app: ReturnType<typeof mount> | undefined;

const OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));

function build(extra: Record<string, unknown> = {}, options: readonly { value: string; label: string; title?: string }[] = OPTIONS) {
  document.body.innerHTML = '';
  app = mount(MultiSelect, {
    target: document.body,
    props: {
      label: 'Areas',
      options,
      selected: [],
      onchange: () => undefined,
      resetLabel: 'Reset',
      searchLabel: 'Search',
      ...extra,
    },
  });
  flushSync();
}
beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
});

const button = () => document.querySelector<HTMLButtonElement>('button.trigger')!;
const shown = () => [...document.querySelectorAll('.popup li span')].map((s) => s.textContent);

async function openIt(): Promise<void> {
  button().click();
  await tick();
  await tick();
}

async function search(word: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('.popup input[type=search]')!;
  input.value = word;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
}

describe('the button of a choice', () => {
  it('keeps the width it had when the popup opened, and lets it go when the popup closes', async () => {
    build();
    vi.spyOn(button(), 'getBoundingClientRect').mockReturnValue({ width: 123 } as DOMRect);
    await openIt();
    expect(button().style.width).toBe('123px');
    expect(button().classList.contains('held')).toBe(true);
    await openIt();
    expect(button().style.width).toBe('');
    expect(button().classList.contains('held')).toBe(false);
  });
});

describe('the search of a choice', () => {
  it('finds an option by its value and by its more words, not only by its label', async () => {
    build({}, [
      ...OPTIONS,
      { value: 'wkdbook-tasks.nvim', label: 'tasks.nvim', title: 'also tasks-desktop' },
    ]);
    await openIt();
    await search('wkdbook');
    expect(shown()).toEqual(['tasks.nvim']);
    await search('tasks-desktop');
    expect(shown()).toEqual(['tasks.nvim']);
    await search('Option 1');
    expect(shown()).toEqual(['Option 1', 'Option 10', 'Option 11']);
  });
});

describe('the note and the any/all switch', () => {
  it('shows the note at the top of the open popup only', async () => {
    build({ note: 'Any of these' });
    expect(document.querySelector('.note')).toBeNull();
    await openIt();
    expect(document.querySelector('.popup .note')?.textContent).toBe('Any of these');
  });

  it('has no switch unless the app asks for one', async () => {
    build();
    await openIt();
    expect(document.querySelector('.match')).toBeNull();
  });

  it('shows the side chosen and reports a change', async () => {
    const changes: string[] = [];
    build({ match: { value: 'any', anyLabel: 'any', allLabel: 'all', onchange: (v: string) => changes.push(v) } });
    await openIt();
    const radios = [...document.querySelectorAll<HTMLInputElement>('.match input[type=radio]')];
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(radios[0]!.name).toBe(radios[1]!.name);
    radios[1]!.click();
    expect(changes).toEqual(['all']);
  });
});
