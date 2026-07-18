"use client";

import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import { MotionProvider } from "@/components/motion-provider";

/**
 * LandingHeader — sticky solid chrome for inner marketing pages
 * (blog, changelog). Own MotionProvider: this is a separate Astro island.
 */
export function LandingHeader() {
  return (
    <MotionProvider>
      <MarketingChrome variant="solid" />
    </MotionProvider>
  );
}
