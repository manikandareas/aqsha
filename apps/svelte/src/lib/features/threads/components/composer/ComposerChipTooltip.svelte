<script lang="ts">
	import { getPromptCommand } from '@aqsha/chat-core';
	import { splitTokenLabel } from '../../lib/token-pill';

	/**
	 * Hover tooltip for a chip inside the composer. Chips are plain DOM (built by
	 * `composer-inline-editor.ts`, not Svelte), so a per-chip tooltip primitive can't be used —
	 * TokenizedPromptInput delegates hover and renders ONE tooltip positioned from the chip rect,
	 * portalled to `document.body` to escape the composer's `overflow-hidden` + motion transform.
	 * Mirrors web `composer-chip-tooltip.tsx`.
	 */
	let { chip }: { chip: HTMLElement } = $props();

	const CONTEXT_KIND_LABELS: Record<string, string> = {
		workspace: 'Workspace',
		paper: 'Paper',
		'explore-paper': 'Paper Explore',
		news: 'Berita',
		'artifact-selection': 'Pilihan blok editor'
	};

	type ChipTooltipContent = { title: string; description?: string };

	function buildChipTooltipContent(el: HTMLElement): ChipTooltipContent | null {
		if (el.dataset.chip === 'command') {
			const command = getPromptCommand(el.dataset.commandId);
			if (!command) return null;
			return { title: `${command.slug} · ${command.label}`, description: command.description };
		}
		const kind = el.dataset.kind ?? '';
		const label = el.dataset.label ?? el.textContent ?? '';
		const { text } = splitTokenLabel(label);
		// Paper label = "workspace:title" — split so the full title becomes the main line.
		if (kind === 'paper') {
			const separator = text.indexOf(':');
			if (separator > 0) {
				return {
					title: text.slice(separator + 1).trim(),
					description: `Paper · ${text.slice(0, separator).trim()}`
				};
			}
		}
		const title = text.trim();
		if (!title) return null;
		return { title, description: CONTEXT_KIND_LABELS[kind] };
	}

	const content = $derived(chip.isConnected ? buildChipTooltipContent(chip) : null);
	const rect = $derived(chip.isConnected ? chip.getBoundingClientRect() : null);

	function portalToBody(node: HTMLElement) {
		document.body.appendChild(node);
		return () => node.remove();
	}
</script>

{#if content && rect}
	<div
		{@attach portalToBody}
		class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full"
		style="top: {rect.top - 6}px; left: {rect.left + rect.width / 2}px"
		role="tooltip"
	>
		<div class="relative max-w-xs rounded-md bg-foreground px-3 py-1.5 text-xs text-background">
			<p class="font-medium break-words">{content.title}</p>
			{#if content.description}
				<p class="mt-0.5 break-words text-background/70">{content.description}</p>
			{/if}
			<p class="mt-1 text-[10.5px] text-background/55">Klik untuk menghapus</p>
			<div
				class="absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-foreground"
			></div>
		</div>
	</div>
{/if}
