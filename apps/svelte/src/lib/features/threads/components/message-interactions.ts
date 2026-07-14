import { createContext } from '$lib/context';

/**
 * Openers for the thread detail side panels, exposed to in-message cards (source / artifact /
 * sub-question / plan) without prop-drilling. `MessageList` provides the value from the thread panel
 * controller; this is the ONE place the shared message components couple to the panel controller.
 * Empty (all undefined) in compact chat panels where there is no detail slot — cards keep their
 * default behaviour there. Svelte port of `message-interactions.tsx` (React context → createContext).
 */
export type MessageInteractions = {
	openArtifact?: (artifactId: string) => void;
	/** All sources for one assistant message (the "Sumber" trigger). */
	openSources?: (messageId: string) => void;
	/** A `/deep` sub-question search step, scoped to its run (`turnId`). */
	openSearch?: (turnId: string, subQuestionIndex: number) => void;
	/** Any other expandable tool step by tool-call id (verify / counter-evidence / normal search). */
	openStep?: (toolCallId: string) => void;
	/** A run's research plan, scoped by `turnId` (or the live gate key). */
	openPlan?: (turnId: string) => void;
	/** A statistics run's results, scoped by `runKey`. */
	openStats?: (runKey: string) => void;
};

const messageInteractionsContext = createContext<MessageInteractions>('message-interactions');

export const setMessageInteractions = (value: MessageInteractions): MessageInteractions =>
	messageInteractionsContext.set(value);

/** Read the panel openers. Returns `{}` (all no-op) when no provider exists (compact panels). */
export function getMessageInteractions(): MessageInteractions {
	return messageInteractionsContext.getOptional() ?? {};
}
