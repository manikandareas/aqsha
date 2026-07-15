<script lang="ts">
	import { PageTitle } from '$lib/seo';
	import OnboardingPage from '$lib/features/onboarding/OnboardingPage.svelte';

	/**
	 * Onboarding wizard. Sits OUTSIDE `/app` so it is not onboarding-gated (no redirect loop); it IS
	 * auth-gated by `hooks.server.ts` (not in the public allow-list). The server onboarding gate
	 * redirects un-onboarded `/app` visitors here; on completion, routes to `/app/explore`.
	 */
</script>

<PageTitle title="Persiapan" />

<OnboardingPage />
