import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Blocks from './Blocks.svelte';
import { parseMarkdown } from './markdown';

describe('Blocks', () => {
  it('puts the headings of the text one level below the heading it sits under', () => {
    // Under the h1 of a page: the text's own first level is h2.
    expect(render(Blocks, { props: { blocks: parseMarkdown('# T') } }).body).toContain('<h2');
    // Under an h2 (a section, a dialog): h3, and never below h6.
    expect(render(Blocks, { props: { blocks: parseMarkdown('# T'), headingBase: 2 } }).body).toContain('<h3');
    expect(render(Blocks, { props: { blocks: parseMarkdown('###### T'), headingBase: 2 } }).body).toContain('<h6');
    // Nested texts (a list item) keep the base.
    expect(render(Blocks, { props: { blocks: parseMarkdown('- item\n\n  # T'), headingBase: 2 } }).body).toContain('<h3');
  });
});
