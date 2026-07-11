import { afterEach, describe, expect, test } from "bun:test";
import { zoteroAdapter } from "../src/integrations/zotero.adapter";
import type { ZoteroCredentials } from "../src/integrations/provider";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Handler = (url: string, init: RequestInit | undefined) => Response;

function mockFetch(handler: Handler): { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = ((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
  return { calls };
}

function json(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

const CREDS: ZoteroCredentials = { provider: "zotero", apiKey: "KEY123", userId: "999" };

describe("zotero adapter — bentuk & connect", () => {
  test("authMode api_key + selalu configured (key milik user)", () => {
    expect(zoteroAdapter.provider).toBe("zotero");
    expect(zoteroAdapter.authMode).toBe("api_key");
    expect(zoteroAdapter.isConfigured()).toBe(true);
  });

  test("connectWithApiKey validasi key → creds userId otoritatif + header key terkirim", async () => {
    const { calls } = mockFetch((url) => {
      expect(url).toContain("/keys/KEY123");
      return json({ userID: 12345, username: "alice", access: { user: { library: true } } });
    });
    const creds = await zoteroAdapter.connectWithApiKey!({ apiKey: "KEY123", userId: "ignored" });
    expect(creds).toEqual({ provider: "zotero", apiKey: "KEY123", userId: "12345" });
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["Zotero-API-Key"]).toBe("KEY123");
    expect(headers["Zotero-API-Version"]).toBe("3");
  });

  test("connectWithApiKey menolak key kosong tanpa fetch", async () => {
    mockFetch(() => {
      throw new Error("tidak boleh fetch");
    });
    await expect(zoteroAdapter.connectWithApiKey!({ apiKey: "   " })).rejects.toThrow();
  });

  test("connectWithApiKey menolak key tanpa akses library", async () => {
    mockFetch(() => json({ userID: 1, access: { user: { library: false } } }));
    await expect(zoteroAdapter.connectWithApiKey!({ apiKey: "KEY123" })).rejects.toThrow();
  });

  test("connectWithApiKey menolak key ditolak provider (403)", async () => {
    mockFetch(() => new Response("forbidden", { status: 403 }));
    await expect(zoteroAdapter.connectWithApiKey!({ apiKey: "BAD" })).rejects.toThrow();
  });

  test("ensureFresh no-op (key tak kedaluwarsa)", async () => {
    const result = await zoteroAdapter.ensureFresh(CREDS);
    expect(result).toEqual({ creds: CREDS, refreshed: false });
  });

  test("fetchProfile mengembalikan id + name dari key info", async () => {
    mockFetch(() => json({ userID: 12345, username: "alice", access: { user: { library: true } } }));
    const profile = await zoteroAdapter.fetchProfile(CREDS);
    expect(profile).toEqual({ id: "12345", name: "alice" });
  });
});

describe("zotero adapter — folders & documents", () => {
  test("listFolders map key/name/parent + paginasi Link rel=next", async () => {
    let page = 0;
    mockFetch((url) => {
      expect(url).toContain("/users/999/collections");
      page += 1;
      if (page === 1) {
        return json(
          [
            { data: { key: "AAA", name: "Metodologi", parentCollection: false } },
            { data: { key: "BBB", name: "Sub", parentCollection: "AAA" } },
          ],
          { Link: '<https://api.zotero.org/users/999/collections?start=100>; rel="next"' },
        );
      }
      return json([{ data: { key: "CCC", name: "Halaman 2", parentCollection: false } }]);
    });
    const folders = await zoteroAdapter.listFolders(CREDS);
    expect(folders).toEqual([
      { id: "AAA", name: "Metodologi", parentId: null },
      { id: "BBB", name: "Sub", parentId: "AAA" },
      { id: "CCC", name: "Halaman 2", parentId: null },
    ]);
  });

  test("pullDocuments (semua) pakai /items/top, include csljson, skip non-referensi", async () => {
    const { calls } = mockFetch((url) => {
      expect(url).toContain("/users/999/items/top");
      expect(url).toContain("include=csljson");
      return json([
        { key: "ITEM1", csljson: { id: "http://zotero.org/x", type: "article-journal", title: "A" } },
        { key: "NOTE1", csljson: { id: "n", type: "" } }, // note tanpa type → skip
        { key: "ATT1" }, // attachment tanpa csljson → skip
      ]);
    });
    const docs = await zoteroAdapter.pullDocuments(CREDS, { folderId: null });
    expect(docs).toEqual([
      { externalId: "ITEM1", csl: { type: "article-journal", title: "A" } },
    ]);
    // `id` provider dibuang agar record assign miliknya.
    expect((docs[0]?.csl as Record<string, unknown>).id).toBeUndefined();
    expect(calls[0]?.url).not.toContain("/collections/");
  });

  test("pullDocuments folder tertentu pakai /collections/<id>/items/top", async () => {
    const { calls } = mockFetch(() => json([]));
    await zoteroAdapter.pullDocuments(CREDS, { folderId: "AAA" });
    expect(calls[0]?.url).toContain("/users/999/collections/AAA/items/top");
  });
});
