<script lang="ts">
	import { mapRange, motionContext } from '$lib/motion';
	import { Button } from '$lib/components/ui/button';

	// Absolute (/#...) supaya tetap jalan saat header dipakai di luar landing (mis. /blog).
	const navItems = [
		{ href: '/#bandingin', label: 'Bandingin' },
		{ href: '/#cara-kerja', label: 'Cara kerja' },
		{ href: '/#fitur', label: 'Fitur' },
		{ href: '/#buat-siapa', label: 'Buat siapa' },
		{ href: '/#pricing', label: 'Harga' },
		{ href: '/changelog', label: 'Apa yang baru' },
		{ href: '/blog', label: 'Blog' }
	] as const;

	// LandingHeader — sticky blur, fade tunggal saat mount. Signature: letter-spacing logo melebar
	// halus saat scroll melewati hero (0 → 0.06em over 300px).
	const motion = motionContext.get();
	const reduce = $derived(motion.reducedMotion);

	let scrollY = $state(0);
	const logoSpacing = $derived(reduce ? '0em' : `${mapRange(scrollY, [0, 300], [0, 0.06])}em`);
</script>

<svelte:window bind:scrollY />

<header
	class="animate-in fade-in ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none sticky top-0 z-30 bg-background/90 duration-500 backdrop-blur"
>
	<div
		class="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"
	>
		<div style:letter-spacing={logoSpacing}>
			<a href="/" class="text-xl font-semibold tracking-normal text-foreground">Aqsha</a>
		</div>
		<nav class="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
			{#each navItems as item (item.href)}
				<a class="inline-block transition-colors hover:text-foreground" href={item.href}>
					{item.label}
				</a>
			{/each}
		</nav>
		<div class="flex items-center gap-2">
			<Button
				href="/sign-in"
				variant="ghost"
				size="sm"
				class="hidden h-9 rounded-full px-4 text-muted-foreground hover:bg-muted hover:text-foreground sm:inline-flex"
			>
				Masuk
			</Button>
			<Button href="/sign-up" size="sm" class="h-9 rounded-full">Coba gratis</Button>
		</div>
	</div>
</header>
