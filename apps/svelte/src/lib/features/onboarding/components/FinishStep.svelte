<script lang="ts">
	import { Icon, SparklesIcon } from '$lib/icons';
	import type { OnboardingAnswers } from '../lib/onboarding-machine';

	// Port 1:1 from apps/web/features/onboarding/components/onboarding-steps.tsx (FinishStep).
	let { answers }: { answers: OnboardingAnswers } = $props();
</script>

<div>
	<span
		class="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
	>
		<Icon icon={SparklesIcon} class="size-5" />
	</span>
	<h1 class="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
		Siap! Feed kamu sudah disesuaikan
	</h1>
	<p class="mt-3 text-[15px] leading-relaxed text-muted-foreground">
		{answers.interests.length} bidang minat tersimpan. Selamat datang di Aqsha — yuk mulai jelajahi riset
		yang relevan buat kamu.
	</p>
</div>
