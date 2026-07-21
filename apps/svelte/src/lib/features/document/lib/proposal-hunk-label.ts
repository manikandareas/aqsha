import type { ProposalHunk } from '../api';

const HEADING = /^(=+)\s+(.+?)\s*$/;

export function proposalHunkLabel(source: string, hunk: ProposalHunk): string {
	const lines = source.split('\n');
	const end = Math.max(0, Math.min(hunk.oldStart - 1, lines.length - 1));
	for (let index = end; index >= 0; index -= 1) {
		const match = HEADING.exec(lines[index] ?? '');
		if (match?.[2]) return match[2].trim();
	}
	const last = hunk.oldStart + Math.max(hunk.oldLines, 1) - 1;
	return `Baris ${hunk.oldStart}–${last}`;
}
