<script lang="ts">
	// Phase-3 scaffolding stub. The onboarding state machine (background/interests/source/
	// finish) lands in Phase 5. This route exists now so BOTH the server onboarding gate
	// (hooks.server.ts, Phase 2) and the client OnboardingGate overlay have a real redirect
	// target instead of a 404. It sits OUTSIDE `/app`, so it is not onboarding-gated (no loop).
	import { FlickerSpinner } from '$lib/components/ui/flicker-spinner';
</script>

<main class="flex min-h-svh flex-col items-center justify-center gap-4 p-8 text-center">
	<FlickerSpinner class="size-7 text-muted-foreground" />
	<div class="flex flex-col gap-1">
		<h1 class="font-heading text-lg font-semibold text-foreground">Selamat datang di Aqsha</h1>
		<p class="text-sm text-muted-foreground">Onboarding hadir di fase berikutnya.</p>
	</div>
</main>
