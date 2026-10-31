// The kit is plain JavaScript with its types beside it (`<module>.d.ts`): every value a module exports is declared
// there, and nothing is declared that the module does not export. The apps' type checks read the declarations; this
// keeps them from drifting from the code. Types and interfaces have no value and are not compared.
//
//   node --test test/types.test.mjs        (from web-kit/)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const pkg = JSON.parse(readFileSync(join(src, '..', 'package.json'), 'utf8'));

/** The names of the values a declaration file declares: `export const|function|class <name>`. */
function declared(dts) {
  return [...new Set([...dts.matchAll(/^export (?:const|function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]))].sort();
}

for (const [entry, file] of Object.entries(pkg.exports)) {
  test(`${entry}: the declarations name what the module exports`, async () => {
    const mod = await import(new URL(`../${file}`, import.meta.url).href);
    const dts = readFileSync(join(src, file.replace('./src/', '').replace(/\.js$/, '.d.ts')), 'utf8');
    assert.deepEqual(declared(dts), Object.keys(mod).sort());
  });
}

test('every module of the kit is exported, and every export is a module of the kit', async () => {
  const { readdirSync } = await import('node:fs');
  const modules = readdirSync(src).filter((f) => f.endsWith('.js')).map((f) => `./src/${f}`).sort();
  assert.deepEqual(Object.values(pkg.exports).sort(), modules);
  for (const f of modules) assert.ok(readdirSync(src).includes(f.slice(6).replace(/\.js$/, '.d.ts')), `${f} has its types`);
});
