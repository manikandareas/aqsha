<script lang="ts">
	import { reveal, revealFade } from '$lib/motion';

	const footerColumns = [
		{
			heading: 'Produk',
			links: [
				{ label: 'Bandingin', href: '/#bandingin' },
				{ label: 'Cara kerja', href: '/#cara-kerja' },
				{ label: 'Fitur', href: '/#fitur' },
				{ label: 'Buat siapa', href: '/#buat-siapa' },
				{ label: 'Harga', href: '/#pricing' },
				{ label: 'Apa yang baru', href: '/changelog' },
				{ label: 'Blog', href: '/blog' }
			]
		},
		{
			heading: 'Akun',
			links: [
				{ label: 'Masuk', href: '/sign-in' },
				{ label: 'Coba gratis', href: '/sign-up' }
			]
		}
	] as const;

	// LandingFooter — struktur dipertahankan, motion diringkas jadi satu fade-in. Tagline Caveat di
	// bawah brand line.
	const revealOnce = reveal();
</script>

<footer class="w-full border-t border-border bg-background">
	<div class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
		<div
			class="{revealFade} grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-12 lg:grid-cols-[1fr_auto_auto] lg:gap-x-16"
			{@attach revealOnce}
		>
			<div class="sm:col-span-2 lg:col-span-1">
				<a href="/" class="inline-block text-xl font-semibold tracking-normal text-foreground">
					Aqsha
				</a>
				<p class="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
					Asisten AI buat riset — sumbernya beneran ada.
				</p>
				<p class="font-hand mt-4 text-lg text-foreground/60 sm:text-xl">dicek, baru dipercaya</p>
			</div>

			{#each footerColumns as column (column.heading)}
				<div class="min-w-0">
					<h3 class="text-sm font-medium leading-snug text-muted-foreground">{column.heading}</h3>
					<ul class="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
						{#each column.links as link (link.label)}
							<li>
								<a
									href={link.href}
									class="text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
								>
									{link.label}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</div>
</footer>
