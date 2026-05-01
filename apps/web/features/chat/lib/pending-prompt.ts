const pendingPromptPrefix = "aqsha:chat:pending-prompt:";

export function pendingPromptKey(threadId: string): string {
  return `${pendingPromptPrefix}${threadId}`;
}
