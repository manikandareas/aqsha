<script lang="ts">
	import { motionContext } from '$lib/motion';

	// CountUp — angka menghitung naik 0→`to` saat masuk viewport (sekali). Reduced-motion → tampil
	// `to` langsung.
	let {
		to,
		suffix = '',
		duration = 1400
	}: { to: number; suffix?: string; duration?: number } = $props();

	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	let value = $state(0);

	// easeOutQuart ≈ cubic-bezier(0.22, 1, 0.36, 1) (kurva easing yang sama dipakai landing).
	const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

	const attach = (node: HTMLElement) => {
		if (reduce) {
			value = to;
			return;
		}
		let raf = 0;
		let started = false;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && !started) {
					started = true;
					io.disconnect();
					const start = performance.now();
					const tick = (now: number) => {
						const t = Math.min(1, (now - start) / duration);
						value = Math.round(to * easeOut(t));
						if (t < 1) raf = requestAnimationFrame(tick);
					};
					raf = requestAnimationFrame(tick);
				}
			},
			{ threshold: 0.5 }
		);
		io.observe(node);
		return () => {
			io.disconnect();
			if (raf) cancelAnimationFrame(raf);
		};
	};
</script>

<span class="tabular-nums" {@attach attach}>{reduce ? to : value}{suffix}</span>
