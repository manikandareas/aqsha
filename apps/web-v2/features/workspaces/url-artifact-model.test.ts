import { describe, expect, it } from "vitest";
import { urlArtifactDisplayModel } from "./url-artifact-model";

describe("url artifact display model", () => {
  it("models pending URL extraction", () => {
    expect(
      urlArtifactDisplayModel({
        status: "pending",
        normalizedUrl: "https://example.com",
      }),
    ).toMatchObject({ label: "Pending", tone: "muted", canRetry: false });
  });

  it("models ready URL extraction", () => {
    expect(
      urlArtifactDisplayModel({
        status: "ready",
        normalizedUrl: "https://example.com",
        description: "Readable summary",
      }),
    ).toMatchObject({ label: "Ready", tone: "ready", summary: "Readable summary" });
  });

  it("models failed URL extraction with retry", () => {
    expect(
      urlArtifactDisplayModel({
        status: "failed",
        normalizedUrl: "https://example.com",
        failureReason: "blocked",
      }),
    ).toMatchObject({ label: "Failed", tone: "destructive", canRetry: true });
  });
});
