"use client";

import { LandingHeroHeader } from "@/components/marketing/landing-hero-header";
import { LandingHeroSection } from "@/components/marketing/landing-hero-section";
import { MotionProvider } from "@/components/motion-provider";
import type { LatestUpdate } from "@/lib/marketing/latest";

/**
 * LandingHeroZone — one client:load island for fixed chrome + hero.
 * Keeps LazyMotion scoped to above-the-fold interaction only.
 */
export function LandingHeroZone({
  latestUpdate,
}: {
  latestUpdate: LatestUpdate | null;
}) {
  return (
    <MotionProvider>
      <LandingHeroHeader />
      <LandingHeroSection latestUpdate={latestUpdate} />
    </MotionProvider>
  );
}
