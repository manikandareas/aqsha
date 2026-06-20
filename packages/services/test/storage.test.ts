import { beforeAll, describe, expect, test } from "bun:test";

// S3 presign = crypto lokal (tanpa network) → bisa diuji dengan kredensial palsu.
beforeAll(() => {
  process.env.S3_ENDPOINT = "http://127.0.0.1:9000";
  process.env.S3_ACCESS_KEY_ID = "fake-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "fake-secret-key";
  process.env.S3_BUCKET = "aqsha-test";
});

const { StorageService } = await import("../src/storage.service");

describe("StorageService presign (offline)", () => {
  test("generateUploadTarget → key prefixed + signed PUT URL", async () => {
    const { uploadUrl, key } = await StorageService.generateUploadTarget("owner_1");
    expect(key).toStartWith("artifacts/owner_1/");
    expect(uploadUrl).toContain("artifacts/owner_1/");
    expect(uploadUrl).toContain("X-Amz-Signature=");
    expect(uploadUrl).toContain("X-Amz-Expires=3600");
    // Tak mengikat Content-Type (upload-url artifact belum tahu mime).
    expect(uploadUrl).not.toContain("Content-Type");
  });

  test("getSignedReadUrl → signed GET URL untuk key", async () => {
    const url = await StorageService.getSignedReadUrl("artifacts/owner_1/abc");
    expect(url).toContain("artifacts/owner_1/abc");
    expect(url).toContain("X-Amz-Signature=");
  });
});
