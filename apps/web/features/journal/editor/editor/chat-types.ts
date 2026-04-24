import type { UIMessage } from "ai";

export type ToolName = "comment" | "edit" | "generate";

/** Broad message shape for Plate AI streams (text + custom data parts). */
export type ChatMessage = UIMessage;
