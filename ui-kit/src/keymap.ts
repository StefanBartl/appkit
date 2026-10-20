// The keyboard of a page as data: one map (`keymap.json`) says which key is which command, and a plain function turns a
// key press into a command, so that it is tested without a DOM. The kit ships the keys every app shares (the palette on
// Ctrl or Cmd and K, `j`/`k`, Enter, Escape, `/`, and the chord that starts with `g`); an app adds the targets of its
// chord (`g h` is its overview) with `withChord`, and acts on the command by name.

import base from './keymap.json';

export interface Keymap {
  /** The binding that opens the palette, `Mod+K` (`Mod` is Ctrl, or Cmd on a Mac). It works in a field too. */
  palette: string;
  chord: {
    /** The key that starts a chord. */
    prefix: string;
    /** A prefix that nothing follows within this is forgotten (ms). */
    timeoutMs: number;
    /** The second key of the chord to the argument of its `go` command (`h` to `overview`). */
    targets: Readonly<Record<string, string>>;
  };
  /** A single key to its command name. A key that is a letter must come without Shift; `/` may carry it. */
  keys: Readonly<Record<string, string>>;
  /** The keys that stay on when the single keys are turned off (assistive software uses the letters). */
  always: readonly string[];
}

/** The keys every app shares, as `keymap.json` has them. */
export const defaultKeymap: Keymap = base;

/** The map with the targets of the chord of an app; the kit's own keys stay. */
export function withChord(map: Keymap, targets: Readonly<Record<string, string>>): Keymap {
  return { ...map, chord: { ...map.chord, targets: { ...map.chord.targets, ...targets } } };
}

/** What the page knows of a key press. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** The focus is in a field, a menu or a dialog: a letter there is typed, not a shortcut. */
  typing: boolean;
}

/** A command: its name, and for the chord (`go`) the target. */
export interface Command {
  name: string;
  arg?: string;
}

/** When the prefix of a chord was pressed (ms), or `null`. */
export type ChordState = number | null;

export interface KeyResult {
  /** The command, or `null` when the key is not one (the page lets the browser have it). */
  command: Command | null;
  /** Whether a prefix is now waiting for its second key. */
  chord: ChordState;
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

/**
 * Whether the press is the binding (`Mod+K`, `Ctrl+Alt+P`). `Mod` is Ctrl or Cmd, whichever the press has. Alt is
 * exact; Shift counts only when the binding names it (Ctrl+K is Ctrl+K with CapsLock or a shifted layout too).
 */
export function matches(binding: string, press: KeyPress): boolean {
  const parts = binding.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop() ?? '';
  const named = new Set(parts);
  const modOk = named.has('mod')
    ? press.ctrlKey || press.metaKey
    : press.ctrlKey === named.has('ctrl') && press.metaKey === (named.has('meta') || named.has('cmd'));
  const shiftOk = !named.has('shift') || press.shiftKey;
  return modOk && shiftOk && press.altKey === named.has('alt') && press.key.toLowerCase() === key;
}

/**
 * The command of a key press. `shortcuts` off turns off the single keys that are letters or `/`; the `always` keys
 * (Enter, Escape) and the palette stay, they are not characters typed by accident.
 */
export function resolveKey(map: Keymap, press: KeyPress, chord: ChordState, now: number, shortcuts: boolean): KeyResult {
  // The palette opens in a field too, and with the single keys off.
  if (matches(map.palette, press)) {
    return { command: { name: 'palette' }, chord: null };
  }
  // A modifier on its own is no key yet: a chord waits through it.
  if (MODIFIERS.has(press.key)) return { command: null, chord };
  if (press.ctrlKey || press.metaKey || press.altKey || press.typing) return { command: null, chord: null };
  const always = map.always.includes(press.key);
  if (always) {
    const name = map.keys[press.key];
    return { command: name === undefined ? null : { name }, chord: null };
  }
  if (!shortcuts) return { command: null, chord: null };
  // A key that is no letter (`/`) is typed with Shift on many layouts; a letter with Shift is another key.
  // CapsLock gives `J` without Shift.
  const isLetter = press.key.length === 1 && press.key.toLowerCase() !== press.key.toUpperCase();
  if (press.key.length !== 1 || (isLetter && press.shiftKey)) return { command: null, chord: null };
  const key = isLetter ? press.key.toLowerCase() : press.key;
  if (chord !== null && now - chord < map.chord.timeoutMs) {
    const target = map.chord.targets[key];
    if (target !== undefined) return { command: { name: 'go', arg: target }, chord: null };
    // Any other key ends the chord and is taken as itself.
  }
  if (key === map.chord.prefix) return { command: null, chord: now };
  const name = map.keys[key];
  return { command: name === undefined ? null : { name }, chord: null };
}
