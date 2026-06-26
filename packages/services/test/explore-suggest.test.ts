import { describe, expect, test } from "bun:test";
import { parseSuggestions } from "../src/explore/suggest";

describe("parseSuggestions", () => {
  test("buang bullet/nomor/kutip, dedupe, cap 6", () => {
    const raw = [
      "1. Agentic RAG untuk riset",
      "- agentic rag untuk riset", // dup (case-insensitive)
      '"Tool-use benchmark 2024"',
      "• Memory pada agen LLM",
      "",
      "x", // terlalu pendek
      "a", "b", "c", "d", "e", "f", "g", // pastikan cap
    ].join("\n");
    const out = parseSuggestions(raw);
    expect(out[0]).toBe("Agentic RAG untuk riset");
    expect(out).toContain("Tool-use benchmark 2024");
    expect(out).toContain("Memory pada agen LLM");
    expect(out.length).toBeLessThanOrEqual(6);
    // dedupe: hanya satu "agentic rag untuk riset"
    expect(out.filter((s) => s.toLowerCase() === "agentic rag untuk riset").length).toBe(1);
  });
});
