import { describe, expect, it } from "vitest";
import { firstReasoningParagraph } from "./reasoning";

describe("firstReasoningParagraph", () => {
  it("returns a single-paragraph trace whole", () => {
    expect(firstReasoningParagraph("Satu paragraf saja.")).toBe(
      "Satu paragraf saja.",
    );
  });

  it("cuts a multi-paragraph trace to its opening paragraph", () => {
    const text = "Paragraf pertama.\n\nParagraf kedua.\n\nParagraf ketiga.";
    expect(firstReasoningParagraph(text)).toBe("Paragraf pertama.");
  });

  it("keeps single line breaks inside the first paragraph", () => {
    const text = "Baris satu\nBaris dua\n\nParagraf kedua.";
    expect(firstReasoningParagraph(text)).toBe("Baris satu\nBaris dua");
  });

  it("treats a blank line with surrounding whitespace as the break", () => {
    const text = "Pertama.\n   \nKedua.";
    expect(firstReasoningParagraph(text)).toBe("Pertama.");
  });

  it("trims leading and trailing whitespace", () => {
    expect(firstReasoningParagraph("  \n\nIsi.\n\n")).toBe("Isi.");
  });

  it("returns an empty string for blank input", () => {
    expect(firstReasoningParagraph("   \n\n  ")).toBe("");
    expect(firstReasoningParagraph("")).toBe("");
  });
});
