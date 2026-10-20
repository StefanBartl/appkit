# appkit-ui

The parts of the browser page that every app of appkit shares, as Svelte 5 and TypeScript source: an app's
bundler (Vite with the Svelte plugin) compiles them, there is no build here.

| What | File |
|---|---|
| The design tokens in ten groups: surfaces, text, lines and accent (`--line`, `--accent-soft`, `--focus`), meaning colours, depth and marks (`--shadow`, `--shadow-sm`, `--backdrop`, `--mark`), shape, type (`--font-size`, `--line-height`), the theme (`light-dark()` follows the system, `data-theme` on the root overrides it), the base rules, and the check `tools/check-color-literals.py` (which every app runs over its own page too): no hex colour or colour function where the CSS of a page states a colour, outside the tokens; scripts, `.ts` and `.svg` files and named colours are not looked at. `--border` is an alias of `--line` while the pages move | `tokens.css` |
| The base rules that come with them: box model, page, focus ring, headings, the hint popup, the info button, `.sr-only`, reduced motion | `base.css` |
| The menu bar of an application (a row of menus with the keys of the ARIA pattern, sections with a heading and a line, shortcuts on the right, Alt+letter mnemonics, type-ahead) | `MenuBar.svelte`, `menu.ts` |
| The command palette (Ctrl+K): the box, the list and the keys in `Palette.svelte`; the loose matching, the frecency (what was chosen before comes first) and the list of actions and entries (tasks, rules) as plain functions in `palette.ts`. The page builds the list, runs the choice and keeps the frecency, so the component knows neither `App` nor a data contract | `Palette.svelte`, `palette.ts` |
| The one-line message of a page with the way back (an error is announced as an alert, the rest in the status region); the page keeps the message and its timer | `Toast.svelte`, `toast.ts` |
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
import { installTooltips, tooltip } from 'appkit-ui/tooltip';
```

The kit has no words: `installTooltips` takes the name of its region from the app (`regionLabel`), the components
take every label as a prop, and `i18n.ts` only fills holes and picks a language.

A menu is a list of items; `{ kind: 'section', label }` starts a group with a heading (a line is drawn before it),
`{ kind: 'separator' }` is a line of its own, and an action, radio or check item may carry `shortcut: 'Ctrl+N'`. The
shortcut is shown on the right and announced (`aria-keyshortcuts`); the app binds the key itself. A menu with
`mnemonic: 'p'` opens on Alt+P and shows the letter underlined. Inside an open menu the arrow keys, Home and End walk
the items, a letter goes to the next item that starts with it, Left and Right change the menu, Escape closes.
Alt+letter is left alone while a modal dialog is open or when another handler took the key; on a Mac, where Option+letter
writes another character, the physical key counts. Changed since the first version of the menu: `MenuItem` has a
member more (`section`), so an exhaustive `switch` over `kind` needs a case for it, and a separator at the start or the
end of a list, or two in a row, is no longer drawn.

A hint is the text of the app, from its dictionary. Set it as `data-hint` (optionally `data-hint-title`, and
`data-hint-delay` in milliseconds), or with the action, which sets exactly these:

```svelte
<button use:tooltip={t('save.hint')}>Save</button>
<span tabindex="0" use:tooltip={{ text: t('live.hint'), title: t('live.title'), delay: 600 }}>live</span>
```

The element must be reachable by keyboard (a button, a link, or `tabindex="0"`): the popup shows on hover after the
pause, at once on focus and at once on a tap (touch; a tap elsewhere takes it away). When the action updates the text
the open popup follows, and when the element goes away the popup goes with it. It stays while the pointer is on it, and goes with Escape, on scrolling and when the pointer
or the focus leaves.

To work on the kit and an app at once, point the app at the checkout (`pnpm add link:../path/to/appkit/ui-kit`) and
put the tag back before committing.

## Checks

```
pnpm install --frozen-lockfile
pnpm check
pnpm test
```
