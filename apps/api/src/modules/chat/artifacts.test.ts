import { describe, expect, test } from "bun:test";

import { PngArtifactPublisher } from "./artifacts";

const pngBytes = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("PngArtifactPublisher", () => {
  test("uploads a PNG, persists run metadata, records a success event, and returns Markdown image syntax", async () => {
    const uploadCalls: unknown[] = [];
    const persistedArtifacts: unknown[] = [];
    const events: unknown[] = [];
    const publisher = new PngArtifactPublisher({
      uploadClient: {
        async uploadPng(input) {
          uploadCalls.push(input);

          return {
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            name: input.filename,
            size: input.bytes.byteLength,
            contentType: "image/png",
          };
        },
      },
      async persistArtifact(input) {
        persistedArtifacts.push(input);

        return {
          ...input,
          id: "artifact_123",
          createdAt: "2026-05-03T00:00:00.000Z",
        };
      },
      async writeEvent(event) {
        events.push(event);
      },
    });

    const result = await publisher.publish({
      scope: { userId: "user_123" },
      run: { id: "run_123", chatThreadId: "thread_123" },
      artifact: {
        bytes: pngBytes,
        filename: "timeline.png",
        title: "Evidence timeline",
        altText: "Evidence timeline chart",
        caption: "Verified source-backed timeline.",
        sourceIds: ["S1", "S2"],
        metadata: { auditStatus: "passed" },
      },
    });

    expect(result.markdown).toBe(
      "![Evidence timeline chart](https://utfs.io/f/ut_file_123.png)\n\n_Verified source-backed timeline._",
    );
    expect(uploadCalls).toEqual([
      expect.objectContaining({
        bytes: pngBytes,
        filename: "timeline.png",
        title: "Evidence timeline",
        sourceIds: ["S1", "S2"],
      }),
    ]);
    expect(persistedArtifacts).toEqual([
      expect.objectContaining({
        chatThreadId: "thread_123",
        runId: "run_123",
        kind: "visual_png",
        title: "Evidence timeline",
        caption: "Verified source-backed timeline.",
        fileKey: "ut_file_123",
        url: "https://utfs.io/f/ut_file_123.png",
        contentType: "image/png",
        byteSize: 8,
        sourceIds: ["S1", "S2"],
        metadata: expect.objectContaining({ auditStatus: "passed" }),
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "artifact_upload_completed",
        scope: "tool",
        status: "completed",
        title: "Artifact uploaded",
        summary: "Evidence timeline was uploaded and embedded in the response.",
        payload: expect.objectContaining({
          artifactId: "artifact_123",
          fileKey: "ut_file_123",
          url: "https://utfs.io/f/ut_file_123.png",
          contentType: "image/png",
          byteSize: 8,
        }),
      }),
    ]);
  });

  test("records a failed run event when UploadThing rejects the PNG upload", async () => {
    const events: unknown[] = [];
    const publisher = new PngArtifactPublisher({
      uploadClient: {
        async uploadPng() {
          throw new Error("UploadThing rejected the file.");
        },
      },
      async persistArtifact() {
        throw new Error("Artifact should not be persisted when upload fails.");
      },
      async writeEvent(event) {
        events.push(event);
      },
    });

    await expect(
      publisher.publish({
        scope: { userId: "user_123" },
        run: { id: "run_123", chatThreadId: "thread_123" },
        artifact: {
          bytes: pngBytes,
          filename: "timeline.png",
          title: "Evidence timeline",
        },
      }),
    ).rejects.toThrow("UploadThing rejected the file.");

    expect(events).toEqual([
      expect.objectContaining({
        type: "artifact_upload_failed",
        scope: "tool",
        status: "failed",
        title: "Artifact upload failed",
        summary: "UploadThing rejected the file.",
        payload: expect.objectContaining({
          filename: "timeline.png",
          contentType: "image/png",
        }),
      }),
    ]);
  });
});
