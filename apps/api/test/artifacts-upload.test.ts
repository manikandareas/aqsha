/**
 * Unggah akun-level: PDF perpustakaan tidak butuh workspace. Route diuji sebagai
 * kontrak tipis — service di-spy, jadi tak ada baris yang benar-benar ditulis.
 */
import { ArtifactService, CitationService } from "@aqsha/services";
import { afterAll, describe, expect, mock, spyOn, test } from "bun:test";

// Mock Clerk token: `Bearer tok_<sub>` → { sub }. Token lain → null (401).
mock.module("../src/clients/clerkToken", () => ({
  verifyClerkToken: async (token: string) =>
    token.startsWith("tok_") ? { sub: token.slice(4), email: null } : null,
}));

const DATABASE_URL = process.env.DATABASE_URL;
// `getDb()` di dalam handler tetap membangun koneksi meski service-nya di-spy.
const itest = DATABASE_URL ? test : test.skip;
const OWNER = "uptest_owner";
const { app } = await import("../src/index");

function uploadRequest(token?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/artifacts/upload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      key: "k",
      fileName: "paper.pdf",
      mimeType: "application/pdf",
      size: 1024,
    }),
  });
}

// Spy atas service bersifat proses-global di bun test; lepaskan supaya file uji lain
// (mis. upload nyata ke object storage) tetap memanggil implementasi aslinya.
afterAll(() => mock.restore());

describe("POST /artifacts/upload", () => {
  itest("meneruskan workspaceId null ke finalizeUpload", async () => {
    const finalize = spyOn(ArtifactService, "finalizeUpload").mockResolvedValue({
      artifactId: "art_1",
      title: "Paper",
      indexed: true,
    } as never);
    spyOn(CitationService, "createFromArtifact").mockResolvedValue({
      citation: { id: "c1" },
      created: true,
      linkedExisting: false,
    } as never);

    const res = await app.handle(uploadRequest(`tok_${OWNER}`));

    expect(res.status).toBe(200);
    const call = (finalize as ReturnType<typeof spyOn>).mock.calls[0]?.[1] as {
      workspaceId: string | null;
    };
    expect(call.workspaceId).toBeNull();
  });

  test("tanpa Bearer → 401", async () => {
    const res = await app.handle(uploadRequest());
    expect(res.status).toBe(401);
  });
});
