import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Root data-loading state for settings pages. Renders the same global overlay
// as the route-level loading.tsx (content-only, filling SettingsInset) so the
// hand-off from route loader to client-data loader is seamless — no custom
// skeleton/spinner card.
export function LoadingSettingsPage() {
  return <AppLoadingOverlay variant="absolute" />;
}
