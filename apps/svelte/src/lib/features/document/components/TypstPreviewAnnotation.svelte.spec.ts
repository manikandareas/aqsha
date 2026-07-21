import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TypstPreview from './TypstPreview.svelte';

/**
 * Alur mode anotasi ala agentation di atas SVG sintetis ber-semantic-layer (`foreignObject >
 * div.tsel`), tanpa worker Typst: toggle → hover (outline + badge) → klik → popover → submit.
 */

const HEADING = 'Judul Penelitian E2E';
const PARA_1 = 'Kalimat pertama paragraf pembuka.';
const PARA_2 = 'Kalimat kedua paragraf pembuka.';

function fragment(x: number, y: number, w: number, h: number, text: string, fontSize: number) {
	return `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" class="tsel" style="font-size: ${fontSize}px">${text}</div></foreignObject>`;
}

const SVG = [
	'<svg xmlns="http://www.w3.org/2000/svg" class="typst-doc" viewBox="0 0 600 400" width="600" height="400">',
	'<g class="typst-page">',
	'<rect width="600" height="400" fill="#fff"></rect>',
	fragment(40, 40, 320, 24, HEADING, 18),
	fragment(40, 90, 420, 16, PARA_1, 12),
	fragment(40, 110, 400, 16, PARA_2, 12),
	'</g>',
	'</svg>'
].join('');

async function nextFrame(): Promise<void> {
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

function centerOf(el: Element): { x: number; y: number } {
	const b = el.getBoundingClientRect();
	return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
}

async function enableModeAndHoverHeading(scroller: HTMLElement): Promise<void> {
	await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();
	const headingEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
		fo.textContent?.includes(HEADING)
	)!;
	const { x, y } = centerOf(headingEl);
	scroller.dispatchEvent(
		new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })
	);
	await nextFrame();
}

function scroller(): HTMLElement {
	return (
		document.querySelector('.cursor-crosshair') ??
		document.querySelector('.typst-preview-svg')!.closest('.overflow-y-auto')!
	);
}

describe('TypstPreview mode anotasi', () => {
	it('hover blok heading menampilkan badge label + outline', async () => {
		render(TypstPreview, { svg: SVG, outlineTitles: [HEADING] });
		await nextFrame();
		await enableModeAndHoverHeading(scroller());

		await expect.element(page.getByText(`"${HEADING}"`)).toBeInTheDocument();
		await expect.element(page.getByText('judul:')).toBeInTheDocument();
	});

	it('klik blok membuka popover inline; submit meneruskan draft + catatan', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreview, { svg: SVG, outlineTitles: [HEADING], onCreateAnnotation });
		await nextFrame();
		const el = scroller();
		await enableModeAndHoverHeading(el);

		const headingEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(HEADING)
		)!;
		const { x, y } = centerOf(headingEl);
		el.dispatchEvent(
			new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true })
		);
		await nextFrame();

		const dialog = page.getByRole('dialog', { name: 'Tambah anotasi' });
		await expect.element(dialog).toBeInTheDocument();

		// Tambah disabled selama catatan kosong.
		const addButton = page.getByRole('button', { name: 'Tambah' });
		await expect.element(addButton).toBeDisabled();

		await page.getByPlaceholder('Tulis catatan untuk Astra…').fill('Perjelas judul ini');
		await addButton.click();

		expect(onCreateAnnotation).toHaveBeenCalledTimes(1);
		const [draft, note, elementLabel] = onCreateAnnotation.mock.calls[0]!;
		expect(draft.selectedText).toBe(HEADING);
		expect(draft.page).toBe(1);
		expect(draft.rects.length).toBeGreaterThan(0);
		expect(note).toBe('Perjelas judul ini');
		expect(elementLabel).toBe('judul');
		// Popover tertutup setelah submit.
		await expect
			.element(page.getByRole('dialog', { name: 'Tambah anotasi' }))
			.not.toBeInTheDocument();
	});

	it('Escape menutup popover tanpa membuat anotasi; dua paragraf rapat = satu blok paragraf', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreview, { svg: SVG, outlineTitles: [HEADING], onCreateAnnotation });
		await nextFrame();
		const el = scroller();
		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();

		const paraEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(PARA_1)
		)!;
		const { x, y } = centerOf(paraEl);
		el.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
		await nextFrame();
		await expect.element(page.getByText('paragraf:')).toBeInTheDocument();

		el.dispatchEvent(
			new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true })
		);
		await nextFrame();
		const textarea = page.getByPlaceholder('Tulis catatan untuk Astra…');
		await expect.element(textarea).toBeInTheDocument();
		await textarea.fill('x');
		await page
			.getByPlaceholder('Tulis catatan untuk Astra…')
			.element()
			.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
			);
		await nextFrame();
		await expect
			.element(page.getByRole('dialog', { name: 'Tambah anotasi' }))
			.not.toBeInTheDocument();
		expect(onCreateAnnotation).not.toHaveBeenCalled();
	});
});
