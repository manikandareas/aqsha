export type BlockNoteBlockLike = {
  type?: string;
  content?: unknown;
  children?: BlockNoteBlockLike[];
};

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed";

export type AutosaveState = {
  status: AutosaveStatus;
  lastSavedJson: string;
  pendingJson: string;
  error: string | null;
};

export type AutosaveEvent =
  | { type: "reset"; json: string }
  | { type: "changed"; json: string }
  | { type: "saving" }
  | { type: "saved"; json: string }
  | { type: "failed"; message: string };

export function parseBlockNoteJson(value: string | undefined | null): BlockNoteBlockLike[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as BlockNoteBlockLike[]) : [];
  } catch {
    return [];
  }
}

export function blockNotePlainText(blocks: BlockNoteBlockLike[]) {
  return blocks
    .flatMap((block) => {
      const text = blockPlainText(block);
      return text ? [text] : [];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function autosaveReducer(state: AutosaveState, event: AutosaveEvent): AutosaveState {
  switch (event.type) {
    case "reset":
      return {
        status: "idle",
        lastSavedJson: event.json,
        pendingJson: event.json,
        error: null,
      };
    case "changed":
      if (event.json === state.lastSavedJson) {
        return { ...state, status: "saved", pendingJson: event.json, error: null };
      }
      return { ...state, status: "dirty", pendingJson: event.json, error: null };
    case "saving":
      return { ...state, status: "saving", error: null };
    case "saved": {
      const stillDirty = state.pendingJson !== event.json;
      return {
        status: stillDirty ? "dirty" : "saved",
        lastSavedJson: event.json,
        pendingJson: state.pendingJson,
        error: null,
      };
    }
    case "failed":
      return { ...state, status: "failed", error: event.message };
  }
}

function blockPlainText(block: BlockNoteBlockLike): string {
  const ownText = contentText(block.content);
  const childText = (block.children ?? [])
    .flatMap((child) => {
      const text = blockPlainText(child);
      return text ? [text] : [];
    })
    .join("\n");
  return [ownText, childText].flatMap((text) => (text ? [text] : [])).join("\n");
}

function contentText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item) {
        const text = (item as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("")
    .trim();
}
