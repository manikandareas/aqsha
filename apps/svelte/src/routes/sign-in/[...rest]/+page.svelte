<script lang="ts">
	import { SignIn } from 'svelte-clerk';
	import { siteName } from '$lib/seo/config';
</script>

<!-- Catch-all `[...rest]` mirrors Next's optional catch-all `[[...rest]]` for Clerk's path routing
     (plan §7). svelte-clerk auto-derives `path` from the route; `signUpUrl`/`fallbackRedirectUrl`
     passed explicitly to mirror `apps/web/app/sign-in/[[...rest]]/page.tsx`. Sign-in has no own
     metadata in web → inherits root default title "Aqsha". -->
<svelte:head>
	<title>{siteName}</title>
</svelte:head>

<main class="flex min-h-svh items-center justify-center bg-background px-5 py-10">
	<SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
</main>
