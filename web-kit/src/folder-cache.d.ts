// The types of folder-cache.js: one value kept per folder, given back only while the app releases it.

/** Where a value is kept (the shape of `CacheStore` of appkit-ui/cache). */
export interface ValueStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
  clear(): Promise<void>;
}

/** A cache that keeps nothing. */
export const noCache: ValueStore<never>;

/** The cache of `store` for the folder `folder` (`null`: none), giving back only what `releases` lets be kept. */
export function folderCache<T extends object>(
  store: ValueStore<T>,
  folder: string | null,
  releases: (value: T) => boolean,
): ValueStore<T>;

export function forgetFolderCache<T extends object>(store: ValueStore<T>, folder: string): Promise<void>;
