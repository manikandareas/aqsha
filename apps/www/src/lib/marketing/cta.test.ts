/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const ctaFiles = [
  "../../components/marketing/marketing-chrome.tsx",
  "../../components/marketing/mobile-nav-tree.tsx",
  "../../components/marketing/landing-hero-section.tsx",
  "../../components/marketing/feature-blocks-section.tsx",
  "../../components/marketing/bottom-cta-section.tsx",
  "../../components/marketing/faq-section.tsx",
  "../../components/marketing/pricing-section.tsx",
] as const;

test("all marketing acquisition controls use the shared live waitlist path", async () => {
  const ctaSource = await Bun.file(
    new URL("./cta.ts", import.meta.url),
  ).text();
  expect(ctaSource).toBe('export const WAITLIST_PATH = "/waitlist";\n');

  for (const path of ctaFiles) {
    const source = await Bun.file(new URL(path, import.meta.url)).text();
    expect(source).toContain("WAITLIST_PATH");
    expect(source).not.toMatch(/<Button\s+disabled/);
  }
});

test("marketing header has one waitlist action and a features menu", async () => {
  const headerSources = await Promise.all(
    [
      "../../components/marketing/marketing-chrome.tsx",
      "../../components/marketing/mobile-nav-tree.tsx",
    ].map((path) => Bun.file(new URL(path, import.meta.url)).text()),
  );
  const navSource = await Bun.file(new URL("./nav.ts", import.meta.url)).text();

  for (const source of headerSources) {
    expect(source).not.toContain("Dapatkan kabar saat rilis");
  }
  expect(navSource).toContain('label: "Fitur Aqsha"');
  expect(navSource).not.toContain('label: "Cara Aqsha bekerja"');
});
