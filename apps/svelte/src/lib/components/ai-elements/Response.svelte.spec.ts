import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Response from './Response.svelte';
import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
import type { StatsGroup } from '@aqsha/chat-core/stats-viz';

// Streamdown adapter sanitize/security (hard NO-GO if loosened) + custom-tag wiring (citations /
// stats / viz anti-forgery). Runs in real Chromium (client project).

const flush = () => new Promise((r) => setTimeout(r, 60));

const citations = new Map<number, SourceCardData[]>([
	[
		1,
		[
			{
				key: 'a',
				title: 'Nature paper',
				url: 'https://nature.com/x',
				doi: null,
				origin: 'web',
				citationNumber: 1
			}
		]
	]
]);

const statsGroups = new Map<string, StatsGroup>([
	[
		'run-1',
		{
			v: 1,
			runKey: 'run-1',
			analysis: 'descriptive',
			title: 'Statistik deskriptif',
			blocks: [
				{
					v: 1,
					type: 'stats-table',
					id: 't1',
					tableNumber: 1,
					table: {
						id: 't',
						title: 'Ringkasan',
						columns: ['Var', 'Mean'],
						rows: [['X1', '3.2']],
						notes: []
					}
				}
			]
		} as StatsGroup
	]
]);

describe('Response — security hardening (XSS corpus, not loosened for custom tags)', () => {
	beforeEach(() => delete (window as unknown as Record<string, unknown>).__mdxss);
	afterEach(() => delete (window as unknown as Record<string, unknown>).__mdxss);

	it('strips javascript: link hrefs', async () => {
		const { container } = render(Response, { text: '[click](javascript:window.__mdxss=1)' });
		await flush();
		expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
		expect((window as unknown as Record<string, unknown>).__mdxss).toBeUndefined();
	});

	it('strips data: link hrefs', async () => {
		const { container } = render(Response, {
			text: '[x](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX19tZHhzcz0xPC9zY3JpcHQ+)'
		});
		await flush();
		expect(container.querySelector('a[href^="data:"]')).toBeNull();
	});

	it('does not execute raw <script> or inline event handlers', async () => {
		render(Response, {
			text: 'Hello\n\n<script>window.__mdxss = 1</script>\n\n<img src="x" onerror="window.__mdxss = 2" />'
		});
		await flush();
		expect((window as unknown as Record<string, unknown>).__mdxss).toBeUndefined();
	});

	it('keeps a legitimate https link', async () => {
		render(Response, { text: '[Aqsha](https://example.com/paper)' });
		const link = page.getByRole('link', { name: 'Aqsha' });
		await expect.element(link).toHaveAttribute('href', 'https://example.com/paper');
	});
});

describe('Response — Markdown parity', () => {
	it('renders incomplete/malformed Markdown without throwing', async () => {
		const { container } = render(Response, {
			text: '**bold not closed and a `code span\n\n```js\nconst a = 1'
		});
		await flush();
		expect(container.textContent).toContain('bold not closed');
	});

	it('renders a GFM table', async () => {
		const { container } = render(Response, { text: '| A | B |\n| - | - |\n| 1 | 2 |' });
		await expect.poll(() => container.querySelector('table')).not.toBeNull();
	});

	it('renders CJK intact', async () => {
		const { container } = render(Response, { text: '你好，世界 — 안녕하세요' });
		await flush();
		expect(container.textContent).toContain('你好，世界');
	});
});

describe('Response — citation pills', () => {
	it('resolves [n] to a source pill when the map is provided', async () => {
		const { container } = render(Response, { text: 'Bukti kuat [1].', citations });
		await flush();
		const link = container.querySelector('a[href="https://nature.com/x"]');
		expect(link).not.toBeNull();
		expect(link?.textContent).toContain('nature.com');
	});

	it('degrades to the literal [n] text when no map is provided', async () => {
		const { container } = render(Response, { text: 'Bukti [1].' });
		await flush();
		expect(container.textContent).toContain('[1]');
		expect(container.querySelector('a[href="https://nature.com/x"]')).toBeNull();
	});
});

describe('Response — stats anti-forgery gate', () => {
	it('renders a real analysis group behind {{stats:runKey}}', async () => {
		const { container } = render(Response, { text: 'Hasil: {{stats:run-1}}', statsGroups });
		await expect
			.poll(() => container.querySelector('[data-stats-runkey="run-1"] table'))
			.not.toBeNull();
		// The raw marker must never leak as text.
		expect(container.textContent).not.toContain('{{stats:');
	});

	it('renders NOTHING for a forged runKey and never leaks the raw marker', async () => {
		const { container } = render(Response, { text: 'Palsu: {{stats:forged}}', statsGroups });
		await flush();
		expect(container.querySelector('[data-stats-runkey]')).toBeNull();
		expect(container.textContent).not.toContain('{{stats:');
	});

	it('renders nothing (not a table) when there is no stats gate at all', async () => {
		const { container } = render(Response, { text: 'Chat biasa {{stats:run-1}}' });
		await flush();
		expect(container.querySelector('table')).toBeNull();
		expect(container.textContent).not.toContain('{{stats:');
	});
});

describe('Response — deep-viz anti-forgery gate', () => {
	const fence = '```aqsha:viz\n{"v":1,"type":"consensus-meter","id":"c1"}\n```';

	it('renders a forged aqsha:viz fence as PLAIN CODE in ordinary chat (never a figure)', async () => {
		const { container } = render(Response, { text: fence });
		await flush();
		expect(container.querySelector('figure.deep-viz')).toBeNull();
		// Payload shows as code, not an official figure.
		expect(container.querySelector('pre, code')).not.toBeNull();
	});

	it('shows a compact fallback (not a crash) for an invalid payload in a /deep report', async () => {
		const { container } = render(Response, { text: '```aqsha:viz\n{not json\n```', viz: true });
		await flush();
		expect(container.textContent).toContain('tidak dapat ditampilkan');
	});
});
