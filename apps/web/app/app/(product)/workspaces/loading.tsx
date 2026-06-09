import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Content-only loader for this protected segment: fills the content area inside
// the persistent shell (AppShell SidebarInset / SettingsInset), keeping the nav.
export default function Loading() {
  return <AppLoadingOverlay variant="absolute" />;
}
