import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { VedivadDocumentTypstEngine } from '../typst/document-typst-engine';
import TypstPreviewAnnotationHarness from './TypstPreviewAnnotationHarness.svelte';

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

const MULTI_PAGE_SVG = [
	'<svg xmlns="http://www.w3.org/2000/svg" class="typst-doc" viewBox="0 0 600 820" width="600" height="820">',
	'<g class="typst-page">',
	'<rect width="600" height="400" fill="#fff"></rect>',
	fragment(40, 40, 320, 24, HEADING, 18),
	'</g>',
	'<g class="typst-page" transform="translate(0 420)">',
	'<rect width="600" height="400" fill="#fff"></rect>',
	fragment(40, 40, 420, 16, PARA_1, 12),
	'</g>',
	'</svg>'
].join('');

const LONG_LINES = Array.from(
	{ length: 40 },
	(_, index) => `Bagian ${index + 1}: ${'isi pilihan panjang '.repeat(3).trim()}`
);
const LONG_SVG = [
	'<svg xmlns="http://www.w3.org/2000/svg" class="typst-doc" viewBox="0 0 600 1000" width="600" height="1000">',
	'<g class="typst-page">',
	'<rect width="600" height="1000" fill="#fff"></rect>',
	...LONG_LINES.map((text, index) => fragment(40, 20 + index * 22, 500, 10, text, 10)),
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

function pointerEvent(
	type: 'pointerdown' | 'pointermove' | 'pointerup',
	point: { x: number; y: number },
	buttons: number
): PointerEvent {
	return new PointerEvent(type, {
		pointerId: 7,
		pointerType: 'mouse',
		button: type === 'pointerdown' ? 0 : -1,
		buttons,
		clientX: point.x,
		clientY: point.y,
		bubbles: true,
		cancelable: true
	});
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
	it('SVG Vedivad mendukung hover dan drag multi-blok melalui source mapping', async () => {
		const source = `= ${HEADING}\n\n${PARA_1}\n${PARA_2}`;
		const onCreateAnnotation = vi.fn();
		const engine = await VedivadDocumentTypstEngine.create({ loadFonts: false });
		try {
			const compiled = new Promise<string>((resolve, reject) => {
				engine.onCompiled((result) => {
					if (result.svg) resolve(result.svg);
				});
				engine.onError((message) => reject(new Error(message)));
			});
			await engine.update(source, '');

			render(TypstPreviewAnnotationHarness, {
				svg: await compiled,
				outlineTitles: [HEADING],
				project: engine.project,
				source,
				mainFilePath: '/main.typ',
				onCreateAnnotation
			});
			await nextFrame();
			await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();
			const headingRun = document.querySelector('.typst-text')!;
			const { x, y } = centerOf(headingRun);
			scroller().dispatchEvent(
				new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true })
			);
			await nextFrame();

			await vi.waitFor(
				() => {
					expect(document.body.textContent).toContain(`"${HEADING}"`);
					expect(document.body.textContent).toContain('judul:');
					expect(document.querySelector('.annotation-outline')).not.toBeNull();
				},
				{ timeout: 5_000 }
			);

			const paragraphRun = document.querySelectorAll('.typst-text')[1]!;
			const paragraphPoint = centerOf(paragraphRun);
			scroller().dispatchEvent(
				new PointerEvent('pointermove', {
					clientX: paragraphPoint.x,
					clientY: paragraphPoint.y,
					bubbles: true
				})
			);
			await vi.waitFor(
				() => {
					expect(document.body.textContent).toContain('paragraf:');
					expect(document.body.textContent).toContain(PARA_1);
				},
				{ timeout: 5_000 }
			);

			const pageRect = document.querySelector('.typst-page')!.getBoundingClientRect();
			const blankStart = { x, y: pageRect.top + 4 };
			scroller().dispatchEvent(pointerEvent('pointerdown', blankStart, 1));
			paragraphRun.dispatchEvent(pointerEvent('pointermove', paragraphPoint, 1));
			paragraphRun.dispatchEvent(pointerEvent('pointerup', paragraphPoint, 0));
			scroller().dispatchEvent(new PointerEvent('pointerleave'));
			await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull(), {
				timeout: 5_000
			});
			await page.getByPlaceholder('Tulis catatan untuk Astra…').fill('Satukan konteks ini');
			await page.getByRole('button', { name: 'Tambah' }).click();
			const [draft, , elementLabel] = onCreateAnnotation.mock.calls[0]!;
			expect(draft.selectedText).toContain(HEADING);
			expect(draft.selectedText).toContain(PARA_1);
			expect(draft.rects.length).toBeGreaterThan(1);
			expect(elementLabel).toBe('pilihan');
		} finally {
			engine.dispose();
		}
	}, 60_000);

	it('hover blok heading menampilkan badge label + outline', async () => {
		render(TypstPreviewAnnotationHarness, { svg: SVG, outlineTitles: [HEADING] });
		await nextFrame();
		await enableModeAndHoverHeading(scroller());

		await expect.element(page.getByText(`"${HEADING}"`)).toBeInTheDocument();
		await expect.element(page.getByText('judul:')).toBeInTheDocument();
	});

	it('klik blok membuka popover inline; submit meneruskan draft + catatan', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			outlineTitles: [HEADING],
			onCreateAnnotation
		});
		await nextFrame();
		const el = scroller();
		await enableModeAndHoverHeading(el);

		const headingEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(HEADING)
		)!;
		expect(headingEl).not.toBeNull();
		await page.getByText(HEADING, { exact: true }).click();
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

	it('drag heading sampai paragraf membuat satu anotasi multi-blok', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			outlineTitles: [HEADING],
			onCreateAnnotation
		});
		await nextFrame();
		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();

		const headingEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(HEADING)
		)!;
		const paragraphEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(PARA_2)
		)!;
		const headingPoint = centerOf(headingEl);
		const paragraphPoint = centerOf(paragraphEl);

		headingEl.dispatchEvent(pointerEvent('pointerdown', headingPoint, 1));
		paragraphEl.dispatchEvent(pointerEvent('pointermove', paragraphPoint, 1));
		paragraphEl.dispatchEvent(pointerEvent('pointerup', paragraphPoint, 0));
		scroller().dispatchEvent(new PointerEvent('pointerleave'));

		await expect.element(page.getByRole('dialog', { name: 'Tambah anotasi' })).toBeInTheDocument();
		await page.getByPlaceholder('Tulis catatan untuk Astra…').fill('Hubungkan bagian ini');
		await page.getByRole('button', { name: 'Tambah' }).click();

		expect(onCreateAnnotation).toHaveBeenCalledTimes(1);
		const [draft, note, elementLabel] = onCreateAnnotation.mock.calls[0]!;
		expect(draft.selectedText).toContain(HEADING);
		expect(draft.selectedText).toContain(PARA_1);
		expect(draft.selectedText).toContain(PARA_2);
		expect(draft.page).toBe(1);
		expect(draft.rects.length).toBeGreaterThan(1);
		expect(note).toBe('Hubungkan bagian ini');
		expect(elementLabel).toBe('pilihan');
	});

	it('drag dapat dimulai dari ruang kosong halaman', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			outlineTitles: [HEADING],
			onCreateAnnotation
		});
		await nextFrame();
		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();

		const pageRect = document.querySelector('.typst-page')!.getBoundingClientRect();
		const blankSurface = document.querySelector('.typst-page rect')!;
		const startPoint = { x: pageRect.left + 12, y: pageRect.top + 12 };
		const paragraphEl = [...document.querySelectorAll('foreignObject')].find((fo) =>
			fo.textContent?.includes(PARA_2)
		)!;
		const paragraphPoint = centerOf(paragraphEl);

		blankSurface.dispatchEvent(pointerEvent('pointerdown', startPoint, 1));
		paragraphEl.dispatchEvent(pointerEvent('pointermove', paragraphPoint, 1));
		await vi.waitFor(() => {
			expect(document.querySelector('[data-annotation-drag-box]')).not.toBeNull();
		});
		paragraphEl.dispatchEvent(pointerEvent('pointerup', paragraphPoint, 0));

		await expect.element(page.getByRole('dialog', { name: 'Tambah anotasi' })).toBeInTheDocument();
		await page.getByPlaceholder('Tulis catatan untuk Astra…').fill('Komentari area ini');
		await page.getByRole('button', { name: 'Tambah' }).click();
		const [draft, , elementLabel] = onCreateAnnotation.mock.calls[0]!;
		expect(draft.selectedText).toContain(HEADING);
		expect(draft.selectedText).toContain(PARA_1);
		expect(draft.rects.length).toBeGreaterThan(1);
		expect(elementLabel).toBe('pilihan');
	});

	it('drag tidak membatasi jumlah rect maupun panjang teks dalam satu halaman', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreviewAnnotationHarness, {
			svg: LONG_SVG,
			onCreateAnnotation
		});
		await nextFrame();
		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();

		const pageRect = document.querySelector('.typst-page')!.getBoundingClientRect();
		const blankSurface = document.querySelector('.typst-page rect')!;
		const lastFragment = document.querySelectorAll('foreignObject')[LONG_LINES.length - 1]!;
		const startPoint = { x: pageRect.left + 40, y: pageRect.top + 4 };
		const endPoint = centerOf(lastFragment);

		blankSurface.dispatchEvent(pointerEvent('pointerdown', startPoint, 1));
		lastFragment.dispatchEvent(pointerEvent('pointermove', endPoint, 1));
		lastFragment.dispatchEvent(pointerEvent('pointerup', endPoint, 0));

		await expect.element(page.getByRole('dialog', { name: 'Tambah anotasi' })).toBeInTheDocument();
		await page.getByPlaceholder('Tulis catatan untuk Astra…').fill('Komentari seluruh halaman');
		await page.getByRole('button', { name: 'Tambah' }).click();

		const [draft] = onCreateAnnotation.mock.calls[0]!;
		expect(draft.rects.length).toBeGreaterThan(32);
		expect(draft.selectedText.length).toBeGreaterThan(2000);
		expect(draft.selectedText).toContain(LONG_LINES.at(-1));
	});

	it('drag kosong dan pointerleave membersihkan highlight lama tanpa membuka composer', async () => {
		render(TypstPreviewAnnotationHarness, { svg: SVG, outlineTitles: [HEADING] });
		await nextFrame();
		await enableModeAndHoverHeading(scroller());
		await expect.element(page.getByText(`"${HEADING}"`)).toBeInTheDocument();

		const pageRect = document.querySelector('.typst-page')!.getBoundingClientRect();
		const blankSurface = document.querySelector('.typst-page rect')!;
		const startPoint = { x: pageRect.right - 40, y: pageRect.bottom - 40 };
		const endPoint = { x: pageRect.right - 12, y: pageRect.bottom - 12 };
		blankSurface.dispatchEvent(pointerEvent('pointerdown', startPoint, 1));
		blankSurface.dispatchEvent(pointerEvent('pointermove', endPoint, 1));
		blankSurface.dispatchEvent(pointerEvent('pointerup', endPoint, 0));
		scroller().dispatchEvent(new PointerEvent('pointerleave'));
		await nextFrame();

		expect(document.querySelector('.annotation-outline')).toBeNull();
		expect(document.querySelector('[data-annotation-drag-box]')).toBeNull();
		await expect
			.element(page.getByRole('dialog', { name: 'Tambah anotasi' }))
			.not.toBeInTheDocument();
	});

	it('drag lintas halaman ditolak dengan feedback lokal', async () => {
		render(TypstPreviewAnnotationHarness, {
			svg: MULTI_PAGE_SVG,
			outlineTitles: [HEADING]
		});
		await nextFrame();
		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();
		const fragments = document.querySelectorAll('foreignObject');
		const start = fragments[0]!;
		const end = fragments[1]!;
		const startPoint = centerOf(start);
		const endPoint = centerOf(end);

		start.dispatchEvent(pointerEvent('pointerdown', startPoint, 1));
		end.dispatchEvent(pointerEvent('pointermove', endPoint, 1));
		end.dispatchEvent(pointerEvent('pointerup', endPoint, 0));

		await expect
			.element(page.getByRole('status'))
			.toHaveTextContent('Pilihan hanya dapat dibuat dalam satu halaman.');
		await expect
			.element(page.getByRole('dialog', { name: 'Tambah anotasi' }))
			.not.toBeInTheDocument();
	});

	it('Escape menutup popover tanpa membuat anotasi; dua paragraf rapat = satu blok paragraf', async () => {
		const onCreateAnnotation = vi.fn();
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			outlineTitles: [HEADING],
			onCreateAnnotation
		});
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

	it('membatalkan Clear mempertahankan overlay anotasi sent', async () => {
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			annotations: [
				{
					id: 'sent-id',
					page: 1,
					rects: Array.from({ length: 40 }, (_, index) => ({
						x: 0.05,
						y: 0.02 * index,
						w: 0.4,
						h: 0.01
					})),
					status: 'sent'
				}
			]
		});
		await nextFrame();
		await expect.element(page.getByRole('button', { name: 'Buka anotasi' })).toBeInTheDocument();
		expect(document.querySelectorAll('button[aria-label="Buka anotasi"]')).toHaveLength(1);

		await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();
		await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
		await page.getByRole('button', { name: 'Batal clear' }).click();

		await expect.element(page.getByRole('button', { name: 'Buka anotasi' })).toBeInTheDocument();
	});

	it('meneruskan snapshot anotasi sent ke Clear setelah tiga detik', async () => {
		const onDismissAnnotations = vi.fn().mockResolvedValue(undefined);
		render(TypstPreviewAnnotationHarness, {
			svg: SVG,
			annotations: [
				{
					id: 'sent-id',
					page: 1,
					rects: [{ x: 0.05, y: 0.1, w: 0.4, h: 0.1 }],
					status: 'sent'
				}
			],
			onDismissAnnotations
		});
		await nextFrame();

		vi.useFakeTimers();
		try {
			await page.getByRole('button', { name: 'Nyalakan mode anotasi' }).click();
			await page.getByRole('button', { name: 'Bersihkan anotasi' }).click();
			await vi.advanceTimersByTimeAsync(3000);
			expect(onDismissAnnotations).toHaveBeenCalledWith(['sent-id']);
		} finally {
			vi.useRealTimers();
		}
	});
});
