import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Content-only loader: renders inside AppShell's SidebarInset, so the left nav
// stays visible and interactive while the product content streams in.
export default function Loading() {
  return <AppLoadingOverlay variant="absolute" />;
}
