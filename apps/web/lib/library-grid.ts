// Grid ini memakai container queries (`@lg:`) alih-alih viewport breakpoints
// (`sm:`) supaya jumlah kolom menyesuaikan lebar container (panel sempit di
// desktop vs halaman penuh), bukan lebar viewport. Default `grid-cols-2`
// menjamin minimal 2 card per row pada container sempit; ketika container
// ≥ 32rem (512px) kita switch ke auto-fill dengan min 15.5rem supaya card
// melebar secara natural saat ada ruang. Ancestor wajib menandai `@container`.
export const libraryArtifactGridClass =
  "grid grid-cols-2 gap-3 @lg:gap-5 @lg:[grid-template-columns:repeat(auto-fill,minmax(min(100%,15.5rem),1fr))]";
