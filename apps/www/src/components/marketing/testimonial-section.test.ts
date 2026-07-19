/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const indexSource = await Bun.file(
  new URL("../../pages/index.astro", import.meta.url),
).text();
const componentFile = Bun.file(
  new URL("./testimonial-section.tsx", import.meta.url),
);

test("places the testimonial directly before pricing", () => {
  expect(indexSource).toContain(
    '<AudienceSection client:visible />\n    <TestimonialSection client:visible />\n    <PricingSection client:visible />',
  );
});

test("keeps the fictional testimonial explicit and semantic", async () => {
  expect(await componentFile.exists()).toBe(true);
  const componentSource = await componentFile.text();
  expect(componentSource).toContain("<blockquote");
  expect(componentSource).toContain("Persona pengguna");
  expect(componentSource).toContain('aria-label="Dinilai 5 dari 5"');
});

test("uses the compact testimonial spacing rhythm", async () => {
  const componentSource = await componentFile.text();
  expect(componentSource).toContain(
    "bg-background pb-24 text-foreground sm:pb-32 lg:pb-40",
  );
  expect(componentSource).toContain(
    "mx-auto flex w-full max-w-md flex-col items-center",
  );
});
