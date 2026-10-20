// The kit as one module. The Svelte components are imported by their file (`appkit-ui/MenuBar.svelte`), so that an
// app takes only what it uses; the styles are `appkit-ui/tokens.css` and `appkit-ui/base.css`.

export {
  ago,
  fill,
  formatNumber,
  hintOf,
  kitTexts,
  labelOf,
  lookup,
  pickLang,
  type AgoKey,
  type Dictionary,
  type KitKey,
} from './i18n';
export {
  defaultKeymap,
  matches,
  resolveKey,
  withChord,
  type ChordState,
  type Command,
  type KeyPress,
  type KeyResult,
  type Keymap,
} from './keymap';
export {
  ariaShortcut,
  letterOfCode,
  menuForMnemonic,
  splitMnemonic,
  toBlocks,
  TYPE_AHEAD_MS,
  typeAheadIndex,
  type Menu,
  type MenuBlock,
  type MenuItem,
} from './menu';
export {
  ACTION_PREFIX,
  bumped,
  frecencyBonus,
  FRECENCY_MAX,
  matchScore,
  PALETTE_LIMIT,
  paletteItems,
  parseFrecency,
  stepIndex,
  wordScore,
  type Frecency,
  type PaletteAction,
  type PaletteEntry,
  type PaletteItem,
  type PaletteOptions,
} from './palette';
export type { ToastKind, ToastMessage } from './toast';
export { hostOf, MAX_SOURCE, parseMarkdown, safeHref, type Block, type Inline } from './markdown';
export { installNav, type Nav, type NavHistory, type NavOptions, type NavWindow } from './nav';
export { takePairingCode, type HistoryLike, type LocationLike } from './pair';
export {
  backoffSeconds,
  IDLE_MS,
  MAX_BUFFER,
  readStream,
  SseParser,
  StreamRefused,
  type SseMessage,
  type StreamHandlers,
} from './sse';
export { hasHidden, markHidden } from './text';
export {
  HIDE_DELAY_MS,
  hintAttributes,
  hintDelay,
  installTooltips,
  MAX_DELAY_MS,
  placeTip,
  SHOW_DELAY_MS,
  TIP_ID,
  tooltip,
  withoutToken,
  withToken,
  type Box,
  type TooltipOptions,
  type TooltipParams,
} from './tooltip';
