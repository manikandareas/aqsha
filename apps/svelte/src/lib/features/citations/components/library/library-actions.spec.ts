import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

describe('scoped library component contracts', () => {
	it('uses explicit semantic actions', () => {
		expect(read('./LibraryRow.svelte')).toContain('membershipAction');
		expect(read('./LibraryRow.svelte')).not.toContain('page.url');
		expect(read('./LibraryBulkBar.svelte')).toContain('destructiveLabel');
		expect(read('../CitationEmptyState.svelte')).toContain('onAddFromLibrary');
	});

	it('card context menu mirrors the row actions', () => {
		const menu = read('./LibraryCardContextMenu.svelte');
		expect(menu).toContain('Buka paper');
		expect(menu).toContain('Salin sitasi');
		expect(menu).toContain('membershipAction');
	});

	it('backdrop menu offers add actions and clipboard DOI', () => {
		const menu = read('./LibraryBackdropContextMenu.svelte');
		expect(menu).toContain('Unggah PDF');
		expect(menu).toContain('Tempel DOI');
		expect(menu).toContain('extractDoiFromText');
	});

	it('backdrop trigger wraps the grid, not the document', () => {
		expect(read('../../pages/LibraryPage.svelte')).toContain('LibraryBackdropContextMenu');
	});

	it('card renders the ingest badge from the pure model', () => {
		expect(read('./LibraryRow.svelte')).toContain('ingestBadge');
	});

	it('list polls only while ingest work remains', () => {
		expect(read('../../api.ts')).toContain('hasPendingIngest');
		expect(read('../../api.ts')).toContain('refetchInterval');
	});
});
