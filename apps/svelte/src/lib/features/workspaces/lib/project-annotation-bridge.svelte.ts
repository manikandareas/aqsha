import { toast } from 'svelte-sonner';
import { SvelteSet } from 'svelte/reactivity';
import {
	buildDocumentAnnotationMentionLabel,
	type ContextRef,
	contextRefKey,
	MAX_CONTEXT_ANNOTATIONS
} from '@aqsha/chat-core';
import { readableApiErrorMessage } from '$lib/errors/api-error';
import type { AnnotationView } from '$lib/features/document/api';
import type { AnnotationDraft } from '$lib/features/document/lib/annotation-selection';
import type { ComposerMentions } from '$lib/features/threads/state/composer-mentions.svelte';

type CreateInput = {
	kind: 'pin';
	page: number;
	rects: AnnotationDraft['rects'];
	selectedText: string;
	note: string;
};

type ProjectAnnotationBridgeOptions = {
	workspaceId: () => string;
	mentions: ComposerMentions;
	getAnnotations: () => readonly AnnotationView[];
	create: (
		input: CreateInput,
		handlers: { onSuccess: (annotation: AnnotationView) => void; onError: (error: unknown) => void }
	) => void;
	markSent: (input: { ids: string[]; threadId: string }) => void;
	scrollToText: (text: string) => void;
	setComposerDraft: (text: string) => void;
	selectChat: () => void;
};

/** Connects preview annotations to composer context chips and sent-turn bookkeeping. */
export class ProjectAnnotationBridge {
	readonly #options: ProjectAnnotationBridgeOptions;
	#activeId = $state<string | null>(null);

	constructor(options: ProjectAnnotationBridgeOptions) {
		this.#options = options;
	}

	get activeId(): string | null {
		return this.#activeId;
	}

	get selectedIds(): ReadonlySet<string> {
		return new SvelteSet(
			this.#options.mentions.selectionRefs.flatMap((ref) =>
				ref.kind === 'document-annotation' ? [ref.annotationId] : []
			)
		);
	}

	create = (draft: AnnotationDraft, note: string, elementLabel: string): void => {
		const canAddToComposer =
			this.#options.mentions.selectionRefs.filter((ref) => ref.kind === 'document-annotation')
				.length < MAX_CONTEXT_ANNOTATIONS;
		this.#options.create(
			{
				kind: 'pin',
				page: draft.page,
				rects: draft.rects,
				selectedText: draft.selectedText,
				note
			},
			{
				onSuccess: (annotation) => {
					if (!canAddToComposer) {
						toast.info(
							`Anotasi tersimpan. Lepas chip konteks untuk menambah lagi (maksimal ${MAX_CONTEXT_ANNOTATIONS}).`
						);
						return;
					}
					const selectedText = annotation.selectedText ?? draft.selectedText;
					this.#options.mentions.addSelectionRef({
						kind: 'document-annotation',
						workspaceId: this.#options.workspaceId(),
						annotationId: annotation.id,
						page: annotation.page,
						selectedText,
						note: annotation.note ?? note,
						elementLabel,
						label: buildDocumentAnnotationMentionLabel(elementLabel, selectedText)
					});
				},
				onError: (error) => toast.error(readableApiErrorMessage(error, 'Gagal menyimpan anotasi.'))
			}
		);
	};

	toggleContext = (id: string): void => {
		const existing = this.#options.mentions.selectionRefs.find(
			(ref) => ref.kind === 'document-annotation' && ref.annotationId === id
		);
		if (existing) {
			this.#options.mentions.removeSelectionRefByKey(contextRefKey(existing));
			return;
		}
		const annotation = this.#options.getAnnotations().find((item) => item.id === id);
		if (!annotation) return;
		const selectedText = annotation.selectedText ?? '';
		const elementLabel = annotation.selectedText ?? 'Bagian dokumen';
		this.#options.mentions.addSelectionRef({
			kind: 'document-annotation',
			workspaceId: this.#options.workspaceId(),
			annotationId: annotation.id,
			page: annotation.page,
			selectedText,
			note: annotation.note ?? '',
			elementLabel,
			label: buildDocumentAnnotationMentionLabel(elementLabel, selectedText)
		});
	};

	/** Siapkan giliran untuk anotasi ini: pasang sebagai konteks, isi composer, pindah ke Chat. */
	ask = (id: string): void => {
		const annotation = this.#options.getAnnotations().find((item) => item.id === id);
		if (!annotation) return;
		const alreadyContext = this.#options.mentions.selectionRefs.some(
			(ref) => ref.kind === 'document-annotation' && ref.annotationId === id
		);
		if (!alreadyContext) this.toggleContext(id);
		this.#options.setComposerDraft(
			annotation.note?.trim() ? annotation.note.trim() : 'Kerjakan anotasi ini.'
		);
		this.#options.selectChat();
	};

	focus = (id: string): void => {
		this.#activeId = id;
		const annotation = this.#options.getAnnotations().find((item) => item.id === id);
		if (annotation?.selectedText) this.#options.scrollToText(annotation.selectedText);
	};

	markTurnSent = (threadId: string, sentRefs: ContextRef[]): void => {
		const ids = sentRefs.flatMap((ref) =>
			ref.kind === 'document-annotation' ? [ref.annotationId] : []
		);
		if (ids.length > 0) this.#options.markSent({ ids, threadId });
	};
}
