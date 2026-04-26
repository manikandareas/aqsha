export type AgentSseFrame = {
  event: string;
  data: unknown;
};

function parseFrame(frame: string): AgentSseFrame | null {
  const lines = frame.split(/\r?\n/);
  const event =
    lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim() || "message";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return {
    event,
    data: JSON.parse(data),
  };
}

export async function* readAgentEventStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentSseFrame> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const parsed = parseFrame(frame);

      if (parsed) {
        yield parsed;
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseFrame(buffer);

    if (parsed) {
      yield parsed;
    }
  }
}
