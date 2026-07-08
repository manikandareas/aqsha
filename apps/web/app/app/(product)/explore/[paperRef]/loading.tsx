import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Boundary loading khusus segmen `[paperRef]` — pola sama dgn `threads/[threadId]/loading.tsx`:
// segmen dynamic di-instantiate ulang tiap param berubah (paper -> paper terkait), sehingga
// boundary `(product)/loading.tsx` di atasnya tidak menangkapnya. Overlay `variant="absolute"`
// mengisi SidebarInset (parent `relative`).
export default function ExplorePaperLoading() {
  return <AppLoadingOverlay label="Memuat..." variant="absolute" />;
}
