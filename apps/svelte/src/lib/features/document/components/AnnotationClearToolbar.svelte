<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, Trash2Icon, XIcon } from '$lib/icons';

	const CLEAR_DELAY_MS = 3_000;
	const PROGRESS_INTERVAL_MS = 50;

	let {
		visibleIds,
		onDismiss,
		disabled = false
	}: {
		visibleIds: readonly string[];
		onDismiss: (ids: string[]) => Promise<void>;
		disabled?: boolean;
	} = $props();

	let snapshotIds = $state<string[]>([]);
	let deadline = $state<number | null>(null);
	let progress = $state(0);
	let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
	let progressTimer: ReturnType<typeof setInterval> | undefined;

	const isClearing = $derived(deadline !== null);
	const progressBackground = $derived(
		`conic-gradient(var(--primary) ${progress * 360}deg, transparent 0)`
	);

	function clearTimers(): void {
		if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
		if (progressTimer !== undefined) clearInterval(progressTimer);
		deadlineTimer = undefined;
		progressTimer = undefined;
	}

	function resetCountdown(): void {
		clearTimers();
		snapshotIds = [];
		deadline = null;
		progress = 0;
	}

	function updateProgress(): void {
		if (deadline === null) return;
		progress = Math.min(1, Math.max(0, (Date.now() - (deadline - CLEAR_DELAY_MS)) / CLEAR_DELAY_MS));
	}

	function startClear(): void {
		if (disabled || isClearing) return;
		snapshotIds = [...visibleIds];
		deadline = Date.now() + CLEAR_DELAY_MS;
		progress = 0;
		progressTimer = setInterval(updateProgress, PROGRESS_INTERVAL_MS);
		deadlineTimer = setTimeout(async () => {
			const ids = [...snapshotIds];
			try {
				await onDismiss(ids);
			} finally {
				resetCountdown();
			}
		}, CLEAR_DELAY_MS);
	}

	onDestroy(clearTimers);
</script>

<div class="flex items-center gap-1">
	<span class="rounded-full p-0.5" style:background={progressBackground}>
		<Button
			type="button"
			size="icon-sm"
			variant="ghost"
			aria-label="Bersihkan anotasi"
			disabled={disabled || isClearing}
			class="rounded-full"
			onclick={startClear}
		>
			<Icon icon={Trash2Icon} class="size-4" />
		</Button>
	</span>

	{#if isClearing}
		<Button
			type="button"
			size="icon-sm"
			variant="ghost"
			aria-label="Batal clear"
			class="rounded-full"
			onclick={resetCountdown}
		>
			<Icon icon={XIcon} class="size-4" />
		</Button>
	{/if}
</div>
