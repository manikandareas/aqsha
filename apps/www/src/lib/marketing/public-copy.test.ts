/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const publicFiles = [
  "./nav.ts",
  "../../components/marketing/faq-data.ts",
  "../../components/marketing/pricing-section.tsx",
  "../../components/marketing/landing-footer.astro",
  "../../pages/waitlist.astro",
] as const;

test("public marketing copy names projects and reviewable writing workflows", async () => {
  const allSource = await Promise.all(
    publicFiles.map((path) => Bun.file(new URL(path, import.meta.url)).text()),
  ).then((sources) => sources.join("\n"));

  expect(allSource).toContain("Proyek");
  expect(allSource).toContain("Typst");
  expect(allSource).toContain("referensi");
  expect(allSource).not.toContain("aman pas sidang");
  expect(allSource).not.toContain("sumbernya beneran ada");
});
