// The types of folder-input.js: a folder chosen through `<input webkitdirectory>`, read only.

import type { DirHandleLike } from './folder.js';

/** The part of a `File` this module uses. */
export interface PickedFile {
  name: string;
  size: number;
  lastModified?: number;
  /** `<chosen folder>/<path below it>`, `/` separated. Empty when the browser does not tell. */
  webkitRelativePath: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** A folder made of the files the browser listed: read only, its tree built from the relative paths. */
export interface PickedFolder extends DirHandleLike {
  /** How many files the browser listed (also those a reader will not take). */
  count: number;
}

export class NoPathsError extends Error {
  constructor();
}

export function folderOfFiles(files: ArrayLike<PickedFile>): PickedFolder;

/** What the page needs of `document` to ask for a folder through an input. */
export interface InputDocument {
  createElement(tag: 'input'): InputLike;
  body?: { appendChild(node: unknown): unknown } | null;
}

export interface InputLike {
  type: string;
  webkitdirectory?: boolean;
  multiple?: boolean;
  hidden?: boolean;
  files: ArrayLike<PickedFile> | null;
  click(): void;
  remove?(): void;
  addEventListener(type: 'change' | 'cancel', listener: () => void, options?: { once?: boolean }): void;
}

export function inputFolderSupport(doc: Pick<InputDocument, 'createElement'> | undefined): boolean;

export type InputPick =
  | { kind: 'picked'; folder: PickedFolder }
  | { kind: 'cancelled' }
  /** The dialog was closed with a choice, but the browser listed no file (an empty folder). */
  | { kind: 'empty' }
  /** The browser gave files without their paths (Safari on iOS): no folder can be made of them. */
  | { kind: 'no_paths' }
  | { kind: 'failed'; message: string };

export function pickFolderByInput(doc: InputDocument): Promise<InputPick>;
