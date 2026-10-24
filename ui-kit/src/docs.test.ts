import { describe, expect, it, vi } from 'vitest';
import { helpItems, isHttps, searchDocs, type DocEntry } from './docs';
import { kitTexts, lookup } from './i18n';

const docs: DocEntry[] = [
  { id: 'readme', title: 'Overview', text: 'The hub reads the vault and shows tasks.' },
  { id: 'arch', title: 'Architecture', text: 'The engine rates every rule. The hub only shows. Hub hub hub.' },
  { id: 'rel', title: 'Releasing', text: 'Tag the commit and let CI build.' },
];

describe('searchDocs', () => {
  it('gives every document in order for an empty query', () => {
    expect(searchDocs(docs, '  ').map((h) => h.doc.id)).toEqual(['readme', 'arch', 'rel']);
  });

  it('needs every word, in the title or in the text, and ignores case', () => {
    expect(searchDocs(docs, 'HUB vault').map((h) => h.doc.id)).toEqual(['readme']);
    expect(searchDocs(docs, 'nothing here')).toEqual([]);
  });

  it('ranks a title above a text and a document that says it more often above one that says it once', () => {
    expect(searchDocs(docs, 'hub').map((h) => h.doc.id)).toEqual(['arch', 'readme']);
    expect(searchDocs(docs, 'releas').map((h) => h.doc.id)).toEqual(['rel']);
  });

  it('cuts a snippet around the first match', () => {
    const hit = searchDocs(docs, 'vault')[0]!;
    expect(hit.snippet).toContain('vault');
    expect(hit.snippet).not.toMatch(/\s{2}/);
  });
});

describe('isHttps', () => {
  it('lets only https through', () => {
    expect(isHttps('https://github.com/x/y')).toBe(true);
    expect(isHttps('http://github.com/x/y')).toBe(false);
    expect(isHttps('javascript:alert(1)')).toBe(false);
    expect(isHttps('not a url')).toBe(false);
  });
});

describe('helpItems', () => {
  const text = (key: Parameters<typeof lookup>[1], params?: Record<string, string | number>) =>
    lookup(kitTexts.en, key, params);
  const base = { text, docs, opendoc: vi.fn(), opensearch: vi.fn() };

  it('makes the sections Documentation and Project, each entry with a hint', () => {
    const items = helpItems({
      ...base,
      repo: { url: 'https://github.com/a/b' },
      license: { name: 'MIT', url: 'https://github.com/a/b/blob/main/LICENSE' },
    });
    expect(items.filter((i) => i.kind === 'section').map((i) => i.label)).toEqual(['Documentation', 'Project']);
    const actions = items.filter((i) => i.kind === 'action');
    expect(actions.map((i) => i.label)).toEqual([
      'Search the documentation ...',
      'Overview',
      'Architecture',
      'Releasing',
      'GitHub repository',
      'License: MIT',
    ]);
    expect(actions.every((i) => i.hint)).toBe(true);
  });

  it('opens a document, the search and the links', () => {
    const openUrl = vi.fn();
    const opendoc = vi.fn();
    const opensearch = vi.fn();
    const items = helpItems({ ...base, opendoc, opensearch, openUrl, repo: { url: 'https://github.com/a/b' } });
    const actions = items.filter((i) => i.kind === 'action');
    actions[0]!.onselect();
    actions[2]!.onselect();
    actions.at(-1)!.onselect();
    expect(opensearch).toHaveBeenCalledTimes(1);
    expect(opendoc).toHaveBeenCalledWith('arch');
    expect(openUrl).toHaveBeenCalledWith('https://github.com/a/b');
  });

  it('leaves out a link that is not https and a section without entries', () => {
    const items = helpItems({ ...base, docs: [], repo: { url: 'http://x' }, license: { name: 'MIT', url: 'javascript:1' } });
    expect(items).toEqual([]);
  });
});
