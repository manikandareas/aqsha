<script lang="ts" module>
	// One monotonically-increasing id per viewer instance keeps each rendered diagram's SVG root id
	// unique (mermaid.render() injects a temp node keyed by this id). `initialized` guards the one-time
	// `mermaid.initialize(...)` across every instance.
	let mermaidInstanceCounter = 0;
	let mermaidInitialized = false;

	function nextMermaidInstanceId(): number {
		mermaidInstanceCounter += 1;
		return mermaidInstanceCounter;
	}
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import type { Attachment } from 'svelte/attachments';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, Loader2Icon } from '$lib/icons';

	/**
	 * Renders a Mermaid diagram from source. `mermaid` touches the DOM (`document`, layout measurement)
	 * so it is dynamically imported inside an `{@attach}` guarded by `browser` (SSR never evaluates it).
	 * The attachment reads `source` (reactive) → it re-runs when the source changes, cancelling any
	 * in-flight render first. `securityLevel: "strict"` + `htmlLabels: false` keep untrusted diagram
	 * text from injecting markup.
	 */
	let { source }: { source: string } = $props();

	const diagramId = `artifact-mermaid-${nextMermaidInstanceId()}`;

	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let errorMessage = $state('');

	const renderDiagram: Attachment<HTMLDivElement> = (node) => {
		if (!browser) return;
		// Read `source` synchronously so the attachment re-runs (with cleanup) on every source change.
		const currentSource = source;
		let cancelled = false;
		status = 'loading';

		void (async () => {
			try {
				const mermaid = (await import('mermaid')).default;
				if (!mermaidInitialized) {
					mermaid.initialize({
						startOnLoad: false,
						securityLevel: 'strict',
						flowchart: { htmlLabels: false }
					});
					mermaidInitialized = true;
				}
				const { svg } = await mermaid.render(diagramId, currentSource);
				if (cancelled) return;
				node.innerHTML = svg;
				status = 'ready';
			} catch (renderError: unknown) {
				if (cancelled) return;
				errorMessage =
					renderError instanceof Error
						? renderError.message
						: 'Diagram Mermaid tidak bisa dirender.';
				status = 'error';
			}
		})();

		return () => {
			cancelled = true;
		};
	};
</script>

{#if status === 'error'}
	<p
		class="rounded-[8px] border border-destructive/30 bg-destructive/5 p-3 text-[13px] font-medium text-destructive"
	>
		{errorMessage}
	</p>
{:else}
	<div
		class="mermaid-artifact-canvas flex h-full min-h-[420px] w-full items-center justify-center overflow-auto p-4"
	>
		{#if status === 'loading'}
			<div
				class="flex min-h-[420px] w-full items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				Merender diagram…
			</div>
		{/if}
		<div
			{@attach renderDiagram}
			aria-label="Diagram Mermaid"
			class={cn(
				'h-full max-h-full w-full max-w-full [&_svg]:mx-auto [&_svg]:h-full [&_svg]:max-h-full [&_svg]:w-full [&_svg]:max-w-full',
				status === 'ready' ? '' : 'hidden'
			)}
		></div>
	</div>
{/if}
