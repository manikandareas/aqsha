import { describe, expect, it } from "vitest";
import { promptCommands } from "@aqsha/convex/prompt-commands";
import { parseMentionSegments } from "@/lib/context-refs";
import {
  createCommandChipElement,
  createContextChipElement,
  extractContextRefsFromEditor,
  promptCommandDisplayLabel,
  serializeComposerEditor,
  serializeComposerEditorWithMarkers,
} from "./composer-inline-editor";

describe("composer inline editor", () => {
  it("renders selected slash commands without the slash while preserving serialization", () => {
    const outline = promptCommands.find((command) => command.id === "outline");
    expect(outline).toBeTruthy();
    if (!outline) {
      return;
    }

    const chip = createCommandChipElement(outline);
    const root = document.createElement("div");
    root.append(chip, document.createTextNode(" topic"));

    expect(promptCommandDisplayLabel(outline)).toBe("outline");
    expect(chip.textContent).toBe("outline");
    expect(chip.dataset.slug).toBe("/outline");
    expect(chip.className).toContain("underline");
    expect(chip.className).toContain("decoration-primary");
    expect(serializeComposerEditor(root)).toBe("/outline topic");
  });

  it("keeps context pills out of the serialized text and extracts their refs", () => {
    const root = document.createElement("div");
    const workspaceChip = createContextChipElement({
      kind: "workspace",
      workspaceId: "ws_1",
      label: "@penelitian",
    });
    const paperChip = createContextChipElement({
      kind: "paper",
      workspaceId: "ws_1",
      artifactId: "art_1",
      label: "@penelitian:RAG",
    });
    root.append(
      workspaceChip,
      document.createTextNode(" "),
      paperChip,
      document.createTextNode(" bandingkan keduanya"),
    );

    // Context pills contribute nothing to the sent message text.
    expect(serializeComposerEditor(root).trim()).toBe("bandingkan keduanya");

    const refs = extractContextRefsFromEditor(root);
    expect(refs).toEqual([
      { kind: "workspace", workspaceId: "ws_1", label: "@penelitian" },
      {
        kind: "paper",
        workspaceId: "ws_1",
        artifactId: "art_1",
        label: "@penelitian:RAG",
      },
    ]);
  });

  it("keeps context pills as inline markers (in place) in the marked serialization", () => {
    const root = document.createElement("div");
    root.append(
      document.createTextNode("bandingkan ini "),
      createContextChipElement({
        kind: "workspace",
        workspaceId: "ws_1",
        label: "@penelitian",
      }),
    );

    // Clean serialization drops the pill; the marked one keeps it at its spot.
    expect(serializeComposerEditor(root).trim()).toBe("bandingkan ini");
    expect(parseMentionSegments(serializeComposerEditorWithMarkers(root))).toEqual([
      { type: "text", value: "bandingkan ini " },
      { type: "mention", label: "@penelitian" },
    ]);
  });
});
