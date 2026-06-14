import { describe, expect, it } from "vitest";
import {
  artifactTypeLabel,
  formatArtifactYear,
  provenanceLabel,
} from "./artifact-presentation";

describe("artifactTypeLabel", () => {
  it("maps each known artifact type to its sentence-case label", () => {
    expect(artifactTypeLabel("url")).toBe("URL");
    expect(artifactTypeLabel("pdf")).toBe("PDF");
    expect(artifactTypeLabel("docx")).toBe("DOCX");
    expect(artifactTypeLabel("html")).toBe("HTML");
    expect(artifactTypeLabel("svg")).toBe("SVG");
    expect(artifactTypeLabel("mermaid")).toBe("Mermaid");
    expect(artifactTypeLabel("json")).toBe("JSON");
    expect(artifactTypeLabel("csv")).toBe("CSV");
    expect(artifactTypeLabel("code")).toBe("Code");
    expect(artifactTypeLabel("plain_text")).toBe("Text");
  });

  it("falls back to Markdown for markdown / unknown / undefined", () => {
    expect(artifactTypeLabel("markdown")).toBe("Markdown");
    expect(artifactTypeLabel("something-new")).toBe("Markdown");
    expect(artifactTypeLabel(undefined)).toBe("Markdown");
  });
});

describe("provenanceLabel", () => {
  it("only labels agent + manual outputs, never upload/url", () => {
    expect(provenanceLabel("agent")).toBe("Agent");
    expect(provenanceLabel("manual")).toBe("Catatan");
    expect(provenanceLabel("upload")).toBeNull();
    expect(provenanceLabel("url")).toBeNull();
    expect(provenanceLabel(undefined)).toBeNull();
  });
});

describe("formatArtifactYear", () => {
  it("renders the four-digit year of a timestamp", () => {
    const ts = Date.UTC(2026, 5, 14);
    expect(formatArtifactYear(ts)).toBe("2026");
  });

  it("renders a placeholder for a non-finite timestamp", () => {
    expect(formatArtifactYear(Number.NaN)).toBe("----");
  });
});
