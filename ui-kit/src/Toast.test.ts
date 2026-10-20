// The toast, rendered on the server side of Svelte: which live region a message lands in, and what it offers.
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Toast from './Toast.svelte';
import type { ToastMessage } from './toast';

const labels = { undo: 'Undo', dismiss: 'Close' };
const html = (toast: ToastMessage | null, busy = false): string =>
  render(Toast, { props: { toast, busy, onundo: () => undefined, ondismiss: () => undefined, labels } }).body;

// The status region comes first in the markup, the alert region after it.
const region = (out: string, role: 'status' | 'alert'): string => {
  const alert = out.indexOf('role="alert"');
  expect(alert).toBeGreaterThan(out.indexOf('role="status"'));
  return role === 'status' ? out.slice(0, alert) : out.slice(alert);
};

describe('Toast', () => {
  it('keeps both live regions from the start, empty', () => {
    const out = html(null);
    expect(out).toContain('role="status"');
    expect(out).toContain('role="alert"');
    expect(out).not.toMatch(/class="toast[ "]/);
  });

  it('puts a refusal in the alert region and everything else in the status region, never both', () => {
    const error = html({ kind: 'error', text: 'Refused' });
    expect(region(error, 'alert')).toContain('Refused');
    expect(region(error, 'status')).not.toContain('Refused');
    for (const kind of ['ok', 'warn'] as const) {
      const out = html({ kind, text: 'Saved' });
      expect(region(out, 'status')).toContain('Saved');
      expect(region(out, 'alert')).not.toContain('Saved');
    }
  });

  it('marks the kind for the colour of its edge', () => {
    expect(html({ kind: 'warn', text: 'x' })).toMatch(/class="toast[^"]*warn/);
    expect(html({ kind: 'error', text: 'x' })).toMatch(/class="toast[^"]*error/);
    expect(html({ kind: 'ok', text: 'x' })).not.toMatch(/class="toast[^"]*(warn|error)/);
  });

  it('offers the way back only when there is one, and holds it while an answer is awaited', () => {
    expect(html({ kind: 'ok', text: 'x' })).not.toContain('Undo');
    expect(html({ kind: 'ok', text: 'x', undo: true })).toContain('Undo');
    expect(html({ kind: 'ok', text: 'x', undo: true })).not.toMatch(/disabled[^>]*>Undo/);
    expect(html({ kind: 'ok', text: 'x', undo: true }, true)).toMatch(/disabled[^>]*>Undo/);
  });

  it('names the close button and shows the text as text', () => {
    const out = html({ kind: 'ok', text: '<b>x</b>' });
    expect(out).toContain('aria-label="Close"');
    expect(out).not.toContain('<b>x</b>');
  });
});
