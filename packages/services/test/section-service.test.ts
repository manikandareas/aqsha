import { describe, expect, test } from "bun:test";
import { SectionService } from "../src/section.service";

const fakeDb = {} as never;

describe("SectionService validation", () => {
  test("setStatus menolak status liar sebelum menyentuh db", async () => {
    await expect(
      SectionService.setStatus(fakeDb, {
        ownerUserId: "u",
        sectionId: "s",
        status: "weird" as never,
      }),
    ).rejects.toMatchObject({ code: "section_status_invalid" });
  });
});
