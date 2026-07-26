/// <reference types="bun-types" />

import { expect, test } from "bun:test";
import { FEATURE_KEYS, FEATURES } from "./features";

test("feature catalog tells the project-first product story", () => {
  expect(FEATURE_KEYS).toEqual(["projects", "document", "references", "astra"]);
  expect(FEATURES.projects.preview.surface).toBe("research-shelf");
  expect(FEATURES.document.preview.surface).toBe("typst-document");
  expect(FEATURES.references.preview.surface).toBe("references");
  expect(FEATURES.astra.preview.surface).toBe("astra-review");
  expect(JSON.stringify(FEATURES)).not.toContain("frame-workspace.webp");
  expect(JSON.stringify(FEATURES)).not.toContain("fitur-provenance");
});

test("placeholder is explicit and decorative", async () => {
  const source = await Bun.file(
    new URL("../components/marketing/product-preview-placeholder.tsx", import.meta.url),
  ).text();
  expect(source).toContain("data-product-preview");
  expect(source).toContain("aria-hidden");
  expect(source).toContain("Preview produk");
});
