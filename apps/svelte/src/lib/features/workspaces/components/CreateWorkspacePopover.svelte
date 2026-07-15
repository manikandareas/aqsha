<script lang="ts">
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Icon, ArrowRightIcon, Loader2Icon, PlusIcon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';

	/**
	 * Sidebar "new workspace" affordance — port `apps/web/features/workspaces/components/
	 * create-workspace-popover.tsx`. Hovering the plus opens a card that stays interactive while the
	 * pointer is over the trigger or card; leaving both closes it while pristine. A dirty card (typed
	 * name / in-flight / error) only closes via Escape or click-outside.
	 */
	let { onSubmit }: { onSubmit: (value: { name: string }) => Promise<unknown> } = $props();

	// How long the pointer can dwell in the gap before the hover-open popover collapses.
	const CLOSE_DELAY_MS = 120;

	let open = $state(false);
	let name = $state('');
	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let anchorEl = $state<HTMLButtonElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);

	let closeTimer: ReturnType<typeof setTimeout> | null = null;

	function clearCloseTimer() {
		if (closeTimer) {
			clearTimeout(closeTimer);
			closeTimer = null;
		}
	}

	function close() {
		clearCloseTimer();
		open = false;
		name = '';
		error = null;
		isSubmitting = false;
	}

	function openNow() {
		clearCloseTimer();
		open = true;
	}

	// Once the card is dirty pointer-leave no longer closes it — an accidental mouse move must not
	// wipe a draft. A dirty card only closes via Escape / click-outside.
	function scheduleClose() {
		if (isSubmitting || name.length > 0 || error) return;
		clearCloseTimer();
		closeTimer = setTimeout(close, CLOSE_DELAY_MS);
	}

	function openAndFocus() {
		openNow();
		requestAnimationFrame(() => inputEl?.focus());
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = name.trim();
		if (!trimmed || isSubmitting) return;
		isSubmitting = true;
		error = null;
		try {
			await onSubmit({ name: trimmed });
			close();
		} catch (submitError) {
			error = readableApiErrorMessage(submitError, 'Gagal membuat workspace.');
			isSubmitting = false;
		}
	}

	// Drop any pending hover-close timer on unmount so it can't fire against a gone component.
	$effect(() => () => clearCloseTimer());
</script>

<Popover.Root {open} onOpenChange={(next) => (next ? openNow() : close())}>
	<button
		bind:this={anchorEl}
		type="button"
		onmouseenter={openNow}
		onmouseleave={scheduleClose}
		onclick={openAndFocus}
		class="flex size-5 shrink-0 items-center justify-center rounded-[5px] text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-primary/10 hover:text-primary"
		aria-label="Workspace baru"
	>
		<Icon icon={PlusIcon} class="size-3" />
	</button>
	<Popover.Content
		customAnchor={anchorEl}
		align="start"
		sideOffset={8}
		class="w-60 p-2"
		onOpenAutoFocus={(event) => event.preventDefault()}
		onmouseenter={clearCloseTimer}
		onmouseleave={scheduleClose}
	>
		<div class="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-white">
			<img
				src="/whimsical-floating-paper.png"
				alt=""
				class="absolute inset-0 size-full object-cover"
			/>
		</div>

		<div class="grid gap-3 p-1.5 pt-3">
			<div class="grid gap-1">
				<p class="font-heading text-[15px] font-semibold leading-tight text-card-foreground">
					Workspace baru
				</p>
				<p class="text-[12px] leading-relaxed text-muted-foreground">
					Buat area riset personal untuk mengumpulkan paper, catatan, dan artifact dalam satu
					tempat.
				</p>
			</div>

			<form class="grid gap-2" onsubmit={handleSubmit}>
				<div class="flex items-center gap-1.5">
					<Input
						bind:ref={inputEl}
						bind:value={name}
						placeholder="Nama workspace"
						aria-label="Nama workspace"
						disabled={isSubmitting}
						class="h-8 flex-1"
					/>
					<Button
						type="submit"
						size="icon"
						class="size-8"
						disabled={!name.trim() || isSubmitting}
						aria-label="Buat workspace"
					>
						{#if isSubmitting}
							<Icon icon={Loader2Icon} class="size-4 animate-spin" />
						{:else}
							<Icon icon={ArrowRightIcon} class="size-4" />
						{/if}
					</Button>
				</div>
				{#if error}
					<p class="text-[12px] font-medium text-destructive">{error}</p>
				{/if}
			</form>
		</div>
	</Popover.Content>
</Popover.Root>
