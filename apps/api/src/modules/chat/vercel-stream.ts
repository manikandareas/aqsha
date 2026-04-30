import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessage,
  type UIMessageChunk,
} from "ai";

export async function collectFinishedMessages(
  stream: ReadableStream<Uint8Array>,
  originalMessages: UIMessage[],
): Promise<UIMessage[]> {
  let lastMessage: UIMessage | undefined;

  const chunkStream = parseJsonEventStream({
    stream,
    schema: uiMessageChunkSchema,
  }).pipeThrough(
    new TransformStream<{ success: true; value: UIMessageChunk } | { success: false; error: unknown }, UIMessageChunk>({
      transform(chunk, controller) {
        if (!chunk.success) {
          throw chunk.error;
        }

        controller.enqueue(chunk.value);
      },
    }),
  );

  for await (const message of readUIMessageStream({ stream: chunkStream })) {
    lastMessage = message;
  }

  return lastMessage ? [...originalMessages, lastMessage] : originalMessages;
}
