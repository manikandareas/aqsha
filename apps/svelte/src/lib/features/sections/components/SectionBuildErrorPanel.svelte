<script lang="ts">
	import * as Collapsible from '@aqsha/ui-svelte/components/collapsible';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, AlertCircleIcon, ChevronDownIcon, SparklesIcon } from '$lib/icons';
	import type { LatexCompileError } from '../api';

	/**
	 * Panel ringkas kegagalan compile bab: daftar error (baris + pesan) + log compiler
	 * (collapsible). Tombol "Minta Astra perbaiki" hanya muncul bila handler diberikan.
	 */
	let {
		errors,
		logTail,
		onAskAstra
	}: {
		errors: LatexCompileError[];
		logTail: string | null;
		onAskAstra?: () => void;
	} = $props();

	let logOpen = $state(false);
</script>

<div
	class="flex flex-col gap-3 rounded-lg border-2 border-destructive/40 bg-destructive-soft/40 p-4"
>
	<div class="flex items-center gap-2">
		<Icon icon={AlertCircleIcon} class="size-4 text-destructive" />
		<h2 class="font-heading text-base font-bold">Compile bab gagal</h2>
	</div>
	{#if errors.length > 0}
		<ul class="flex flex-col gap-1.5">
			{#each errors.slice(0, 20) as error, i (i)}
				<li class="flex items-start gap-2 text-label">
					<Badge variant="outline">{error.severity}</Badge>
					<span class="text-foreground">
						{#if error.line != null}<span class="text-muted-foreground"
								>baris {error.line}:
							</span>{/if}{error.message}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
	{#if logTail}
		<Collapsible.Root open={logOpen} onOpenChange={(next) => (logOpen = next)}>
			<Collapsible.Trigger
				class="flex items-center gap-1 text-label text-muted-foreground transition-colors hover:text-foreground"
			>
				<Icon
					icon={ChevronDownIcon}
					class="size-3.5 transition-transform {logOpen ? 'rotate-180' : ''}"
				/>
				Log compiler
			</Collapsible.Trigger>
			<Collapsible.Content>
				<pre
					class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-md border-2 border-border bg-muted/40 p-2 text-micro text-muted-foreground">{logTail}</pre>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
	{#if onAskAstra}
		<div>
			<Button type="button" variant="secondary" size="sm" onclick={onAskAstra}>
				<Icon icon={SparklesIcon} class="size-4" />
				Minta Astra perbaiki
			</Button>
		</div>
	{/if}
</div>
