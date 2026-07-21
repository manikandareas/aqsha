import { describe, expect, it } from 'vitest';
import { TypstClient } from './client';

describe('TypstClient worker runtime', () => {
	it('mengembalikan SVG tanpa menjalankan renderer di main thread', async () => {
		const client = new TypstClient({ debounceMs: 0 });
		try {
			const result = await new Promise<string>((resolve, reject) => {
				client.onCompiled((compiled) => {
					if (compiled.svg) resolve(compiled.svg);
					else reject(new Error('Worker tidak menghasilkan SVG'));
				});
				client.onError((message) => reject(new Error(message)));
				client.update('= Preview worker\n\nDokumen tetap responsif.');
			});

			expect(result).toContain('<svg');
			expect(result).toContain('Preview worker');
		} finally {
			client.dispose();
		}
	}, 60_000);

	it('menyerialkan update yang datang saat render masih berjalan dan memenangkan sumber terbaru', async () => {
		const client = new TypstClient({ debounceMs: 0 });
		try {
			const result = new Promise<string>((resolve, reject) => {
				client.onCompiled((compiled) => {
					if (compiled.svg?.includes('Render terbaru')) resolve(compiled.svg);
				});
				client.onError((message) => reject(new Error(message)));
			});

			client.update('= Render lama\n\nKonten pertama.');
			await new Promise((resolve) => setTimeout(resolve, 250));
			client.update('= Render terbaru\n\nKonten final.');

			const svg = await result;
			expect(svg).toContain('Render terbaru');
			expect(svg).not.toContain('Render lama');
		} finally {
			client.dispose();
		}
	}, 60_000);
});
