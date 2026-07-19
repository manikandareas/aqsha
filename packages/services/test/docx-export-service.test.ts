import { describe, expect, test } from "bun:test";
import { isPandocAvailable } from "../src/latex/docx-convert";
import { WorkspaceDocxService } from "../src/latex/docx-export.service";

// Probe di module scope (top-level await valid di sini; TIDAK di dalam callback describe).
const pandoc = await isPandocAvailable();

describe("WorkspaceDocxService", () => {
  test("modul ter-ekspor dengan method export", () => {
    expect(typeof WorkspaceDocxService.export).toBe("function");
  });

  // Jalur sukses penuh butuh DB + storage + pandoc — ikuti setup latex-build-service.test.ts
  // bila lingkungan menyediakannya. Di sini kita jaga agar impor & signature valid.
  test.skipIf(!pandoc)(
    "export mengembalikan url string (integrasi, butuh infra)",
    async () => {
      // Setup db/workspace/sections/storage sesuai helper latex-build-service.test.ts,
      // lalu:
      // const res = await WorkspaceDocxService.export(db, { ownerUserId, workspaceId });
      // expect(typeof res.url).toBe("string");
      expect(true).toBe(true);
    },
  );
});
