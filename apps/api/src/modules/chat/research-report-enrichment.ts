import type { UIMessage } from "ai";
import { deepResearchReportSchema } from "../../agents/subagents/schemas";
import { urlNormalize } from "../memory/url-hash";
import type { ChatSource } from "./store";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * After Astra finishes a research-mode run, the last assistant message contains a
 * JSON-serialized `deepResearchReport`. We:
 *   1. detect & parse the structured payload from the message text-parts,
 *   2. resolve `chatSourceId` for each bibliography entry by URL match against
 *      the thread's persisted `chat_sources`, and
 *   3. attach the enriched report to `message.metadata.deepResearchReport`.
 *
 * If the message does not contain a valid report, the messages are returned
 * unchanged.
 */
export function enrichDeepResearchReports(
  messages: UIMessage[],
  sources: ChatSource[],
): UIMessage[] {
  if (messages.length === 0) return messages;

  const lastIndex = findLastAssistantIndex(messages);
  if (lastIndex < 0) return messages;
  const lastMessage = messages[lastIndex]!;

  const text = collectTextParts(lastMessage);
  if (!text) return messages;

  const candidate = extractJsonObject(text);
  if (!candidate) return messages;

  const parsed = deepResearchReportSchema.safeParse(candidate);
  if (!parsed.success) return messages;

  const urlIndex = buildUrlIndex(sources);
  const enrichedBibliography = parsed.data.bibliography.map((entry) => ({
    ...entry,
    chatSourceId: entry.chatSourceId ?? urlIndex.get(urlNormalize(entry.url)) ?? null,
  }));

  const report = { ...parsed.data, bibliography: enrichedBibliography };

  const existingMetadata =
    typeof lastMessage.metadata === "object" && lastMessage.metadata !== null
      ? (lastMessage.metadata as Record<string, unknown>)
      : {};

  const enrichedMessage: Mutable<UIMessage> = {
    ...lastMessage,
    metadata: {
      ...existingMetadata,
      deepResearchReport: report,
    },
  };

  const next = [...messages];
  next[lastIndex] = enrichedMessage as UIMessage;
  return next;
}

function findLastAssistantIndex(messages: UIMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

function collectTextParts(message: UIMessage): string {
  const parts = message.parts ?? [];
  const buf: string[] = [];
  for (const part of parts) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      buf.push((part as { text: string }).text);
    }
  }
  return buf.join("").trim();
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const candidates: string[] = [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    candidates.push(trimmed);
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  if (fenceMatch?.[1]) candidates.push(fenceMatch[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "executiveSummary" in parsed &&
        "sections" in parsed &&
        "bibliography" in parsed
      ) {
        return parsed;
      }
    } catch {
      // try next
    }
  }
  return null;
}

function buildUrlIndex(sources: ChatSource[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const source of sources) {
    if (source.kind !== "url" || !source.url) continue;
    const key = urlNormalize(source.url);
    if (!map.has(key)) {
      map.set(key, source.id);
    }
  }
  return map;
}
