<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, MessageSquareIcon, SparklesIcon, Trash2Icon } from '$lib/icons';
	import type { AnnotationView } from '../api';
	import type { PlacedPin } from '../lib/annotation-pins';

	/**
	 * Penanda anotasi permanen di atas preview: lingkaran bernomor yang menempel pada bloknya,
	 * hover memunculkan catatan, klik membuka aksi. Semua node ber-atribut `data-annotation-ui`
	 * supaya hit-test mode anotasi mengabaikannya.
	 */
	let {
		pins,
		annotationsById,
		stageEl,
		scrollEl,
		activeId,
		contextIds,
		onFocus,
		onToggleContext,
		onAsk,
		onDismiss
	}: {
		pins: PlacedPin[];
		annotationsById: Map<string, AnnotationView>;
		stageEl: HTMLElement | null;
		scrollEl: HTMLElement | null;
		activeId: string | null;
		contextIds: ReadonlySet<string>;
		onFocus: (id: string) => void;
		onToggleContext: (id: string) => void;
		onAsk: (id: string) => void;
		onDismiss: (id: string) => void;
	} = $props();

	const PANEL_W = 264;
	const PANEL_GAP = 12;

	let openId = $state<string | null>(null);
	let hoverId = $state<string | null>(null);
	let panelH = $state(0);

	const openPin = $derived(pins.find((p) => p.id === openId) ?? null);
	const hoverPin = $derived(openId ? null : (pins.find((p) => p.id === hoverId) ?? null));

	function panelPosition(pin: PlacedPin, height: number) {
		if (!stageEl || !scrollEl) return null;
		const stageWidth = stageEl.clientWidth;
		const width = Math.min(PANEL_W, Math.max(200, stageWidth - 16));
		const visibleTop = scrollEl.scrollTop - stageEl.offsetTop;
		const visibleBottom = visibleTop + scrollEl.clientHeight;
		const left = Math.min(Math.max(pin.left, 8), Math.max(8, stageWidth - width - 8));
		let top = pin.top + PANEL_GAP + 22;
		if (top + height > visibleBottom - 12) top = pin.top - height - PANEL_GAP;
		return { left, top: Math.max(top, visibleTop + 8), width };
	}

	const openPanel = $derived(openPin ? panelPosition(openPin, panelH || 170) : null);
	const hoverPanel = $derived(hoverPin ? panelPosition(hoverPin, 76) : null);

	function toggle(id: string): void {
		openId = openId === id ? null : id;
		if (openId) onFocus(id);
	}

	/**
	 * Tutup popover lalu jalankan aksinya. Id disalin lebih dulu karena `openPin` diturunkan dari
	 * `openId`: menutup popover duluan membuatnya `null`, dan pembacaan `openPin.id` sesudah itu
	 * melempar sehingga aksinya tak pernah berjalan.
	 */
	function closeThen(id: string, run: (id: string) => void): void {
		openId = null;
		run(id);
	}
</script>

{#each pins as pin (pin.id)}
	{@const annotation = annotationsById.get(pin.id)}
	<button
		type="button"
		data-annotation-ui
		aria-label={`Anotasi ${pin.number}${annotation?.note ? `: ${annotation.note}` : ''}`}
		aria-expanded={openId === pin.id}
		class={[
			'absolute z-30 grid size-[22px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-micro font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			pin.floating
				? 'border-dashed border-muted-foreground/60 bg-card text-muted-foreground opacity-60'
				: pin.status === 'sent'
					? 'border-card bg-lemon text-lemon-foreground'
					: 'border-lemon bg-card text-foreground',
			contextIds.has(pin.id) && 'ring-2 ring-mint',
			activeId === pin.id && 'ring-2 ring-lemon'
		]}
		style:left={`${pin.left}px`}
		style:top={`${pin.top}px`}
		onmouseenter={() => (hoverId = pin.id)}
		onmouseleave={() => (hoverId = null)}
		onclick={() => toggle(pin.id)}
	>
		{pin.number}
	</button>
{/each}

{#if hoverPin && hoverPanel}
	{@const annotation = annotationsById.get(hoverPin.id)}
	<div
		data-annotation-ui
		role="tooltip"
		class="pointer-events-none absolute z-40 rounded-md bg-foreground px-2 py-1.5 text-label text-background"
		style:left={`${hoverPanel.left}px`}
		style:top={`${hoverPanel.top}px`}
		style:width={`${hoverPanel.width}px`}
	>
		<p class="line-clamp-3">{annotation?.note ?? 'Tanpa catatan'}</p>
		<p class="mt-1 text-micro opacity-70">
			{hoverPin.floating
				? 'teks sudah berubah'
				: hoverPin.status === 'sent'
					? 'terkirim ke Astra'
					: 'belum dikirim'}
		</p>
	</div>
{/if}

{#if openPin && openPanel}
	{@const annotation = annotationsById.get(openPin.id)}
	<div
		data-annotation-ui
		role="dialog"
		aria-label={`Anotasi ${openPin.number}`}
		bind:clientHeight={panelH}
		class="absolute z-40 flex flex-col gap-2 rounded-lg border-2 border-border bg-card p-2 shadow-[0_2px_0_0_var(--border)]"
		style:left={`${openPanel.left}px`}
		style:top={`${openPanel.top}px`}
		style:width={`${openPanel.width}px`}
	>
		{#if annotation?.selectedText}
			<p class="line-clamp-2 border-l-2 border-lemon pl-2 text-label text-muted-foreground">
				"{annotation.selectedText}"
			</p>
		{/if}
		<p class="text-sm">{annotation?.note ?? 'Tanpa catatan'}</p>
		{#if openPin.floating}
			<p class="text-label text-muted-foreground">
				Teks acuan sudah berubah, jadi anotasi ini tak bisa ditunjuk lagi.
			</p>
			<div class="flex justify-end">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onclick={() => closeThen(openPin.id, onDismiss)}
				>
					<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
				</Button>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-end gap-1.5">
				<Button type="button" size="sm" variant="ghost" onclick={() => onToggleContext(openPin.id)}>
					<Icon icon={MessageSquareIcon} class="size-3.5" />
					{contextIds.has(openPin.id) ? 'Lepas konteks' : 'Jadikan konteks'}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onclick={() => closeThen(openPin.id, onDismiss)}
				>
					<Icon icon={Trash2Icon} class="size-3.5" /> Hapus
				</Button>
				<Button type="button" size="sm" onclick={() => closeThen(openPin.id, onAsk)}>
					<Icon icon={SparklesIcon} class="size-3.5" /> Minta Astra
				</Button>
			</div>
		{/if}
	</div>
{/if}
