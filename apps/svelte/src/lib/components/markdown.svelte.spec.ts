import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Markdown from './Markdown.svelte';

// Dealbreaker #3: svelte-streamdown parity + security. Runs in real Chromium (client project).
// Security is the hard gate — a renderer that lets `javascript:`/`data:`/raw-<script> through is an
// automatic NO-GO. Parity here covers incomplete/malformed Markdown, tables, code, and CJK; Shiki/
// KaTeX/Mermaid richness is exercised in the live E2E, not pinned byte-for-byte at this gate.

const flush = () => new Promise((r) => setTimeout(r, 50));

describe('svelte-streamdown — security hardening (XSS corpus)', () => {
	beforeEach(() => {
		delete (window as unknown as Record<string, unknown>).__mdxss;
	});
	afterEach(() => {
		delete (window as unknown as Record<string, unknown>).__mdxss;
	});

	it('strips javascript: link hrefs', async () => {
		const { container } = render(Markdown, { content: '[click me](javascript:window.__mdxss=1)' });
		await flush();
		expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
		expect((window as unknown as Record<string, unknown>).__mdxss).toBeUndefined();
	});

	it('strips data: link hrefs', async () => {
		const { container } = render(Markdown, {
			content: '[x](data:text/html;base64,PHNjcmlwdD53aW5kb3cuX19tZHhzcz0xPC9zY3JpcHQ+)'
		});
		await flush();
		expect(container.querySelector('a[href^="data:"]')).toBeNull();
	});

	it('does not execute raw <script> or inline event handlers', async () => {
		render(Markdown, {
			content:
				'Hello\n\n<script>window.__mdxss = 1</script>\n\n<img src="x" onerror="window.__mdxss = 2" />'
		});
		await flush();
		// No live <script> injected into the doc and no handler fired.
		expect((window as unknown as Record<string, unknown>).__mdxss).toBeUndefined();
	});

	it('keeps a legitimate https link', async () => {
		render(Markdown, { content: '[Aqsha](https://example.com/paper)' });
		const link = page.getByRole('link', { name: 'Aqsha' });
		await expect.element(link).toHaveAttribute('href', 'https://example.com/paper');
	});
});

describe('svelte-streamdown — Markdown parity', () => {
	it('renders incomplete/malformed Markdown without throwing (streaming mid-token)', async () => {
		// Unterminated bold + unclosed code fence — the shape a stream produces before the next chunk.
		const { container } = render(Markdown, {
			content: '**bold not closed and a `code span\n\n```js\nconst a = 1'
		});
		await flush();
		expect(container.textContent).toContain('bold not closed');
	});

	it('renders a GFM table', async () => {
		const { container } = render(Markdown, {
			content: '| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |'
		});
		await expect.poll(() => container.querySelector('table')).not.toBeNull();
	});

	it('renders a fenced code block', async () => {
		const { container } = render(Markdown, { content: '```ts\nconst x: number = 1;\n```' });
		await expect.poll(() => container.querySelector('pre, code')).not.toBeNull();
	});

	it('renders CJK content intact', async () => {
		const { container } = render(Markdown, { content: '你好，世界 — こんにちは — 안녕하세요' });
		await flush();
		expect(container.textContent).toContain('你好，世界');
		expect(container.textContent).toContain('안녕하세요');
	});
});
