import { AppLoadingOverlay } from "@/components/app-loading-overlay";

// Global loading UI for every protected /app route. Next.js renders this as
// the Suspense fallback during navigation into and between product pages, so
// users see a full-page branded overlay instead of a bare skeleton.
export default function AppLoading() {
  return <AppLoadingOverlay />;
}
