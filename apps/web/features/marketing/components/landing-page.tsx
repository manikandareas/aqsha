import { AudienceSection } from "@/features/marketing/components/audience-section";
import { BottomCtaSection } from "@/features/marketing/components/bottom-cta-section";
import { ComparisonTableSection } from "@/features/marketing/components/comparison-table-section";
import { FaqSection } from "@/features/marketing/components/faq-section";
import { FeatureSections } from "@/features/marketing/components/feature-sections";
import { HowItWorksSection } from "@/features/marketing/components/how-it-works-section";
import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import { LandingHeroSection } from "@/features/marketing/components/landing-hero-section";
import { PricingSection } from "@/features/marketing/components/pricing-section";
import { ProofQuotesSection } from "@/features/marketing/components/proof-quotes-section";

/**
 * Marketing home composition: `<main>` lives on `app/page.tsx` with semantic
 * colors; sections live here under `features/marketing/components/`.
 */
export function LandingPage() {
  return (
    <>
      <LandingHeader />
      <LandingHeroSection />
      <ComparisonTableSection />
      <ProofQuotesSection />
      <HowItWorksSection />
      <FeatureSections />
      <AudienceSection />
      <PricingSection />
      <FaqSection />
      <BottomCtaSection />
      <LandingFooter />
    </>
  );
}
