// @vitest-environment jsdom
// The documentation window: the search narrows the list, a click on an entry shows the document, and the window
// starts at the document the app names.
import { flushSync, mount, tick, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DocsDialog from './DocsDialog.svelte';
import type { DocEntry } from './docs';

const docs: DocEntry[] = [
  { id: 'a', title: 'Overview', text: '# Overview\n\nThe first text.' },
  { id: 'b', title: 'Architecture', text: '# Architecture\n\nThe engine and the hub.' },
];
const labels = { title: 'Documentation', label: 'Search', placeholder: 'Search ...', none: 'Nothing found', list: 'Documents', close: 'Close' };

// jsdom has a dialog but no modal: showModal() and close() only flip `open`.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

let app: ReturnType<typeof mount> | undefined;
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
});

async function show(docId: string | null = null, onclose = vi.fn()) {
  app = mount(DocsDialog, { target: document.body, props: { open: true, docs, docId, onclose, labels } });
  flushSync();
  await tick();
  return onclose;
}
const article = () => document.querySelector('article.doc')!.textContent ?? '';
const names = () => [...document.querySelectorAll('li button .name')].map((n) => n.textContent);

describe('DocsDialog', () => {
  it('starts at the document the app names, else at the first', async () => {
    await show('b');
    expect(article()).toContain('The engine and the hub.');
    await unmount(app!);
    document.body.innerHTML = '';
    await show(null);
    expect(article()).toContain('The first text.');
  });

  it('narrows the list with the search and shows the best hit', async () => {
    await show();
    const input = document.querySelector('input')!;
    input.value = 'hub';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(names()).toEqual(['Architecture']);
    expect(article()).toContain('The engine and the hub.');
    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(document.querySelector('.none')?.textContent).toBe('Nothing found');
  });

  it('shows the document of an entry that is clicked, and tells the app when it closes', async () => {
    const onclose = await show();
    (document.querySelectorAll('li button')[1] as HTMLButtonElement).click();
    await tick();
    expect(article()).toContain('The engine and the hub.');
    (document.querySelector('button.close') as HTMLButtonElement).click();
    expect(onclose).toHaveBeenCalled();
  });
});
