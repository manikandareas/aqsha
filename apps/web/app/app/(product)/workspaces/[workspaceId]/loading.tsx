import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Boundary loading khusus segmen `[workspaceId]` — pola sama dgn `threads/[threadId]/loading.tsx`:
// segmen dynamic di-instantiate ulang tiap param berubah (workspace -> workspace lain), sehingga
// boundary `(product)/loading.tsx` di atasnya tidak menangkapnya. Overlay `variant="absolute"`
// mengisi SidebarInset (parent `relative`).
export default function WorkspaceDetailLoading() {
  return <AppLoadingOverlay label="Memuat..." variant="absolute" />;
}
