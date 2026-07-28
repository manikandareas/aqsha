import {
	mastraMessagesToTimeline as mapMessages,
	reduceMastraChunk as reduceChunk,
	type MastraChunk,
	type MastraTimelineState
} from '@aqsha/chat-core/timeline';

export * from '@aqsha/chat-core/timeline';

const projectTimelineOptions = { documentProposals: true } as const;

export const mastraMessagesToTimeline = (
	messages: Parameters<typeof mapMessages>[0]
): ReturnType<typeof mapMessages> => mapMessages(messages, projectTimelineOptions);

export const reduceMastraChunk = (
	state: MastraTimelineState,
	chunk: MastraChunk
): MastraTimelineState => reduceChunk(state, chunk, projectTimelineOptions);
