import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Boundary loading khusus segmen `[threadId]`. Segmen dynamic ini
// di-instantiate ulang tiap kali param berubah (thread -> thread lain),
// sehingga boundary `(product)/loading.tsx` di atasnya tidak menangkapnya.
// Overlay `variant="absolute"` mengisi SidebarInset (parent `relative`).
export default function ThreadDetailLoading() {
  return <AppLoadingOverlay label="Memuat..." variant="absolute" />;
}
