// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectShell, diffShell, SHELL_PROPS, type ShellSignature, type ShellStyle } from './shell-check';

const style = (over: Partial<ShellStyle> = {}): ShellStyle => {
  const base = Object.fromEntries(SHELL_PROPS.map((p) => [p, 'x'])) as ShellStyle;
  return { ...base, ...over };
};

describe('diffShell', () => {
  it('is empty for the same shell', () => {
    const sig: ShellSignature = { page: style(), trigger: style({ color: 'red' }) };
    expect(diffShell('light', sig, structuredClone(sig))).toEqual([]);
  });

  it('names the probe and the property that differ, with both values', () => {
    const golden: ShellSignature = { trigger: style({ borderRadius: '6px' }) };
    const actual: ShellSignature = { trigger: style({ borderRadius: '2px' }) };
    expect(diffShell('dark', actual, golden)).toEqual(['dark: trigger.borderRadius is "2px", the shell has "6px"']);
  });

  it('says so when a part is missing, and when a part is there that the reference does not know', () => {
    const lines = diffShell('light', { page: style(), extra: style() }, { page: style(), menubar: style() });
    expect(lines).toEqual(['light: menubar is not on the page', 'light: extra is on the page but not in the reference']);
  });
});

describe('collectShell', () => {
  it('reads the first element of each probe that is there, and skips the others', () => {
    document.body.innerHTML = '<nav role="menubar" style="color: rgb(1, 2, 3); border-radius: 4px"></nav><nav role="menubar"></nav>';
    const got = collectShell({ menubar: '[role="menubar"]', dialog: 'dialog[open]' });
    expect(Object.keys(got)).toEqual(['menubar']);
    expect(got['menubar']?.['color']).toBe('rgb(1, 2, 3)');
    expect(got['menubar']?.['borderRadius']).toBe('4px');
    expect(Object.keys(got['menubar'] ?? {})).toEqual([...SHELL_PROPS]);
  });

  it('is self-contained: it works when it is sent to a browser as text', () => {
    // A function that names nothing outside itself survives `toString`, which is how Playwright sends it.
    const sent = new Function(`return (${collectShell.toString()})`)() as typeof collectShell;
    document.body.innerHTML = '<nav role="menubar" style="color: rgb(9, 9, 9)"></nav>';
    expect(sent({ menubar: '[role="menubar"]' })['menubar']?.['color']).toBe('rgb(9, 9, 9)');
  });
});
