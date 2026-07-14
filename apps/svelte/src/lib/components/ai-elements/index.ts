// THC-6 — Svelte Streamdown adapter + AI message render primitives (port of
// `apps/web/components/ai-elements/**`). Table/code chrome is provided natively by svelte-streamdown
// (its built-in `TableDownload` / code copy controls), so the React `TableBlock`/`CodeBlock` custom
// chrome is superseded (library-first, §3.3) — documented in the Phase 6 decision record.

export { default as Response } from './Response.svelte';
export { default as Reasoning } from './Reasoning.svelte';
export { default as InlineCitation } from './InlineCitation.svelte';
export { default as DeepVizFigure } from './DeepVizFigure.svelte';
export { default as StatsVizFigure } from './StatsVizFigure.svelte';
export { aqshaMarkdownExtensions } from './markdown-extensions';
export { createNumberer, type VizFigureAssign, type StatsVizContextValue } from './contexts';

// THC-7 — conversation viewport / anchoring.
export { default as Conversation } from './Conversation.svelte';
export { default as ConversationContent } from './ConversationContent.svelte';
export { default as ConversationScrollButton } from './ConversationScrollButton.svelte';
export { default as ConversationEmptyState } from './ConversationEmptyState.svelte';
export { StickToBottom, getStickToBottom } from './conversation-state.svelte';
export { scrollToMessage } from '$lib/features/threads/lib/scroll-to-message';
