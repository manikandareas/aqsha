<script lang="ts">
	import { SignUp } from 'svelte-clerk';
	import { SeoHead } from '$lib/seo';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- Catch-all `[...rest]` mirrors Next's optional catch-all for Clerk path routing (plan §7).
     `signInUrl` + `forceRedirectUrl`/`fallbackRedirectUrl` mirror
     `apps/web/app/sign-up/[[...rest]]/page.tsx`: sign-up selesai → /onboarding (bukan /app). -->
<SeoHead seo={data.seo} />

<main class="flex min-h-svh items-center justify-center bg-background px-5 py-10">
	<SignUp signInUrl="/sign-in" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" />
</main>
