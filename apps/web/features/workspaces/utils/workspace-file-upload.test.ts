import { describe, expect, it } from "vitest";
import {
  MAX_WORKSPACE_UPLOAD_FILES,
  WORKSPACE_UPLOAD_CONCURRENCY,
  getFailedWorkspaceUploadFiles,
  runLimitedConcurrency,
  uploadWorkspaceFiles,
  validateWorkspaceUploadBatch,
} from "./workspace-file-upload";

function makeFile(name: string, content = "content") {
  return new File([content], name, { type: "text/plain" });
}

describe("workspace file upload", () => {
  it("accepts 20 files and rejects 21 files", () => {
    const accepted = Array.from({ length: MAX_WORKSPACE_UPLOAD_FILES }, (_, index) =>
      makeFile(`accepted-${index}.txt`),
    );
    const rejected = Array.from({ length: MAX_WORKSPACE_UPLOAD_FILES + 1 }, (_, index) =>
      makeFile(`rejected-${index}.txt`),
    );

    expect(() => validateWorkspaceUploadBatch(accepted)).not.toThrow();
    expect(() => validateWorkspaceUploadBatch(rejected)).toThrow(
      "Maksimal 20 file dalam satu upload.",
    );
  });

  it("keeps concurrency at three workers", async () => {
    let active = 0;
    let maxActive = 0;

    await runLimitedConcurrency(
      Array.from({ length: 9 }, (_, index) => index),
      WORKSPACE_UPLOAD_CONCURRENCY,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
      },
    );

    expect(maxActive).toBe(WORKSPACE_UPLOAD_CONCURRENCY);
  });

  it("reports progress for the matching file", async () => {
    const file = makeFile("progress.txt");
    const events: Array<{ name: string; index: number; progress: number }> = [];

    await uploadWorkspaceFiles({
      files: [file],
      workspaceId: "workspace-a",
      folderId: "root",
      generateUploadUrl: async () => "https://upload.example",
      createUploadedArtifact: async () => undefined,
      uploadToStorage: async ({ file: uploadFile, onProgress }) => {
        onProgress?.(47);
        return `${uploadFile.name}-storage` as never;
      },
      onFileChange: (event) => {
        events.push({
          name: event.file.name,
          index: event.index,
          progress: event.progress,
        });
      },
    });

    expect(events).toContainEqual({ name: "progress.txt", index: 0, progress: 47 });
  });

  it("keeps uploading other files when one file fails", async () => {
    const files = [makeFile("ok-a.txt"), makeFile("bad.txt"), makeFile("ok-b.txt")];

    const results = await uploadWorkspaceFiles({
      files,
      workspaceId: "workspace-a",
      folderId: "root",
      generateUploadUrl: async () => "https://upload.example",
      createUploadedArtifact: async () => undefined,
      uploadToStorage: async ({ file }) => {
        if (file.name === "bad.txt") {
          throw new Error("Storage rejected bad.txt.");
        }
        return `${file.name}-storage` as never;
      },
    });

    expect(results.map((result) => result.ok)).toEqual([true, false, true]);
    expect(getFailedWorkspaceUploadFiles(results).map((file) => file.name)).toEqual([
      "bad.txt",
    ]);
  });

  it("selects only failed files for retry", () => {
    const ok = makeFile("ok.txt");
    const failed = makeFile("failed.txt");

    expect(
      getFailedWorkspaceUploadFiles([
        { ok: true, file: ok, index: 0 },
        { ok: false, file: failed, index: 1, error: "Upload gagal." },
      ]).map((file) => file.name),
    ).toEqual(["failed.txt"]);
  });
});
