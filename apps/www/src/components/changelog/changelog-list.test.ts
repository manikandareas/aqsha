/// <reference types="bun-types" />

import { expect, test } from "bun:test";

const source = await Bun.file(
  new URL("./changelog-list.tsx", import.meta.url),
).text();

test("empty changelog explains the release state and offers waitlist", () => {
  expect(source).toContain("Belum ada catatan rilis");
  expect(source).toContain("WAITLIST_PATH");
  expect(source).toContain("Dapatkan kabar saat akses dibuka");
  expect(source).not.toContain("Belum ada pembaruan. Nantikan, ya.");
});
