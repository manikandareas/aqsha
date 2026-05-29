import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  artifactFamilyForType,
  artifactTypeFromAgentInput,
  artifactTypeFromUpload,
  contextFromText,
  normalizeUrl,
  previewFromText,
  siteNameFromUrl,
  titleFromUrl,
} from "../convex/artifactModel";

describe("workspace artifact model helpers", () => {
  it("normalizes http URLs for workspace-level idempotency", () => {
    expect(normalizeUrl(" HTTPS://Example.COM:443/path?q=1#section ")).toBe(
      "https://example.com/path?q=1",
    );
    expect(normalizeUrl("http://Example.com:80/a#x")).toBe("http://example.com/a");
  });

  it("rejects unsupported URL protocols", () => {
    expect(() => normalizeUrl("ftp://example.com/file")).toThrow(ConvexError);
    expect(() => normalizeUrl("not a url")).toThrow(ConvexError);
  });

  it("bounds previews and context text for list and future context use", () => {
    const long = `Title\n\n${"word ".repeat(8_000)}`;
    expect(previewFromText(long)).toHaveLength(280);
    expect(contextFromText(long).length).toBeLessThanOrEqual(24_000);
    expect(previewFromText("  A\n\nB  ")).toBe("A B");
  });

  it("derives a readable fallback title from the URL path or host", () => {
    expect(titleFromUrl("https://example.com/research-paper_v1")).toBe("research paper v1");
    expect(titleFromUrl("https://example.com/")).toBe("example.com");
  });

  it("derives a compact site name from URLs", () => {
    expect(siteNameFromUrl("https://www.example.com/research")).toBe("example.com");
    expect(siteNameFromUrl("https://docs.example.org/page")).toBe("docs.example.org");
  });

  it("detects upload artifact type from MIME type and extension", () => {
    expect(artifactTypeFromUpload({ fileName: "paper.pdf", mimeType: "" })).toBe("pdf");
    expect(artifactTypeFromUpload({ fileName: "paper", mimeType: "application/pdf" })).toBe("pdf");
    expect(
      artifactTypeFromUpload({
        fileName: "draft.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("docx");
    expect(artifactTypeFromUpload({ fileName: "diagram.mermaid", mimeType: "" })).toBe("mermaid");
    expect(artifactTypeFromUpload({ fileName: "component.tsx", mimeType: "" })).toBe("code");
  });

  it("maps artifact types to families", () => {
    expect(artifactFamilyForType("markdown")).toBe("text");
    expect(artifactFamilyForType("pdf")).toBe("file");
    expect(artifactFamilyForType("html")).toBe("interactive");
    expect(artifactFamilyForType("svg")).toBe("visual");
    expect(artifactFamilyForType("json")).toBe("data");
    expect(artifactFamilyForType("url")).toBe("link");
  });

  it("rejects non-writable agent artifact types", () => {
    expect(artifactTypeFromAgentInput("html")).toBe("html");
    expect(() => artifactTypeFromAgentInput("pdf")).toThrow(ConvexError);
    expect(() => artifactTypeFromAgentInput("url")).toThrow(ConvexError);
  });
});
