import { describe, expect, test } from "bun:test";
import { WORKSPACE_KINDS } from "@aqsha/db";
import { SECTION_TEMPLATES } from "../src/workspaces/section-templates";

describe("SECTION_TEMPLATES", () => {
  test("setiap kind punya entri template", () => {
    for (const kind of WORKSPACE_KINDS) {
      expect(SECTION_TEMPLATES[kind]).toBeDefined();
    }
  });

  test("freeform kosong; kind lain berisi dan diakhiri Daftar Pustaka", () => {
    expect(SECTION_TEMPLATES.freeform).toEqual([]);
    for (const kind of WORKSPACE_KINDS) {
      if (kind === "freeform") continue;
      const tpl = SECTION_TEMPLATES[kind];
      expect(tpl.length).toBeGreaterThan(0);
      const last = tpl[tpl.length - 1]!;
      expect(last.role).toBe("bibliography");
      expect(tpl.filter((s) => s.role === "bibliography")).toHaveLength(1);
    }
  });

  test("judul template unik per kind", () => {
    for (const kind of WORKSPACE_KINDS) {
      const titles = SECTION_TEMPLATES[kind].map((s) => s.title);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});
