import { describe, expect, it } from "vitest";
import { promptCommands } from "@aqsha/convex/prompt-commands";
import {
  createCommandChipElement,
  promptCommandDisplayLabel,
  serializeComposerEditor,
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
});
