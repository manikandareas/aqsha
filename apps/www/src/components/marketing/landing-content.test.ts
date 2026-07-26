/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const indexSource = await Bun.file(
  new URL("../../pages/index.astro", import.meta.url),
).text();
const founderSource = await Bun.file(
  new URL("./founder-story-section.tsx", import.meta.url),
).text();

test("landing uses an audience marker instead of unsupported social proof", () => {
  expect(indexSource).toContain('<AudienceMarqueeSection client:visible />');
  expect(indexSource).not.toContain("UniversityMarqueeSection");
  expect(indexSource).not.toContain("TestimonialSection");
});

test("founder story no longer embeds the old product tour media", () => {
  expect(founderSource).not.toContain("hero-loop.webm");
  expect(founderSource).not.toContain("hero-loop.mp4");
  expect(founderSource).not.toContain("hero-poster.webp");
  expect(founderSource).toContain("karya tulis");
});
