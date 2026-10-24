// The documentation inside an app: a list of documents (Markdown), a search over them, and the entries they make in the
// Help menu. The app brings the documents (bundled with the page at build time, so they read without a network); the
// kit knows no file and no folder.

import type { KitKey } from './i18n';
import type { MenuItem } from './menu';

export interface DocEntry {
  /** Stable name of the document (`README`, `ARCHITECTURE`), used to open it. */
  id: string;
  title: string;
  /** The Markdown source. */
  text: string;
}

export interface DocHit {
  doc: DocEntry;
  score: number;
  /** A line of the text around the first match, whitespace collapsed; '' for an empty query. */
  snippet: string;
}

/** The length of a snippet around a match. */
export const SNIPPET = 120;

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

function snippetAround(text: string, at: number, length: number): string {
  const start = Math.max(0, at - Math.floor(length / 3));
  const cut = squash(text.slice(start, start + length));
  return `${start > 0 ? '... ' : ''}${cut}${start + length < text.length ? ' ...' : ''}`;
}

/**
 * The documents that contain every word of `query` (in the title or the text, case does not matter), best first: a
 * word in the title weighs more than the same word in the text, and so does a document that says it more often.
 * An empty query is every document in the order given.
 */
export function searchDocs(docs: readonly DocEntry[], query: string, limit = 30): DocHit[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return docs.slice(0, limit).map((doc) => ({ doc, score: 0, snippet: '' }));
  const hits: DocHit[] = [];
  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const text = doc.text.toLowerCase();
    let score = 0;
    let first = -1;
    let ok = true;
    for (const word of words) {
      const inTitle = title.includes(word);
      const at = text.indexOf(word);
      if (!inTitle && at < 0) {
        ok = false;
        break;
      }
      if (inTitle) score += title.startsWith(word) ? 2000 : 1000;
      if (at >= 0) {
        // Up to ten occurrences count: a long document must not win by length alone.
        let n = 0;
        for (let i = at; i >= 0 && n < 10; i = text.indexOf(word, i + word.length)) n++;
        score += n * 10;
        if (first < 0 || at < first) first = at;
      }
    }
    if (ok) hits.push({ doc, score, snippet: first >= 0 ? snippetAround(doc.text, first, SNIPPET) : '' });
  }
  // A stable sort: documents with the same score stay in the order the app gave.
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Only an https link is opened from the menu; anything else is not an address of a project page. */
export function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export interface HelpOptions {
  /** A text of the kit (`kitTexts`) with its holes filled. */
  text: (key: KitKey, params?: Record<string, string | number>) => string;
  docs: readonly DocEntry[];
  /** Opens the documentation window at this document. */
  opendoc: (id: string) => void;
  /** Opens the documentation window at its search box. */
  opensearch: () => void;
  repo?: { url: string };
  license?: { name: string; url: string };
  /** Opens a page in the browser; the default is a new tab without `opener`. */
  openUrl?: (url: string) => void;
}

const inNewTab = (url: string) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * The entries of the Help menu that every app shares: the section Documentation (the search and one entry per
 * document), and the section Project (the repository and the license). The app puts its own entries (About, report a
 * problem) before them. A link that is not https is left out.
 */
export function helpItems(o: HelpOptions): MenuItem[] {
  const open = o.openUrl ?? inNewTab;
  const items: MenuItem[] = [];
  if (o.docs.length > 0) {
    items.push(
      { kind: 'section', label: o.text('kit.help.docs') },
      { kind: 'action', label: o.text('kit.help.docs_search'), hint: o.text('kit.help.hint.docs_search'), onselect: o.opensearch },
      ...o.docs.map(
        (doc): MenuItem => ({
          kind: 'action',
          label: doc.title,
          hint: o.text('kit.help.hint.doc'),
          onselect: () => o.opendoc(doc.id),
        }),
      ),
    );
  }
  const links: MenuItem[] = [];
  const { repo, license } = o;
  if (repo && isHttps(repo.url)) {
    links.push({ kind: 'action', label: o.text('kit.help.repo'), hint: o.text('kit.help.hint.repo'), onselect: () => open(repo.url) });
  }
  if (license && isHttps(license.url)) {
    links.push({
      kind: 'action',
      label: o.text('kit.help.license', { name: license.name }),
      hint: o.text('kit.help.hint.license'),
      onselect: () => open(license.url),
    });
  }
  if (links.length > 0) items.push({ kind: 'section', label: o.text('kit.help.project') }, ...links);
  return items;
}
