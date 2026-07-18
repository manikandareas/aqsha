/**
 * Social-proof content for the university marquee band under the hero.
 * Numbers and campus marks live here so the section stays a pure renderer.
 */

/** Angka sosial-proof — sengaja tidak bulat biar terbaca seperti data asli. */
export const STUDENT_COUNT = 21_347;

/**
 * Wordmark-style campus entries (no crest assets). `styleClass` is a
 * one-off brand treatment for the marquee strip, not a design-system token.
 */
export const UNIVERSITY_MARKS = [
  {
    name: "Universitas Indonesia",
    mark: "UI",
    styleClass: "font-heading text-2xl font-black tracking-tight sm:text-3xl",
  },
  {
    name: "Universitas Gadjah Mada",
    mark: "UGM",
    styleClass: "text-xl font-black tracking-[0.18em] sm:text-2xl",
  },
  {
    name: "Institut Teknologi Bandung",
    mark: "ITB",
    styleClass: "font-heading text-2xl font-bold tracking-widest sm:text-3xl",
  },
  {
    name: "IPB University",
    mark: "IPB",
    styleClass: "text-xl font-extrabold tracking-[0.22em] sm:text-2xl",
  },
  {
    name: "Universitas Airlangga",
    mark: "Unair",
    styleClass: "font-heading text-2xl font-bold sm:text-3xl",
  },
  {
    name: "Institut Teknologi Sepuluh Nopember",
    mark: "ITS",
    styleClass: "text-2xl font-black italic tracking-tight sm:text-3xl",
  },
  {
    name: "Universitas Diponegoro",
    mark: "Undip",
    styleClass:
      "font-heading text-2xl font-extrabold tracking-tight sm:text-3xl",
  },
  {
    name: "Universitas Padjadjaran",
    mark: "Unpad",
    styleClass: "text-2xl font-bold sm:text-3xl",
  },
  {
    name: "Universitas Brawijaya",
    mark: "UB",
    styleClass:
      "font-heading text-2xl font-black tracking-[0.14em] sm:text-3xl",
  },
  {
    name: "Universitas Sebelas Maret",
    mark: "UNS",
    styleClass: "text-xl font-extrabold tracking-[0.2em] sm:text-2xl",
  },
  {
    name: "Telkom University",
    mark: "Tel-U",
    styleClass: "font-heading text-2xl font-bold tracking-tight sm:text-3xl",
  },
  {
    name: "Binus University",
    mark: "Binus",
    styleClass: "text-2xl font-black lowercase tracking-tight sm:text-3xl",
  },
] as const;
