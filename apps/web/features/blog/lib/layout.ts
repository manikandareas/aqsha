/**
 * Ritme spasial blog — satu sumber kebenaran supaya gutter X konsisten antar
 * blok (header, kartu, artikel) dan sejajar dengan chrome marketing.
 *
 * `blogColumn` = lebar baca + center. `blogGutter` = padding X (selaras
 * LandingHeader: px-4 → sm:px-6 → lg:px-8). Gutter ditempel per-child (bukan di
 * <main>) supaya background hover kartu bisa full-width tapi teksnya tetap rata
 * dengan heading/subtitle.
 */
export const blogColumn = "mx-auto w-full max-w-3xl";
export const blogGutter = "px-5 sm:px-6 lg:px-8";

/** Easing fisik (anti ease-in-out generik) untuk semua transisi blog. */
export const blogEase = "ease-[cubic-bezier(0.32,0.72,0,1)]";
