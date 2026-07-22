<script lang="ts">
	import type { TypstProject } from '@vedivad/codemirror-typst';
	import AnnotationModeControls from './AnnotationModeControls.svelte';
	import TypstPreview from './TypstPreview.svelte';
	import type { AnnotationDraft } from '../lib/annotation-selection';

	/**
	 * Test harness: header actions (toggle + clear) di luar preview, sama seperti ProjectHomePage.
	 */
	let {
		svg,
		annotations = [],
		outlineTitles = [],
		onCreateAnnotation,
		onDismissAnnotations,
		project = null,
		source = '',
		mainFilePath = '/main.typ'
	}: {
		svg: string | null;
		annotations?: Array<{
			id: string;
			page: number;
			rects: AnnotationDraft['rects'];
			status: string;
		}>;
		outlineTitles?: string[];
		onCreateAnnotation?: (draft: AnnotationDraft, note: string, elementLabel: string) => void;
		onDismissAnnotations?: (ids: string[]) => Promise<void>;
		project?: TypstProject | null;
		source?: string;
		mainFilePath?: string;
	} = $props();

	let annotationMode = $state(false);
	const visibleAnnotationIds = $derived(
		annotations.flatMap((annotation) =>
			annotation.status === 'open' || annotation.status === 'sent' ? [annotation.id] : []
		)
	);
</script>

<div class="flex h-[480px] flex-col">
	<div
		class="flex shrink-0 items-center justify-end gap-2 border-b border-border p-2"
		data-annotation-ui
	>
		<AnnotationModeControls
			bind:annotationMode
			visibleIds={visibleAnnotationIds}
			disabled={visibleAnnotationIds.length === 0}
			onDismiss={(ids) => onDismissAnnotations?.(ids) ?? Promise.resolve()}
		/>
	</div>
	<div class="min-h-0 flex-1">
		<TypstPreview
			bind:annotationMode
			{svg}
			{annotations}
			{outlineTitles}
			{onCreateAnnotation}
			{project}
			{source}
			{mainFilePath}
		/>
	</div>
</div>
