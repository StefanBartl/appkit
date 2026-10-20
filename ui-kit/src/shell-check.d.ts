/** What is read of an element. */
export declare const SHELL_PROPS: readonly [
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
export type ShellProp = (typeof SHELL_PROPS)[number];
export type ShellStyle = Record<ShellProp, string>;
/** Probe name to what the browser works out for the first element that matches it. */
export type ShellSignature = Record<string, ShellStyle>;
/** The parts every app has, by the selector that finds each. The ones of an open menu or palette exist only then. */
export declare const SHELL_PROBES: Readonly<Record<string, string>>;
/** Runs in the page: the styles of the first element of each probe that is there now. */
export declare function collectShell(probes: Record<string, string>): Record<string, Record<string, string>>;
/** What is different: one line per probe and property, and one for a probe that the page does not have. */
export declare function diffShell(label: string, actual: ShellSignature, golden: ShellSignature): string[];
