/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { defaultDescription, ogImage } from "./seo-config";

test("site metadata describes the research-and-writing workspace", () => {
  expect(defaultDescription).toContain("proyek karya tulis");
  expect(defaultDescription).toContain("dokumen Typst");
  expect(defaultDescription).toContain("referensi");
  expect(defaultDescription).not.toContain("mengecek tiap sumber");
  expect(ogImage.subtitle).toBe("Proyek, sumber, dan draf yang tetap terhubung.");
});
