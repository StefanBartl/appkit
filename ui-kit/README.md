# appkit-ui

The parts of the browser page that every app of appkit shares, as Svelte 5 and TypeScript source: an app's
bundler (Vite with the Svelte plugin) compiles them, there is no build here.

| What | File |
|---|---|
| The design tokens in ten groups: surfaces, text, lines and accent (`--line`, `--accent-soft`, `--focus`), meaning colours, depth and marks (`--shadow`, `--shadow-sm`, `--backdrop`, `--mark`), shape, type (`--font-size`, `--line-height`), the theme (`light-dark()` follows the system, `data-theme` on the root overrides it), the base rules, and the check `tools/check-color-literals.py` (which every app runs over its own page too): no hex colour or colour function where the CSS of a page states a colour, outside the tokens; scripts, `.ts` and `.svg` files and named colours are not looked at. `--border` is an alias of `--line` while the pages move | `tokens.css` |
| The base rules that come with them: box model, page, focus ring, headings, the hint popup, the info button, `.sr-only`, reduced motion | `base.css` |
| The menu bar of an application (a row of menus with the keys of the ARIA pattern) | `MenuBar.svelte` |
| A choice of any number of values, with a search when the list is long | `MultiSelect.svelte` |
| The "what does this mean" button beside a label | `Info.svelte` |
| A markdown reader that draws text as elements, never as an HTML string | `markdown.ts`, `Blocks.svelte`, `Inlines.svelte` |
| One explanation popup for every element with `data-hint` (hover, focus, Escape) | `tooltip.ts` |
| A server-sent-event reader over `fetch` (a bearer header, a backoff) | `sse.ts` |
| The pairing code in the URL fragment, taken out of the address bar | `pair.ts` |
| Back and Forward: each place is an entry of the tab's history, the state in `history.state`, not in the address | `nav.ts` |
| Characters that hide or reverse text, made visible | `text.ts` |
| Filling the holes of a text and choosing a language; the words belong to the app | `i18n.ts` |

## Using it

An app depends on the folder of a tag of this repository:

```
pnpm add "git+https://github.com/StefanBartl/appkit.git#vX.Y.Z&path:ui-kit"
```

`pnpm-lock.yaml` then pins the commit. In the page:

```ts
import 'appkit-ui/tokens.css';
import 'appkit-ui/base.css';
import MenuBar, { type Menu } from 'appkit-ui/MenuBar.svelte';
import { installTooltips } from 'appkit-ui/tooltip';
```

The kit has no words: `installTooltips` takes the name of its region from the app (`regionLabel`), the components
take every label as a prop, and `i18n.ts` only fills holes and picks a language.

To work on the kit and an app at once, point the app at the checkout (`pnpm add link:../path/to/appkit/ui-kit`) and
put the tag back before committing.

## Checks

```
pnpm install --frozen-lockfile
pnpm check
pnpm test
```
