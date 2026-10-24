// A modal <dialog> closes when the pointer is pressed and released on the backdrop beside it, as it does for Escape.
// The backdrop is part of the dialog element for the events: a click on it has the dialog itself as its target, so
// the click counts only when it lies outside the box of the dialog (a click on the padding of the box is inside).

/** Where the box of a dialog is, as far as the check needs it. */
export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** True when the point lies outside the box: on the backdrop, not on the dialog. */
export function isOutside(rect: Rect, x: number, y: number): boolean {
  return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
}

export interface BackdropOptions {
  /** Asked before the dialog closes; `false` keeps it open (a dialog with a draft that Escape would also lose). */
  closeable?: () => boolean;
}

/**
 * `use:closeOnBackdrop` on a `<dialog>`. Both the press and the release must be on the backdrop: a text selection
 * that starts in the dialog and ends outside it must not close it. The dialog closes with `close()`, so its own
 * `onclose` handler runs as it does for Escape.
 */
export function closeOnBackdrop(node: HTMLDialogElement, options: BackdropOptions = {}) {
  let opts = options;
  let pressedOutside = false;

  const outside = (e: MouseEvent) => e.target === node && isOutside(node.getBoundingClientRect(), e.clientX, e.clientY);

  const onDown = (e: MouseEvent) => {
    pressedOutside = outside(e);
  };
  const onClick = (e: MouseEvent) => {
    const start = pressedOutside;
    pressedOutside = false;
    if (!start || !outside(e) || !node.open) return;
    if (opts.closeable && !opts.closeable()) return;
    node.close();
  };

  node.addEventListener('mousedown', onDown);
  node.addEventListener('click', onClick);
  return {
    update(next: BackdropOptions = {}) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('mousedown', onDown);
      node.removeEventListener('click', onClick);
    },
  };
}
