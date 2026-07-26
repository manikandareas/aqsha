"use client";

import { LandingHeroSection } from "@/components/marketing/landing-hero-section";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import { MotionProvider } from "@/components/motion-provider";

/**
 * LandingHeroZone — one client:load island for fixed chrome + hero.
 * Keeps LazyMotion scoped to above-the-fold interaction only.
 */
export function LandingHeroZone() {
  return (
    <MotionProvider>
      <MarketingChrome variant="hero" />
      <LandingHeroSection />
    </MotionProvider>
  );
}
