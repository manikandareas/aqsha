import { BottomCtaSection } from "@/features/marketing/components/bottom-cta-section";
import { FaqSection } from "@/features/marketing/components/faq-section";
import { FeatureBlocksSection } from "@/features/marketing/components/feature-blocks-section";
import { ForYouSection } from "@/features/marketing/components/for-you-section";
import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import { LandingHeroSection } from "@/features/marketing/components/landing-hero-section";
import { WhyAqshaSection } from "@/features/marketing/components/why-aqsha-section";

/**
 * Marketing home composition — 6-section flow, each with its own visual
 * identity and one signature interaction (no repeated scaffold):
 *
 * 1. Hero — centered headline + magnetic CTA + big editorial image ("frame settles")
 * 2. Why Aqsha (#bandingin) — bg-card band, sticky editorial split ("masalah dicoret")
 * 3. Feature blocks (#cara-kerja, #fitur) — per-feature big image frames ("foto diluruskan")
 * 4. For you (#buat-siapa, #pricing) — editorial personas + pricing ("price odometer")
 * 5. FAQ (#faq) — narrow single column ("ghost index")
 * 6. Closing CTA — dark inversion ("reading reveal")
 *
 * `<main>` lives on `app/page.tsx`; sections live here under
 * `features/marketing/components/`.
 */
export function LandingPage() {
  return (
    <>
      <LandingHeader />
      <LandingHeroSection />
      <WhyAqshaSection />
      <FeatureBlocksSection />
      <ForYouSection />
      <FaqSection />
      <BottomCtaSection />
      <LandingFooter />
    </>
  );
}
