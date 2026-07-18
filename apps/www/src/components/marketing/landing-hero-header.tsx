"use client";

import { MarketingChrome } from "@/components/marketing/marketing-chrome";

/**
 * LandingHeroHeader — fixed chrome for the homepage hero island.
 * Scroll face + mobile sheet live in `MarketingChrome`.
 */
export function LandingHeroHeader() {
  return <MarketingChrome variant="hero" />;
}
