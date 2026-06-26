import { AppError } from "@aqsha/db";
import { describe, expect, test } from "bun:test";
import {
  ARTIFACT_BODY_INLINE_LIMIT,
  artifactFamilyForType,
  MAX_UPLOAD_BYTES,
  normalizeUrl,
  previewFromText,
  siteNameFromUrl,
  titleFromUrl,
  uploadArtifactType,
  validateUpload,
} from "../src/artifacts/model";

/** Tangkap throw, pastikan AppError, kembalikan code. */
async function appErrorCode(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
  throw new Error("expected throw");
}

describe("normalizeUrl", () => {
  test("strip hash, lowercase host, strip default port; keep query + trailing slash", () => {
    expect(normalizeUrl("HTTPS://Example.com:443/Path/?a=1#frag")).toBe(
      "https://example.com/Path/?a=1",
    );
    expect(normalizeUrl("http://Example.com:80/x")).toBe("http://example.com/x");
    expect(normalizeUrl("https://example.com/a/")).toBe("https://example.com/a/");
  });

  test("invalid + non-http rejected", async () => {
    expect(await appErrorCode(() => normalizeUrl("not a url"))).toBe("url_invalid");
    expect(await appErrorCode(() => normalizeUrl("ftp://example.com"))).toBe("url_protocol_invalid");
  });
});

describe("upload validation", () => {
  test("validateUpload accepts allowed doc types", () => {
    expect(validateUpload({ fileName: "paper.pdf", mimeType: "application/pdf", size: 100 })).toBe(
      "pdf",
    );
    expect(validateUpload({ fileName: "notes.md", mimeType: "", size: 5 })).toBe("markdown");
    expect(validateUpload({ fileName: "data.csv", mimeType: "text/csv", size: 5 })).toBe("csv");
  });

  test("validateUpload rejects bad name/size/type", async () => {
    expect(
      await appErrorCode(() => validateUpload({ fileName: "  ", mimeType: "application/pdf", size: 5 })),
    ).toBe("upload_filename_required");
    expect(
      await appErrorCode(() => validateUpload({ fileName: "a.pdf", mimeType: "application/pdf", size: 0 })),
    ).toBe("upload_empty");
    expect(
      await appErrorCode(() =>
        validateUpload({ fileName: "a.pdf", mimeType: "application/pdf", size: MAX_UPLOAD_BYTES + 1 }),
      ),
    ).toBe("upload_too_large");
    expect(
      await appErrorCode(() => validateUpload({ fileName: "x.svg", mimeType: "image/svg+xml", size: 5 })),
    ).toBe("upload_unsupported_type");
  });

  test("uploadArtifactType narrow allow-list rejects detectable-but-disallowed", async () => {
    expect(uploadArtifactType({ fileName: "a.docx", mimeType: "" })).toBe("docx");
    expect(await appErrorCode(() => uploadArtifactType({ fileName: "a.py", mimeType: "" }))).toBe(
      "upload_unsupported_type",
    );
    expect(await appErrorCode(() => uploadArtifactType({ fileName: "a.html", mimeType: "text/html" }))).toBe(
      "upload_unsupported_type",
    );
  });
});

describe("pure mappings", () => {
  test("artifactFamilyForType special-cases code→text, json→data, url→link", () => {
    expect(artifactFamilyForType("code")).toBe("text");
    expect(artifactFamilyForType("json")).toBe("data");
    expect(artifactFamilyForType("csv")).toBe("data");
    expect(artifactFamilyForType("url")).toBe("link");
    expect(artifactFamilyForType("pdf")).toBe("file");
    expect(artifactFamilyForType("markdown")).toBe("text");
    expect(artifactFamilyForType("svg")).toBe("visual");
    expect(artifactFamilyForType("html")).toBe("interactive");
  });

  test("titleFromUrl + siteNameFromUrl", () => {
    expect(titleFromUrl("https://example.com/some-paper_title")).toBe("some paper title");
    expect(titleFromUrl("https://example.com/")).toBe("example.com");
    expect(siteNameFromUrl("https://www.example.com/x")).toBe("example.com");
  });

  test("previewFromText collapses + truncates", () => {
    expect(previewFromText("a   b\n\nc")).toBe("a b c");
    expect(previewFromText("x".repeat(400)).endsWith("...")).toBe(true);
    expect(previewFromText("x".repeat(400)).length).toBe(280);
  });

  test("threshold constants", () => {
    expect(ARTIFACT_BODY_INLINE_LIMIT).toBe(700_000);
    expect(MAX_UPLOAD_BYTES).toBe(52_428_800);
  });
});
