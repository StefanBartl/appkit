// One explanation popup for the whole page. Any element with `data-hint="text"` gets it: on hover (after a short
// delay) and on keyboard focus. It can be reached with the pointer (it stays while the pointer is on it) and goes
// away with Escape, on scrolling and when the pointer or the focus leaves (WCAG 1.4.13). The text is set as text,
// never as markup.

/** What an app tells the popup: the name of its region, in the app's language (the kit has no words of its own). */
export interface TooltipOptions {
  regionLabel: () => string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the popup goes: below the element, above it when there is no room below, and kept inside the window.
 */
export function placeTip(
  anchor: Box,
  tip: { width: number; height: number },
  view: { width: number; height: number },
  gap = 6,
): { x: number; y: number } {
  let y = anchor.y + anchor.height + gap;
  if (y + tip.height > view.height && anchor.y - gap - tip.height >= 0) y = anchor.y - gap - tip.height;
  y = Math.max(0, Math.min(y, Math.max(0, view.height - tip.height)));
  const x = Math.max(0, Math.min(anchor.x, Math.max(0, view.width - tip.width)));
  return { x, y };
}

/** The pause before a popup shows on hover, and the one before it goes when the pointer left. */
export const SHOW_DELAY_MS = 300;
export const HIDE_DELAY_MS = 150;

export const TIP_ID = 'hint-tip';

/** The longest pause an element may ask for with `data-hint-delay`. */
export const MAX_DELAY_MS = 5000;

/** The pause of one element: its `data-hint-delay` when that is a number of milliseconds, else the default. */
export function hintDelay(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return SHOW_DELAY_MS;
  return Math.min(Number(raw), MAX_DELAY_MS);
}

/** What the `tooltip` action takes: a text, or a text with a title and a pause of its own (milliseconds). */
export type TooltipParams = string | { text: string; title?: string; delay?: number };

/** The `data-hint*` attributes of the params; an empty text gives none, so the element has no popup. */
export function hintAttributes(params: TooltipParams): Record<string, string> {
  const p = typeof params === 'string' ? { text: params } : params;
  if (p.text === '') return {};
  const attrs: Record<string, string> = { 'data-hint': p.text };
  if (p.title) attrs['data-hint-title'] = p.title;
  if (p.delay !== undefined && Number.isFinite(p.delay) && p.delay >= 0) {
    attrs['data-hint-delay'] = String(Math.floor(p.delay));
  }
  return attrs;
}

const HINT_ATTRIBUTES = ['data-hint', 'data-hint-title', 'data-hint-delay'];

// The action tells the popups that are installed when an element changed its hint or went away: a popup open for
// it would otherwise show the old text, or stay on the screen for an element that is no longer there (no focusout
// comes for a removed element).
type Change = (el: HTMLElement, gone: boolean) => void;
const watchers = new Set<Change>();
const notify = (el: HTMLElement, gone: boolean): void => watchers.forEach((w) => w(el, gone));

/**
 * Svelte action: `<button use:tooltip={t('save.hint')}>` or `use:tooltip={{ text, title, delay }}`. It only sets the
 * attributes the popup of `installTooltips` looks for, so the element must be reachable by keyboard (a button, a
 * link, or `tabindex="0"`) for the popup to show on focus.
 */
export function tooltip(node: HTMLElement, params: TooltipParams): { update(next: TooltipParams): void; destroy(): void } {
  const apply = (p: TooltipParams): void => {
    for (const name of HINT_ATTRIBUTES) node.removeAttribute(name);
    for (const [name, value] of Object.entries(hintAttributes(p))) node.setAttribute(name, value);
  };
  apply(params);
  return {
    update: (next) => {
      apply(next);
      notify(node, false);
    },
    destroy: () => {
      for (const name of HINT_ATTRIBUTES) node.removeAttribute(name);
      notify(node, true);
    },
  };
}

/** Join an id into a space separated list (`aria-describedby`) and take it out again. */
export function withToken(list: string | null, token: string): string {
  const tokens = (list ?? '').split(/\s+/).filter(Boolean);
  return (tokens.includes(token) ? tokens : [...tokens, token]).join(' ');
}
export function withoutToken(list: string | null, token: string): string {
  return (list ?? '')
    .split(/\s+/)
    .filter((t) => t !== '' && t !== token)
    .join(' ');
}

/** Install the popup on a document. Returns a function that takes it away again. */
export function installTooltips(
  doc: Document,
  win: Window & typeof globalThis,
  options: TooltipOptions,
): () => void {
  // The popup lives in a region of its own that is there only while a hint is open: content outside every
  // landmark is a finding of its own, and an always present empty region would be noise for a screen reader.
  const host = doc.createElement('div');
  host.className = 'hint-host';
  host.setAttribute('role', 'region');
  host.hidden = true;
  const tip = doc.createElement('div');
  tip.id = TIP_ID;
  tip.className = 'hint-tip';
  tip.setAttribute('role', 'tooltip');
  // Closed from the start: `tip.hidden` is what the Escape key and the hide timers ask, and a popup that never
  // opened must not take the Escape of a dialog or a menu.
  tip.hidden = true;
  host.appendChild(tip);
  doc.body.appendChild(host);
  // The name of the region is the app's word (its dictionary): the kit has none, so the app must give one.
  const regionLabel = options.regionLabel;

  let current: HTMLElement | null = null;
  let describedBefore: string | null = null;
  let viaFocus = false;
  // The button of the mouse is down: the focus that comes with it is the press, not the keyboard.
  let pressing = false;
  let showTimer: number | undefined;
  let hideTimer: number | undefined;

  const hintOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof win.Element ? target.closest<HTMLElement>('[data-hint]') : null;

  // A timer that is replaced is stopped first: a lost timer would still fire and take the popup away (or the
  // pending show of the next element) under the pointer.
  function cancelShow(): void {
    win.clearTimeout(showTimer);
    showTimer = undefined;
  }
  function cancelHide(): void {
    win.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  function scheduleHide(): void {
    cancelHide();
    hideTimer = win.setTimeout(hide, HIDE_DELAY_MS);
  }

  /** The element describes itself (`Info.svelte` keeps the text in the page): the popup adds nothing to it. */
  const ownsDescription = (el: HTMLElement): boolean => el.hasAttribute('data-hint-own');

  function hide(): void {
    cancelShow();
    cancelHide();
    if (current && !ownsDescription(current)) {
      // Only what this popup added is taken away: a description the element had of its own stays.
      const rest = withoutToken(current.getAttribute('aria-describedby'), TIP_ID);
      if (rest === '' && describedBefore === null) current.removeAttribute('aria-describedby');
      else current.setAttribute('aria-describedby', rest);
    }
    current = null;
    viaFocus = false;
    tip.hidden = true;
    host.hidden = true;
    if (host.parentElement !== doc.body) doc.body.appendChild(host);
  }

  function place(el: HTMLElement): void {
    const anchor = el.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const at = placeTip(
      { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height },
      { width: size.width, height: size.height },
      { width: win.innerWidth, height: win.innerHeight },
    );
    tip.style.left = `${at.x}px`;
    tip.style.top = `${at.y}px`;
  }

  function show(el: HTMLElement, byFocus: boolean): void {
    const text = el.dataset.hint ?? '';
    if (text === '') return hide();
    if (current && current !== el) hide();
    // The same element again (hovered, then clicked and focused): what it described before is not read anew,
    // or the popup's own id would count as the element's.
    if (current !== el) describedBefore = el.getAttribute('aria-describedby');
    current = el;
    viaFocus = viaFocus || byFocus;
    tip.replaceChildren();
    const title = el.dataset.hintTitle ?? '';
    if (title !== '') {
      const heading = doc.createElement('strong');
      heading.className = 'hint-title';
      heading.textContent = title;
      tip.appendChild(heading);
    }
    tip.appendChild(doc.createTextNode(text));
    host.setAttribute('aria-label', regionLabel());
    // A modal dialog lies in the top layer and makes the rest of the page inert: a popup in the body would be behind it
    // and could not be reached with the pointer. While a hint of the dialog is open the popup lives in the dialog.
    const parent = el.closest('dialog') ?? doc.body;
    if (host.parentElement !== parent) parent.appendChild(host);
    host.hidden = false;
    tip.hidden = false;
    if (!ownsDescription(el)) el.setAttribute('aria-describedby', withToken(describedBefore, TIP_ID));
    place(el);
  }

  const onOver = (e: Event): void => {
    if (e.target instanceof win.Node && tip.contains(e.target)) {
      cancelHide();
      return;
    }
    const el = hintOf(e.target);
    if (!el) {
      cancelShow();
      if (!tip.hidden) scheduleHide();
      return;
    }
    cancelHide();
    if (el === current) return;
    cancelShow();
    showTimer = win.setTimeout(() => show(el, false), hintDelay(el.dataset.hintDelay));
  };
  const onOut = (e: Event): void => {
    cancelShow();
    if (!tip.hidden && (hintOf(e.target) || (e.target instanceof win.Node && tip.contains(e.target)))) {
      scheduleHide();
    }
  };
  // A press of the mouse focuses what it hits, and the browser may scroll it into view while it does: a popup shown by that
  // focus would be placed for the element before the scroll and lie under the pointer, where it catches the click. A press
  // shows no popup; the pointer resting on the element does (hover), and the keyboard focus does at once.
  const onDown = (): void => {
    pressing = true;
  };
  const onUp = (): void => {
    pressing = false;
  };
  const onFocusIn = (e: Event): void => {
    if (pressing) return;
    const el = hintOf(e.target);
    if (el) show(el, true);
  };
  const onFocusOut = (): void => hide();
  // A tap shows the popup at once: a touch screen has no hover to wait for, and not every browser focuses what is
  // tapped (a button on iOS). A click with a mouse or the keyboard does not: hover and focus did it already.
  const onClick = (e: Event): void => {
    if ((e as PointerEvent).pointerType !== 'touch') return;
    const el = hintOf(e.target);
    if (el) {
      cancelShow();
      show(el, false);
    } else hide();
  };
  const onChange: Change = (el, gone) => {
    if (el !== current) return;
    if (gone || (el.dataset.hint ?? '') === '') hide();
    else show(el, viaFocus);
  };
  watchers.add(onChange);
  const onKey = (e: KeyboardEvent): void => {
    // A key after a press that never got its release (the button was let go outside the window) is the keyboard again.
    pressing = false;
    // The popup is closed by this Escape and by nothing else: it is not also the Escape of a dialog or a menu. A
    // modal dialog closes on Escape by its own default action (`cancel`), which `stopPropagation` does not stop.
    if (e.key === 'Escape' && !tip.hidden) {
      hide();
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onScroll = (): void => {
    if (tip.hidden) return;
    // The browser scrolls a focused element into view after `focusin`: the popup follows it. A scroll with the
    // pointer takes the popup away (it would stand where the element no longer is).
    if (viaFocus && current) place(current);
    else hide();
  };

  doc.addEventListener('mouseover', onOver);
  doc.addEventListener('mouseout', onOut);
  doc.addEventListener('mousedown', onDown, true);
  doc.addEventListener('mouseup', onUp, true);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('click', onClick);
  doc.addEventListener('scroll', onScroll, true);
  return () => {
    hide();
    watchers.delete(onChange);
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('mouseover', onOver);
    doc.removeEventListener('mouseout', onOut);
    doc.removeEventListener('mousedown', onDown, true);
    doc.removeEventListener('mouseup', onUp, true);
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('focusout', onFocusOut);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('scroll', onScroll, true);
    host.remove();
  };
}
