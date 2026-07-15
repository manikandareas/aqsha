<script lang="ts">
	import { SignIn } from 'svelte-clerk';
	import { PageTitle } from '$lib/seo';
</script>

<!-- Catch-all `[...rest]` for Clerk path routing (same role as Next optional catch-all `[[...rest]]`).
     svelte-clerk auto-derives `path` from the route; `signUpUrl`/`fallbackRedirectUrl` set explicitly.
     Centered chrome lives in `(auth)/+layout.svelte`. -->
<PageTitle title="Sign in" />

<SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/app" />
