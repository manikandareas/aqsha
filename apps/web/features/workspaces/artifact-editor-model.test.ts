import { describe, expect, it } from "vitest";
import {
  autosaveReducer,
  blockNotePlainText,
  parseBlockNoteJson,
  type AutosaveState,
} from "./utils/artifact-editor-model";

describe("artifact editor model", () => {
  it("parses valid BlockNote JSON and ignores invalid payloads", () => {
    expect(parseBlockNoteJson('[{"type":"paragraph","content":"A"}]')).toHaveLength(1);
    expect(parseBlockNoteJson("{bad json")).toEqual([]);
    expect(parseBlockNoteJson('{"type":"paragraph"}')).toEqual([]);
  });

  it("derives plain text from nested BlockNote blocks", () => {
    expect(
      blockNotePlainText([
        {
          type: "paragraph",
          content: [{ type: "text", text: "Parent" }],
          children: [
            {
              type: "bulletListItem",
              content: [{ type: "text", text: "Child" }],
            },
          ],
        },
        { type: "paragraph", content: "Tail" },
      ]),
    ).toBe("Parent\nChild\nTail");
  });

  it("models autosave transitions", () => {
    const initial: AutosaveState = {
      status: "idle",
      lastSavedJson: "[]",
      pendingJson: "[]",
      error: null,
    };
    const dirty = autosaveReducer(initial, { type: "changed", json: "[1]" });
    expect(dirty.status).toBe("dirty");
    const saving = autosaveReducer(dirty, { type: "saving" });
    expect(saving.status).toBe("saving");
    const saved = autosaveReducer(saving, { type: "saved", json: "[1]" });
    expect(saved.status).toBe("saved");
    const editedWhileSaving = autosaveReducer(saving, { type: "changed", json: "[1,2]" });
    const savedStale = autosaveReducer(editedWhileSaving, { type: "saved", json: "[1]" });
    expect(savedStale).toMatchObject({
      status: "dirty",
      lastSavedJson: "[1]",
      pendingJson: "[1,2]",
    });
    const failed = autosaveReducer(saved, { type: "failed", message: "offline" });
    expect(failed).toMatchObject({ status: "failed", error: "offline" });
  });
});
