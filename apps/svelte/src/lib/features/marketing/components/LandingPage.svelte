<script lang="ts">
	import BottomCtaSection from './BottomCtaSection.svelte';
	import FaqSection from './FaqSection.svelte';
	import FeatureBlocksSection from './FeatureBlocksSection.svelte';
	import ForYouSection from './ForYouSection.svelte';
	import LandingHeroSection from './LandingHeroSection.svelte';
	import WhatsNewTeaserSection from './WhatsNewTeaserSection.svelte';
	import WhyAqshaSection from './WhyAqshaSection.svelte';
	import type { LatestUpdate, TeaserLatest } from '../types';

	/**
	 * Marketing home composition — 6-section flow, tiap punya identitas visual + satu signature
	 * interaction (no repeated scaffold). Data terbaru (pill hero + teaser) di-inject `+page.server.ts`.
	 * Port `landing-page.tsx`. Header/footer TIDAK di sini — disediakan `(marketing)/+layout.svelte`
	 * (chrome bersama landing+blog+changelog).
	 */
	let {
		latestUpdate = null,
		teaserLatest = null
	}: { latestUpdate?: LatestUpdate | null; teaserLatest?: TeaserLatest | null } = $props();
</script>

<LandingHeroSection {latestUpdate} />
<WhyAqshaSection />
<FeatureBlocksSection />
<ForYouSection />
<FaqSection />
<WhatsNewTeaserSection latest={teaserLatest} />
<BottomCtaSection />
