// The check that the shell of every app looks like the same one. The parts of the shell the apps share (the page, the
// menu bar and an open menu, the palette) are read in a browser as the styles the browser works out for them (colour,
// type, line, shape, shadow), and compared with one reference kept with the kit. Styles, not pixels: a screenshot depends
// on the fonts of the machine, the styles do not, and a page that overrides a token or a rule of the kit shows as the
// property it changed.
//
// In a test (Playwright): `await page.evaluate(collectShell, SHELL_PROBES)` in each state (closed, a menu open, the
// palette open) and `diffShell(theme, collected, golden)`; an empty list is a pass.

/** What is read of an element. */
export const SHELL_PROPS = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'borderTopColor',
  'borderTopStyle',
  'borderTopWidth',
  'borderRadius',
  'boxShadow',
  'paddingTop',
  'paddingLeft',
  'outlineStyle',
];

/** The parts every app has, by the selector that finds each. The ones of an open menu or palette exist only then. */
export const SHELL_PROBES = {
  page: 'body',
  menubar: '[role="menubar"]',
  trigger: '[role="menubar"] button.mb-trigger',
  // A plain action: not a checked or a disabled one, whose looks differ by design and would make the first item of a menu a moving target.
  menuitem: '[role="menu"] button.mb-item:not(:disabled):not([aria-checked])',
  palette: 'dialog[open]:has(input[role="combobox"])',
  paletteInput: 'dialog[open] input[role="combobox"]',
  paletteOption: 'dialog[open] [role="option"][aria-selected="true"]',
};

/**
 * Runs in the page: the styles of the first element of each probe that is there now. Self-contained (it is sent to the
 * browser as text), so it names nothing of this file.
 */
export function collectShell(probes) {
  const props = [
    'color',
    'backgroundColor',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'borderTopColor',
    'borderTopStyle',
    'borderTopWidth',
    'borderRadius',
    'boxShadow',
    'paddingTop',
    'paddingLeft',
    'outlineStyle',
  ];
  const out = {};
  for (const [name, selector] of Object.entries(probes)) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const css = getComputedStyle(el);
    const style = {};
    for (const prop of props) style[prop] = css[prop] ?? '';
    out[name] = style;
  }
  return out;
}

/** What is different: one line per probe and property, and one for a probe that the page does not have. */
export function diffShell(label, actual, golden) {
  const lines = [];
  for (const [name, want] of Object.entries(golden)) {
    const got = actual[name];
    if (!got) {
      lines.push(`${label}: ${name} is not on the page`);
      continue;
    }
    for (const prop of SHELL_PROPS) {
      if (got[prop] !== want[prop]) lines.push(`${label}: ${name}.${prop} is ${JSON.stringify(got[prop])}, the shell has ${JSON.stringify(want[prop])}`);
    }
  }
  for (const name of Object.keys(actual)) {
    if (!(name in golden)) lines.push(`${label}: ${name} is on the page but not in the reference`);
  }
  return lines;
}
