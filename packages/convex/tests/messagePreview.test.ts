import { describe, expect, it } from "vitest";
import { messagePreview } from "../convex/agent/service/model";

// A lone UTF-16 surrogate is an invalid Unicode string that Convex refuses to
// store ("Received invalid json: unexpected end of hex escape"). The preview
// truncation must never split a surrogate pair at the cut boundary.
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1; // valid pair — skip the low surrogate
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true; // lone low surrogate
    }
  }
  return false;
}

describe("messagePreview", () => {
  it("does not split a surrogate pair at the truncation boundary", () => {
    // 158 ASCII chars, then an emoji (surrogate pair) straddling index 159.
    const text = `${"a".repeat(158)}😀${"b".repeat(50)}`;
    const preview = messagePreview(text);
    expect(hasLoneSurrogate(preview)).toBe(false);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("keeps a whole emoji that fits before the boundary", () => {
    const text = `${"a".repeat(100)}😀${"b".repeat(200)}`;
    const preview = messagePreview(text);
    expect(hasLoneSurrogate(preview)).toBe(false);
    expect(preview).toContain("😀");
  });

  it("returns short text unchanged", () => {
    expect(messagePreview("  hai   dunia ")).toBe("hai dunia");
  });
});
