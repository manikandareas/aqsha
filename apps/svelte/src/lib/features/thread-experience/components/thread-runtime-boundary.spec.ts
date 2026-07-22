import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('thread runtime boundary', () => {
	it('merender snapshot shell sebelum ThreadAgent dinamis siap', async () => {
		const source = await readFile(new URL('./ThreadDetailShell.svelte', import.meta.url), 'utf8');

		expect(source).toContain("import('$lib/features/threads/state/thread-agent.svelte')");
		expect(source).toContain('<ThreadSnapshotSurface');
		expect(source).not.toContain('{#if loading || !agent}');
		expect(source).not.toContain('Memuat thread…');
	});
});
