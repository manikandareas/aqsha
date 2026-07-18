/**
 * Satu-satunya modul yang menyentuh API `superdoc` — halaman/komponen lain memakai
 * `SectionEditorHandle` agar perubahan API vendor terkurung di sini. Dimuat dynamic
 * (butuh DOM; chunk besar hanya terunduh di route editor).
 */

export type CitationFieldPayload = {
	citationIds: string[];
	locator?: string;
	label?: string;
	prefix?: string;
	suffix?: string;
};

// Payload sitasi hidup di `alias` structured-content SDT (round-trip DOCX native lewat w:sdt).
// Prefix membedakan pill sitasi kita dari SDT lain yang mungkin sudah ada di template kampus.
const CITATION_ALIAS_PREFIX = 'aqsha-citation:';

export function encodeCitationAlias(payload: CitationFieldPayload): string {
	return `${CITATION_ALIAS_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeCitationAlias(
	alias: string | null | undefined
): CitationFieldPayload | null {
	if (!alias || !alias.startsWith(CITATION_ALIAS_PREFIX)) return null;
	try {
		const parsed = JSON.parse(alias.slice(CITATION_ALIAS_PREFIX.length)) as CitationFieldPayload;
		return Array.isArray(parsed?.citationIds) && parsed.citationIds.length > 0 ? parsed : null;
	} catch {
		return null;
	}
}

export type SectionEditorHandle = {
	exportDocx(): Promise<Blob>;
	insertCitation(nodeId: string, payload: CitationFieldPayload, text: string): void;
	listCitations(): Array<{ nodeId: string; payload: CitationFieldPayload }>;
	updateCitationText(nodeId: string, text: string): void;
	destroy(): void;
};

// SuperDoc validates structured-content ids as signed integers (`/^-?\d+$/`) and throws on
// anything else (a UUID would be rejected) — callers that generate a `nodeId` for
// `insertCitation` must go through this instead of `crypto.randomUUID()`.
export function generateStructuredContentId(): string {
	return String(Math.floor(Math.random() * 2 ** 32) - 2 ** 31);
}

// The shape `getStructuredContentTags` actually returns; the vendor's `EditorHelpers` type is
// a generic `Record<string, Record<string, (...args) => unknown>>` so the specific per-helper
// signature is lost at the call site and has to be reasserted here.
type StructuredContentTag = { node: { attrs: Record<string, unknown> } };

let toolbarIdCounter = 0;

export async function mountSectionEditor(opts: {
	editorEl: HTMLElement;
	toolbarEl: HTMLElement | null;
	documentUrl: string | null;
	fileName: string;
	onReady: () => void;
	onUpdate: () => void;
}): Promise<SectionEditorHandle> {
	const { SuperDoc, BlankDOCX } = await import('superdoc');
	await import('superdoc/style.css');

	// `toolbar` only accepts a CSS selector string (resolved via getElementById/querySelector
	// internally), not an element reference — give the host a stable id to target it.
	if (opts.toolbarEl && !opts.toolbarEl.id) {
		toolbarIdCounter += 1;
		opts.toolbarEl.id = `superdoc-toolbar-${toolbarIdCounter}`;
	}

	const superdoc = new SuperDoc({
		selector: opts.editorEl,
		...(opts.toolbarEl ? { toolbar: `#${opts.toolbarEl.id}` } : {}),
		// A document is required — leaving it unset configures zero documents and no editor is
		// ever created (there is no automatic blank-doc fallback), so a new section falls back
		// to the vendor's blank DOCX template.
		document: opts.documentUrl ?? BlankDOCX,
		documentMode: 'editing',
		onReady: opts.onReady,
		onEditorUpdate: opts.onUpdate
	});

	const editor = () => superdoc.activeEditor;

	return {
		async exportDocx() {
			return await superdoc.export({ triggerDownload: false });
		},
		insertCitation(nodeId, payload, text) {
			// `lockMode: 'contentLocked'` locks the pill's content (no manual edits) without
			// locking the wrapper itself, so the whole pill can still be selected and deleted.
			editor()?.commands.insertStructuredContentInline({
				attrs: { id: nodeId, alias: encodeCitationAlias(payload), lockMode: 'contentLocked' },
				text
			});
		},
		listCitations() {
			const ed = editor();
			if (!ed) return [];
			const tags = ed.helpers.structuredContentCommands.getStructuredContentTags(
				ed.state
			) as StructuredContentTag[];
			const out: Array<{ nodeId: string; payload: CitationFieldPayload }> = [];
			for (const tag of tags) {
				const payload = decodeCitationAlias(tag.node?.attrs?.alias as string | undefined);
				const nodeId = tag.node?.attrs?.id;
				if (payload && typeof nodeId === 'string' && nodeId) out.push({ nodeId, payload });
			}
			return out;
		},
		updateCitationText(nodeId, text) {
			editor()?.commands.updateStructuredContentById(nodeId, { text });
		},
		destroy() {
			superdoc.destroy();
		}
	};
}
