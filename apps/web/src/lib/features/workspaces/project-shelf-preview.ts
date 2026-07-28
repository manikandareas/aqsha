/**
 * Soft-render already-cleaned Typst sneak-peek source into document blocks.
 * Cleanup (preamble drop, collapsed re-split, length cap) owns the list/write path via
 * `previewFromTypstSource` — this module only turns cleaned source into presentation blocks.
 */

export type ShelfPreviewBlock =
	| { type: 'title'; text: string }
	| { type: 'heading'; level: 1 | 2 | 3; text: string }
	| { type: 'paragraph'; text: string };

export type ProjectShelfPreview = { blocks: ShelfPreviewBlock[] };

/** Unwrap common `#text(...)[content]` / `#align(...)[content]` content brackets. */
function unwrapBracketContent(line: string): string {
	const match = line.match(/^\s*#(?:text|align|block|box)\b[^\[]*\[(.*)\]\s*$/);
	if (!match) return line;
	return unwrapBracketContent(match[1] ?? line);
}

function stripInlineMarkup(text: string): string {
	return text
		.replace(/\\([\\#$*_`~@<>[\]])/g, '$1')
		.replace(/#(?:strong|emph|text)\b[^\[]*\[([^\]]*)\]/g, '$1')
		.replace(/#(?:cite|ref|label|link)\b[^\[]*(?:\[[^\]]*\])?/g, '')
		.replace(/https?:\/\/\S+/g, '')
		.replace(/[_*`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function headingFromLine(line: string): ShelfPreviewBlock | null {
	const match = line.match(/^\s*(={1,3})\s+(.+?)\s*$/);
	if (!match) return null;
	const level = Math.min(match[1]!.length, 3) as 1 | 2 | 3;
	const text = stripInlineMarkup(match[2] ?? '');
	if (!text) return null;
	return { type: 'heading', level, text };
}

/** Turn cleaned Typst sneak-peek source into readable shelf blocks (cap keeps card height stable). */
export function typstSourceToShelfBlocks(source: string, limit = 8): ShelfPreviewBlock[] {
	const blocks: ShelfPreviewBlock[] = [];
	let sawTitle = false;

	for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
		if (blocks.length >= limit) break;
		const trimmed = raw.trim();
		if (!trimmed) continue;

		const unwrapped = unwrapBracketContent(trimmed);
		const heading = headingFromLine(unwrapped);
		if (heading) {
			blocks.push(heading);
			continue;
		}

		// Leftover commands that survived cleanup (e.g. incomplete `#align(center)[`).
		if (unwrapped.startsWith('#')) continue;

		const text = stripInlineMarkup(unwrapped);
		if (!text || text.length < 2) continue;

		if (!sawTitle && blocks.length === 0 && text.length <= 80) {
			blocks.push({ type: 'title', text });
			sawTitle = true;
			continue;
		}

		blocks.push({ type: 'paragraph', text });
	}

	return blocks;
}

export function projectShelfPreview(workspace: {
	documentPreview: string | null;
}): ProjectShelfPreview | null {
	const documentPreview = workspace.documentPreview?.trim() ?? '';
	if (!documentPreview) return null;

	const blocks = typstSourceToShelfBlocks(documentPreview);
	if (blocks.length === 0) return null;

	return { blocks };
}
