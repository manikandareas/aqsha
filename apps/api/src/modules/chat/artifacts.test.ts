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
        async deletePng() {
          throw new Error("Artifact should not be deleted after successful persistence.");
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
        sourceRefs: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            url: "https://example.com/study",
          },
        ],
        visualSpec: {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          outputIntent: "final_report_embed",
        },
        auditSummary: "Visual references verified ledger source IDs.",
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
        ownerUserId: "user_123",
        chatThreadId: "thread_123",
        runId: "run_123",
        messageId: null,
        kind: "visual_png",
        title: "Evidence timeline",
        caption: "Verified source-backed timeline.",
        fileKey: "ut_file_123",
        url: "https://utfs.io/f/ut_file_123.png",
        contentType: "image/png",
        byteSize: 8,
        checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
        sourceIds: ["S1", "S2"],
        sourceRefs: [
          {
            sourceId: "S1",
            title: "Evidence-aware writing assistants",
            url: "https://example.com/study",
          },
        ],
        visualSpec: {
          visualId: "evidence-timeline",
          visualKind: "timeline",
          outputIntent: "final_report_embed",
        },
        auditStatus: "passed",
        auditSummary: "Visual references verified ledger source IDs.",
        failureSummary: null,
        developerDetail: null,
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
        async deletePng() {
          throw new Error("Artifact should not be deleted when upload fails.");
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

  test("persists artifact manifest metadata in developer detail", async () => {
    const persistedArtifacts: unknown[] = [];
    const publisher = new PngArtifactPublisher({
      uploadClient: {
        async uploadPng(input) {
          return {
            fileKey: "ut_file_123",
            url: "https://utfs.io/f/ut_file_123.png",
            name: input.filename,
            size: input.bytes.byteLength,
            contentType: "image/png",
          };
        },
        async deletePng() {
          throw new Error("Artifact should not be deleted after successful persistence.");
        },
      },
      async persistArtifact(input) {
        persistedArtifacts.push(input);

        return {
          ...input,
          id: "artifact_123",
          createdAt: "2026-05-04T00:00:00.000Z",
        };
      },
      async writeEvent() {},
    });

    await publisher.publish({
      scope: { userId: "user_123" },
      run: { id: "run_123", chatThreadId: "thread_123" },
      artifact: {
        bytes: pngBytes,
        filename: "timeline.png",
        title: "Evidence timeline",
        metadata: {
          visualId: "evidence-timeline",
          outputIntent: "final_report_embed",
          artifactManifestSource: "deep_research_visual_delivery",
        },
      },
    });

    expect(persistedArtifacts).toEqual([
      expect.objectContaining({
        developerDetail: {
          visualId: "evidence-timeline",
          outputIntent: "final_report_embed",
          artifactManifestSource: "deep_research_visual_delivery",
        },
      }),
    ]);
  });

  test("cleans up an orphan UploadThing artifact when persistence fails after upload", async () => {
    const deletedFileKeys: string[] = [];
    const events: unknown[] = [];
    const publisher = new PngArtifactPublisher({
      uploadClient: {
        async uploadPng(input) {
          return {
            fileKey: "ut_orphan_123",
            url: "https://utfs.io/f/ut_orphan_123.png",
            name: input.filename,
            size: input.bytes.byteLength,
            contentType: "image/png",
          };
        },
        async deletePng(fileKey) {
          deletedFileKeys.push(fileKey);
        },
      },
      async persistArtifact() {
        throw new Error("Postgres insert failed.");
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
    ).rejects.toThrow("Postgres insert failed.");

    expect(deletedFileKeys).toEqual(["ut_orphan_123"]);
    expect(events).toEqual([
      expect.objectContaining({
        type: "artifact_upload_failed",
        scope: "tool",
        status: "failed",
        summary: "Postgres insert failed.",
      }),
    ]);
  });

  test("records an event when orphan UploadThing cleanup fails", async () => {
    const events: unknown[] = [];
    const publisher = new PngArtifactPublisher({
      uploadClient: {
        async uploadPng(input) {
          return {
            fileKey: "ut_orphan_123",
            url: "https://utfs.io/f/ut_orphan_123.png",
            name: input.filename,
            size: input.bytes.byteLength,
            contentType: "image/png",
          };
        },
        async deletePng() {
          throw new Error("UploadThing delete failed.");
        },
      },
      async persistArtifact() {
        throw new Error("Postgres insert failed.");
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
    ).rejects.toThrow("Postgres insert failed.");

    expect(events).toEqual([
      expect.objectContaining({
        type: "orphan_published_artifact_cleanup_failed",
        scope: "tool",
        status: "failed",
        title: "Orphan artifact cleanup failed",
        summary: "UploadThing delete failed.",
        payload: expect.objectContaining({
          fileKey: "ut_orphan_123",
          url: "https://utfs.io/f/ut_orphan_123.png",
        }),
      }),
      expect.objectContaining({
        type: "artifact_upload_failed",
        scope: "tool",
        status: "failed",
        summary: "Postgres insert failed.",
      }),
    ]);
  });
});
