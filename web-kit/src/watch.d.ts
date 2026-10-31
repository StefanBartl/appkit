// The types of watch.js: the look at the folder on focus and on a timer.

export interface WatchDeps {
  /** The signature of the folder now (the app's: sizes and times, no content). */
  signature(): Promise<string>;
  /** The folder is not what was read: read it again and tell the page. */
  onChange(): void | Promise<void>;
  /** A look failed (the folder is gone, the permission was taken back). The watcher goes on. */
  onError?(error: unknown): void;
  intervalMs?: number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Call `listener` when the window gets the focus back (or the tab becomes visible); returns the way to stop. */
  onFocus(listener: () => void): () => void;
}

export interface Watcher {
  /** Look now. Resolves true when the folder differs and `onChange` ran. */
  check(): Promise<boolean>;
  /** The folder was read again by someone else: this is the state to compare against from now on. */
  accept(signature: string): void;
  stop(): void;
}

export const WATCH_MS: number;

export function watchFolder(known: string, deps: WatchDeps): Watcher;
