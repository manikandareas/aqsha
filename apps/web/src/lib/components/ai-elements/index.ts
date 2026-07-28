// Svelte Streamdown adapter + AI message render primitives. Table/code chrome is provided natively
// by svelte-streamdown (its built-in `TableDownload` / code copy controls), so custom table/code
// chrome is superseded (library-first).

export { default as Response } from './Response.svelte';
export { default as Reasoning } from './Reasoning.svelte';
export { default as InlineCitation } from './InlineCitation.svelte';
export { default as DeepVizFigure } from './DeepVizFigure.svelte';
export { default as StatsVizFigure } from './StatsVizFigure.svelte';
export { aqshaMarkdownExtensions } from './markdown-extensions';
export { createNumberer, type VizFigureAssign, type StatsVizContextValue } from './contexts';

// Conversation viewport / anchoring.
export { default as Conversation } from './Conversation.svelte';
export { default as ConversationContent } from './ConversationContent.svelte';
export { default as ConversationScrollButton } from './ConversationScrollButton.svelte';
export { default as ConversationEmptyState } from './ConversationEmptyState.svelte';
export { StickToBottom, getStickToBottom } from './conversation-state.svelte';
export { scrollToMessage } from '$lib/features/threads/lib/scroll-to-message';
