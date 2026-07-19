import { BottomCtaSection } from "@/features/marketing/components/bottom-cta-section";
import { FaqSection } from "@/features/marketing/components/faq-section";
import { FeatureBlocksSection } from "@/features/marketing/components/feature-blocks-section";
import { ForYouSection } from "@/features/marketing/components/for-you-section";
import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";
import {
  LandingHeroSection,
  type LatestUpdate,
} from "@/features/marketing/components/landing-hero-section";
import {
  WhatsNewTeaserSection,
  type TeaserLatest,
} from "@/features/marketing/components/whats-new-teaser-section";
import { WhyAqshaSection } from "@/features/marketing/components/why-aqsha-section";
import { CATEGORY_META } from "@/features/changelog/lib/categories";
import { publishedEntries } from "@/features/changelog/lib/entries";

/**
 * @deprecated Canonical landing is apps/www. This file is frozen leftover —
 * see features/marketing/README.md. Do not edit copy or sections here.
 *
 * Marketing home composition — 6-section flow, each with its own visual
 * identity and one signature interaction (no repeated scaffold):
 *
 * 1. Hero — centered headline + magnetic CTA + big editorial image ("frame settles")
 * 2. Why Aqsha (#bandingin) — bg-card band, sticky editorial split ("masalah dicoret")
 * 3. Feature blocks (#cara-kerja, #fitur) — per-feature big image frames ("foto diluruskan")
 * 4. For you (#buat-siapa, #pricing) — editorial personas + pricing ("price odometer")
 * 5. FAQ (#faq) — narrow single column ("ghost index")
 * 6. Closing CTA — dark inversion ("reading reveal")
 */
export function LandingPage() {
  // Dibaca build-time dari Content Collections (statis, nol cost runtime).
  const entries = publishedEntries();
  const latest = entries[0];

  const latestUpdate: LatestUpdate | null = latest
    ? {
        title: latest.title,
        href: latest.url,
        tag: latest.categories[0]
          ? CATEGORY_META[latest.categories[0]].label
          : "Update",
      }
    : null;

  const teaserLatest: TeaserLatest | null = latest
    ? {
        href: latest.url,
        title: latest.title,
        publishedAt: latest.publishedAt,
        summary: latest.excerpt,
      }
    : null;

  return (
    <>
      <LandingHeader />
      <LandingHeroSection latestUpdate={latestUpdate} />
      <WhyAqshaSection />
      <FeatureBlocksSection />
      <ForYouSection />
      <FaqSection />
      <WhatsNewTeaserSection latest={teaserLatest} />
      <BottomCtaSection />
      <LandingFooter />
    </>
  );
}
