<script lang="ts">
	import { SignUp } from 'svelte-clerk';
	import { SeoHead } from '$lib/seo';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- Catch-all `[...rest]` for Clerk path routing. `signInUrl` + `forceRedirectUrl`/`fallbackRedirectUrl`
     send completed sign-ups to /onboarding (not /app). Centered chrome lives in `(auth)/+layout.svelte`. -->
<SeoHead seo={data.seo} />

<SignUp signInUrl="/sign-in" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" />
