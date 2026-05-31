import { createPageMetadata } from "@/lib/metadata";

import { LandingPage } from "@/features/marketing/components/landing-page";

export const metadata = createPageMetadata({
  title: "Source-backed research workspace",
  description:
    "Aqsha keeps research threads, sources, notes, and cited answers connected in one workspace.",
});

export default function PublicLandingPage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <LandingPage />
    </main>
  );
}
