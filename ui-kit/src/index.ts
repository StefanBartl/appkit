// The kit as one module. The Svelte components are imported by their file (`appkit-ui/MenuBar.svelte`), so that an
// app takes only what it uses; the styles are `appkit-ui/tokens.css` and `appkit-ui/base.css`.

export { fill, pickLang } from './i18n';
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
  installTooltips,
  placeTip,
  SHOW_DELAY_MS,
  TIP_ID,
  withoutToken,
  withToken,
  type Box,
  type TooltipOptions,
} from './tooltip';
