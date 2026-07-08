import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Boundary loading untuk navigasi antar-segmen di bawah `(product)/layout`
// (home <-> thread <-> workspaces <-> explore). Diletakkan tepat di bawah
// layout supaya menjadi entry point Suspense saat pindah rute — tanpa ini,
// prefetch <Link> ke rute dynamic di-skip dan navigasi menahan halaman lama
// sampai RSC server selesai. Overlay mengisi SidebarInset (parent `relative`),
// jadi sidebar tetap interaktif dan hanya area konten yang tertutup.
export default function ProductLoading() {
  return <AppLoadingOverlay label="Memuat..." variant="absolute" />;
}
