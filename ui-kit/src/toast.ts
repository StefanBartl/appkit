// The shape of the one-line message of a page: what happened, how it went, and whether there is a way back. The
// page keeps the current message and decides when it goes; `Toast.svelte` shows it.

export type ToastKind = 'ok' | 'warn' | 'error';

export interface ToastMessage {
  /** `error` is announced as an alert (it interrupts), the others wait their turn. */
  kind: ToastKind;
  text: string;
  /** There is a way back: the component shows the button, the page does the undoing. */
  undo?: boolean;
}
