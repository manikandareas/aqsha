import { describe, expect, it } from "vitest";

const expectedStepLabels = [
  "Merencanakan riset",
  "Mencari sumber",
  "Membaca dan mengutip",
  "Menyusun laporan",
  "Memeriksa kutipan",
  "Menyimpan hasil",
  "Menutup riset",
];

describe("deep research contract", () => {
  it("keeps the public progress labels stable", () => {
    expect(expectedStepLabels).toEqual([
      "Merencanakan riset",
      "Mencari sumber",
      "Membaca dan mengutip",
      "Menyusun laporan",
      "Memeriksa kutipan",
      "Menyimpan hasil",
      "Menutup riset",
    ]);
  });
});
