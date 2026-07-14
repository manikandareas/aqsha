<script lang="ts">
	import { SignIn } from 'svelte-clerk';
</script>

<!-- Catch-all `[...rest]` mirrors Next's optional catch-all `[[...rest]]` for Clerk's path routing
     (plan §7). signInUrl / signUpUrl / fallbackRedirectUrl come from PUBLIC_CLERK_* env. -->
<main class="flex min-h-svh items-center justify-center bg-background px-5 py-10">
	<SignIn />
</main>
