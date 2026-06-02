import { describe, expect, it } from "vitest";
import {
  isUsableGeneratedThreadTitle,
  normalizeGeneratedThreadTitle,
  shouldUsePromptTitle,
  threadTitleFromPrompt,
} from "../convex/agent/threadTitles";

describe("thread title defaults", () => {
  it("uses the first user prompt as the default title", () => {
    expect(threadTitleFromPrompt(" Jelaskan RAG untuk pendidikan tinggi ")).toBe(
      "Jelaskan RAG untuk pendidikan tinggi",
    );
  });

  it("collapses whitespace before storing the title", () => {
    expect(threadTitleFromPrompt("Apa itu\n\nConvex Agent\tuntuk riset?")).toBe(
      "Apa itu Convex Agent untuk riset?",
    );
  });

  it("truncates long prompts to the thread title limit", () => {
    const title = threadTitleFromPrompt(
      "Buat analisis mendalam tentang efektivitas retrieval augmented generation untuk pembelajaran adaptif di universitas",
    );

    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("...")).toBe(true);
    expect(title).toBe(
      "Buat analisis mendalam tentang efektivitas retrieval augmented generation...",
    );
  });

  it("only replaces empty legacy titles", () => {
    expect(shouldUsePromptTitle(undefined)).toBe(true);
    expect(shouldUsePromptTitle("Thread baru")).toBe(true);
    expect(shouldUsePromptTitle("Judul lama")).toBe(false);
  });

  it("normalizes generated titles before storing them", () => {
    expect(normalizeGeneratedThreadTitle('"Analisis RAG untuk Pendidikan"')).toBe(
      "Analisis RAG untuk Pendidikan",
    );
  });

  it("rejects generic title generation labels", () => {
    expect(isUsableGeneratedThreadTitle("Request for Thread Title Generation")).toBe(
      false,
    );
    expect(isUsableGeneratedThreadTitle("Analisis RAG untuk Pendidikan")).toBe(
      true,
    );
  });
});
