import { untrack } from 'svelte';

/**
 * Reveal streaming text character-by-character. Append-only: the target is read each
 * target is read each `requestAnimationFrame` from a non-reactive field, so growing text stays smooth
 * without restarting the loop. When `enabled` is false (part done / history) the full text shows at
 * once. Starts from the text already present (not "") so a cold-load mid-turn doesn't crawl from 0.
 *
 * Must be called during component init (uses `$effect`). Returns a getter — read `smooth.current`.
 */
export function useSmoothText(
	getText: () => string,
	getEnabled: () => boolean = () => true,
	charsPerTick = 3
): { readonly current: string } {
	let shown = $state(untrack(getText));
	// Non-reactive target read inside the rAF loop; synced by an effect (never written during render).
	let target = untrack(getText);
	$effect(() => {
		target = getText();
	});

	$effect(() => {
		if (!getEnabled()) {
			shown = target;
			return;
		}
		let raf = 0;
		let shownLen = target.length;
		let lastSet = -1;
		let last = 0;
		const step = (ts: number) => {
			const t = target;
			if (shownLen > t.length) shownLen = t.length; // text shrank / was replaced
			if (shownLen < t.length) {
				if (!last) last = ts;
				const add = Math.max(1, Math.round(((ts - last) / 16) * charsPerTick));
				shownLen = Math.min(t.length, shownLen + add);
				last = ts;
			} else {
				last = 0;
			}
			if (shownLen !== lastSet) {
				lastSet = shownLen;
				shown = t.slice(0, shownLen);
			}
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	});

	return {
		get current(): string {
			return getEnabled() ? shown : getText();
		}
	};
}
