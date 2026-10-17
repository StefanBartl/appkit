// The part of a dictionary that knows no words: filling the holes of a text and choosing a language. The words
// themselves, and the typed keys, belong to the app.

/** Put the values into the `{name}` holes of a text; a hole that has no value stays as it is (it shows the mistake). */
export function fill(text: string, params: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** The first language the browser asks for that the app has (by its base tag: `de-AT` is `de`), else the fallback. */
export function pickLang<L extends string>(preferred: readonly string[], known: readonly L[], fallback: L): L {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0] ?? '';
    const match = known.find((lang) => lang === base);
    if (match !== undefined) return match;
  }
  return fallback;
}
