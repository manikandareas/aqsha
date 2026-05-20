import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
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
});
