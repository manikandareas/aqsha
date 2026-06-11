import { describe, expect, it } from "vitest";
import { derivePaperMetadataView } from "./paper-metadata-model";
import type { PaperExtractionStatus } from "../components/artifact-render-panels";

function extraction(
  status: "pending" | "running" | "ready" | "failed",
): NonNullable<PaperExtractionStatus>["extraction"] {
  return { status, updatedAt: 0 };
}

const usableMetadata: NonNullable<PaperExtractionStatus>["metadata"] = {
  title: "A Paper",
  authors: [{ name: "Jane Doe" }],
  affiliations: [],
  keywords: [],
};

describe("derivePaperMetadataView", () => {
  it("shows metadata whenever it is usable, regardless of document kind", () => {
    const view = derivePaperMetadataView({
      isPdf: true,
      paperExtraction: { extraction: extraction("ready"), metadata: usableMetadata },
    });
    expect(view.metadata).toBe(usableMetadata);
    expect(view.hasUsableMetadata).toBe(true);
    expect(view.paperPending).toBe(false);
    expect(view.paperFailed).toBe(false);
  });

  it("hides metadata with no title/abstract/authors", () => {
    const view = derivePaperMetadataView({
      isPdf: true,
      paperExtraction: {
        extraction: extraction("ready"),
        metadata: { authors: [], affiliations: [], keywords: [] },
      },
    });
    expect(view.metadata).toBeNull();
    expect(view.hasUsableMetadata).toBe(false);
  });

  it("is pending while extraction runs and nothing is resolved yet", () => {
    const view = derivePaperMetadataView({
      isPdf: true,
      paperExtraction: { extraction: extraction("running"), metadata: null },
    });
    expect(view.paperPending).toBe(true);
    expect(view.paperFailed).toBe(false);
  });

  it("is failed when extraction failed and no metadata came from any source", () => {
    const view = derivePaperMetadataView({
      isPdf: true,
      paperExtraction: { extraction: extraction("failed"), metadata: null },
    });
    expect(view.paperFailed).toBe(true);
    expect(view.paperPending).toBe(false);
  });

  it("does not alarm on a failed GROBID pass when metadata already resolved", () => {
    const view = derivePaperMetadataView({
      isPdf: true,
      paperExtraction: { extraction: extraction("failed"), metadata: usableMetadata },
    });
    expect(view.paperFailed).toBe(false);
    expect(view.metadata).toBe(usableMetadata);
  });

  it("never marks non-PDF artifacts pending or failed", () => {
    const view = derivePaperMetadataView({
      isPdf: false,
      paperExtraction: { extraction: extraction("failed"), metadata: null },
    });
    expect(view.paperPending).toBe(false);
    expect(view.paperFailed).toBe(false);
  });

  it("handles a missing extraction status (undefined paperExtraction)", () => {
    const view = derivePaperMetadataView({ isPdf: true, paperExtraction: undefined });
    expect(view.metadata).toBeNull();
    expect(view.paperPending).toBe(false);
    expect(view.paperFailed).toBe(false);
  });
});
