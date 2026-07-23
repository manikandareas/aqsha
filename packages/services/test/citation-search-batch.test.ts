import { describe, expect, spyOn, test } from "bun:test";
import { AppError } from "@aqsha/db";
import { citationCrudMethods } from "../src/citations/citation-crud.methods";
import { CitationService } from "../src/citations/citation.service";

describe("search-paper batch citations", () => {
  test("menjaga save sukses ketika source lain gagal", async () => {
    const byDoi = spyOn(citationCrudMethods, "createByDoi").mockResolvedValue({
      id: "cit_saved",
      created: true,
    } as never);
    const manual = spyOn(citationCrudMethods, "createManual").mockImplementation(async (_db, input) => {
      if (!input.fields.title?.trim()) {
        throw new AppError({
          message: "Judul wajib diisi",
          code: "citation_title_required",
          field: "title",
        });
      }
      return { id: "cit_manual", created: true } as never;
    });

    try {
      const result = await CitationService.saveSearchSources({} as never, {
        ownerUserId: "user_1",
        sources: [
          { clientKey: "doi:10.1/a", title: "Saved", doi: "10.1/a" },
          { clientKey: "bad", title: "" },
        ],
      });
      expect(result).toEqual({
        saved: 1,
        failed: 1,
        items: [
          expect.objectContaining({ clientKey: "doi:10.1/a", status: "saved" }),
          expect.objectContaining({
            clientKey: "bad",
            status: "failed",
            code: "citation_title_required",
          }),
        ],
      });
    } finally {
      byDoi.mockRestore();
      manual.mockRestore();
    }
  });

  test("mengekspor paper belum tersimpan ke RIS", () => {
    const result = CitationService.exportSearchSources({
      format: "ris",
      sources: [
        { clientKey: "paper:1", title: "Selected", authors: ["Ada Lovelace"], year: 2024 },
      ],
    });
    expect(result.mimeType).toBe("application/x-research-info-systems");
    expect(result.content).toContain("TI  - Selected");
  });
});
