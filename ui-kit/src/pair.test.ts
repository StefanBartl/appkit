import { describe, expect, it } from 'vitest';
import { takePairingCode } from './pair';

function runWith(hash: string, injected?: unknown) {
  const calls: unknown[][] = [];
  const code = takePairingCode(
    { hash, pathname: '/', search: '' },
    { replaceState: (...args: unknown[]) => void calls.push(args) },
    injected,
  );
  return { code, calls };
}

function run(hash: string) {
  return runWith(hash);
}

describe('takePairingCode', () => {
  const good = 'ab'.repeat(16);
  it('takes the code and clears the fragment', () => {
    const { code, calls } = run(`#pair=${good}`);
    expect(code).toBe(good);
    expect(calls).toEqual([[null, '', '/']]);
  });
  it('refuses a code that is not hex of the right size, but still clears', () => {
    for (const hash of ['#pair=zz', '#pair=ab', `#pair=${good}x`, '#other=1']) {
      const { code, calls } = run(hash);
      expect(code).toBeNull();
      expect(calls.length).toBe(1);
    }
  });
  it('takes the code a shell injected when the fragment has none, and touches no history', () => {
    const { code, calls } = runWith('', good);
    expect(code).toBe(good);
    expect(calls).toEqual([]);
    // A fragment of something else is still cleared.
    const other = runWith('#other=1', good);
    expect(other.code).toBe(good);
    expect(other.calls.length).toBe(1);
  });
  it('prefers the fragment, and refuses an injected value that is not a code', () => {
    const fromFragment = 'cd'.repeat(16);
    expect(runWith(`#pair=${fromFragment}`, good).code).toBe(fromFragment);
    for (const bad of ['zz', 'ab', `${good}x`, 42, null, undefined, {}]) {
      expect(runWith('', bad).code).toBeNull();
    }
  });
  it('does nothing without a fragment', () => {
    const { code, calls } = run('');
    expect(code).toBeNull();
    expect(calls).toEqual([]);
  });
});
