"use client";

import { BottomCtaSection } from "@/components/marketing/bottom-cta-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FeatureBlocksSection } from "@/components/marketing/feature-blocks-section";
import { ForYouSection } from "@/components/marketing/for-you-section";
import { LandingFooter } from "@/components/marketing/landing-footer";
import { LandingHeroHeader } from "@/components/marketing/landing-hero-header";
import { LandingHeroSection } from "@/components/marketing/landing-hero-section";
import { WhatsNewTeaserSection } from "@/components/marketing/whats-new-teaser-section";
import { WhyAqshaSection } from "@/components/marketing/why-aqsha-section";
import { MotionProvider } from "@/components/motion-provider";
import type { LatestUpdate, TeaserLatest } from "@/lib/marketing/latest";

export function LandingPage({
  latestUpdate,
  teaserLatest,
}: {
  latestUpdate: LatestUpdate | null;
  teaserLatest: TeaserLatest | null;
}) {
  return (
    <MotionProvider>
      {/* Hero baru terang (bg-background) — chrome glass gelap default tidak
          terbaca, jadi header dipaksa solid dari awal. */}
      <LandingHeroHeader forceSolid />
      <LandingHeroSection latestUpdate={latestUpdate} />
      <WhyAqshaSection />
      <FeatureBlocksSection />
      <ForYouSection />
      <FaqSection />
      <WhatsNewTeaserSection latest={teaserLatest} />
      <BottomCtaSection />
      <LandingFooter />
    </MotionProvider>
  );
}
