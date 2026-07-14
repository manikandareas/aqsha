<script lang="ts">
	import OnboardingPage from '$lib/features/onboarding/OnboardingPage.svelte';

	/**
	 * `/onboarding` — port of apps/web/app/onboarding/page.tsx. Sits OUTSIDE `/app`, so it is not
	 * onboarding-gated (no redirect loop); it IS auth-gated by `hooks.server.ts` (not in the public
	 * allow-list). The server onboarding gate (FND-8) redirects un-onboarded `/app` visitors here;
	 * this wizard, on completion, sets the status cache and routes to `/app/explore`.
	 */
</script>

<OnboardingPage />
