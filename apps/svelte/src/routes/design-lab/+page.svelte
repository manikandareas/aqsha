<script lang="ts">
	import { resolve } from '$app/paths';
	import { toggleMode } from 'mode-watcher';
	import { toast } from 'svelte-sonner';
	import { getLocalTimeZone, today, type DateValue } from '@internationalized/date';

	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { Switch } from '@aqsha/ui-svelte/components/switch';
	import { Slider } from '@aqsha/ui-svelte/components/slider';
	import { Progress } from '@aqsha/ui-svelte/components/progress';
	import { Separator } from '@aqsha/ui-svelte/components/separator';
	import { Skeleton } from '@aqsha/ui-svelte/components/skeleton';
	import { Kbd } from '@aqsha/ui-svelte/components/kbd';
	import { Toggle } from '@aqsha/ui-svelte/components/toggle';
	import { Calendar } from '@aqsha/ui-svelte/components/calendar';
	import { Band } from '@aqsha/ui-svelte/components/band';
	import * as Card from '@aqsha/ui-svelte/components/card';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import * as RadioGroup from '@aqsha/ui-svelte/components/radio-group';
	import * as Tabs from '@aqsha/ui-svelte/components/tabs';
	import * as ToggleGroup from '@aqsha/ui-svelte/components/toggle-group';
	import * as Alert from '@aqsha/ui-svelte/components/alert';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import * as Sheet from '@aqsha/ui-svelte/components/sheet';
	import * as Drawer from '@aqsha/ui-svelte/components/drawer';
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import * as Tooltip from '@aqsha/ui-svelte/components/tooltip';
	import * as HoverCard from '@aqsha/ui-svelte/components/hover-card';
	import * as Command from '@aqsha/ui-svelte/components/command';
	import * as Table from '@aqsha/ui-svelte/components/table';
	import * as Pagination from '@aqsha/ui-svelte/components/pagination';
	import * as InputOTP from '@aqsha/ui-svelte/components/input-otp';
	import * as Avatar from '@aqsha/ui-svelte/components/avatar';

	let sliderValue = $state([40]);
	let progressValue = $state(56);
	let selectedFruit = $state('');
	let calendarValue = $state<DateValue>(today(getLocalTimeZone()));
	let otpValue = $state('');

	const fruits = [
		{ value: 'apel', label: 'Apel' },
		{ value: 'mangga', label: 'Mangga' },
		{ value: 'rambutan', label: 'Rambutan' }
	];
	const rows = [
		{ judul: 'Systematic review LLM', sumber: 'arXiv', tahun: 2025, status: 'Dikutip' },
		{ judul: 'PLS-SEM di UMKM', sumber: 'Crossref', tahun: 2024, status: 'Dibaca' },
		{ judul: 'Metode campuran', sumber: 'OpenAlex', tahun: 2026, status: 'Antrian' }
	];
</script>

<svelte:head>
	<title>Design lab — Aqsha</title>
</svelte:head>

<div class="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-12">
	<header class="flex items-end justify-between gap-4">
		<div>
			<p class="font-hand text-coral-foreground text-xl">design lab</p>
			<h1 class="font-heading text-4xl">Aqsha UI v2</h1>
			<p class="text-muted-foreground mt-1 text-sm">
				Semua komponen @aqsha/ui-svelte dalam satu halaman. Hanya tersedia di dev.
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={toggleMode}>Ganti mode</Button>
	</header>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Buttons</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Button>Primary</Button>
			<Button variant="secondary">Secondary</Button>
			<Button variant="outline">Outline</Button>
			<Button variant="ghost">Ghost</Button>
			<Button variant="destructive">Hapus</Button>
			<Button variant="destructive-solid">Hapus permanen</Button>
			<Button variant="link">Link</Button>
			<Button disabled>Disabled</Button>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<Button size="xs">Extra small</Button>
			<Button size="sm">Small 32</Button>
			<Button size="default">Default 40</Button>
			<Button size="lg">Large 46</Button>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Badges & chips</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Badge>Default</Badge>
			<Badge variant="secondary">Secondary</Badge>
			<Badge variant="outline">Outline</Badge>
			<Badge variant="destructive">Destructive</Badge>
			<Badge variant="chip-mint">Selesai</Badge>
			<Badge variant="chip-lavender">/deep</Badge>
			<Badge variant="chip-coral">Baru</Badge>
			<Badge variant="chip-lemon">Draft</Badge>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Fields</h2>
		<div class="grid max-w-xl gap-4">
			<Input placeholder="Judul penelitianmu…" />
			<Input placeholder="Disabled" disabled />
			<Textarea placeholder="Catatan singkat…" />
			<Select.Root type="single" bind:value={selectedFruit}>
				<Select.Trigger class="w-full">
					{fruits.find((f) => f.value === selectedFruit)?.label ?? 'Pilih buah'}
				</Select.Trigger>
				<Select.Content>
					{#each fruits as fruit (fruit.value)}
						<Select.Item value={fruit.value} label={fruit.label} />
					{/each}
				</Select.Content>
			</Select.Root>
			<InputOTP.Root maxlength={4} bind:value={otpValue}>
				{#snippet children({ cells })}
					<InputOTP.Group>
						{#each cells as cell (cell)}
							<InputOTP.Slot {cell} />
						{/each}
					</InputOTP.Group>
				{/snippet}
			</InputOTP.Root>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Controls</h2>
		<div class="flex flex-wrap items-center gap-8">
			<label class="flex items-center gap-3 text-sm font-medium">
				<Checkbox checked /> Sitasi otomatis
			</label>
			<label class="flex items-center gap-3 text-sm font-medium">
				<Switch checked /> Mode fokus
			</label>
			<RadioGroup.Root value="apa">
				<label class="flex items-center gap-3 text-sm font-medium">
					<RadioGroup.Item value="apa" /> APA 7
				</label>
				<label class="flex items-center gap-3 text-sm font-medium">
					<RadioGroup.Item value="mla" /> MLA 9
				</label>
			</RadioGroup.Root>
			<Toggle>Sematkan</Toggle>
			<ToggleGroup.Root type="single" value="list">
				<ToggleGroup.Item value="list">List</ToggleGroup.Item>
				<ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
				<ToggleGroup.Item value="board">Board</ToggleGroup.Item>
			</ToggleGroup.Root>
		</div>
		<div class="max-w-md">
			<Slider type="multiple" bind:value={sliderValue} max={100} step={1} />
		</div>
		<div class="max-w-md">
			<Progress value={progressValue} />
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Tabs</h2>
		<Tabs.Root value="ringkasan">
			<Tabs.List>
				<Tabs.Trigger value="ringkasan">Ringkasan</Tabs.Trigger>
				<Tabs.Trigger value="sumber">Sumber</Tabs.Trigger>
				<Tabs.Trigger value="statistik">Statistik</Tabs.Trigger>
			</Tabs.List>
			<Tabs.Content value="ringkasan" class="text-muted-foreground pt-3 text-sm">
				Konten ringkasan riset.
			</Tabs.Content>
			<Tabs.Content value="sumber" class="text-muted-foreground pt-3 text-sm">
				Daftar sumber terkutip.
			</Tabs.Content>
			<Tabs.Content value="statistik" class="text-muted-foreground pt-3 text-sm">
				Panel statistik.
			</Tabs.Content>
		</Tabs.Root>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Alerts</h2>
		<div class="grid max-w-xl gap-3">
			<Alert.Root variant="mint">
				<Alert.Title>Sitasi tersimpan</Alert.Title>
				<Alert.Description>12 referensi ditambahkan ke pustaka.</Alert.Description>
			</Alert.Root>
			<Alert.Root variant="lemon">
				<Alert.Title>Kuota hampir habis</Alert.Title>
				<Alert.Description>Sisa 3 kredit /deep bulan ini.</Alert.Description>
			</Alert.Root>
			<Alert.Root variant="destructive">
				<Alert.Title>Gagal mengambil PDF</Alert.Title>
				<Alert.Description>Sumber menolak akses. Coba unggah manual.</Alert.Description>
			</Alert.Root>
		</div>
		<div class="flex gap-3">
			<Button size="sm" variant="outline" onclick={() => toast.success('Workspace disimpan')}>
				Toast sukses
			</Button>
			<Button size="sm" variant="outline" onclick={() => toast.error('Koneksi terputus')}>
				Toast error
			</Button>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Overlays</h2>
		<div class="flex flex-wrap items-center gap-3">
			<Dialog.Root>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Dialog</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Hapus workspace?</Dialog.Title>
						<Dialog.Description>Tindakan ini tidak bisa dibatalkan.</Dialog.Description>
					</Dialog.Header>
					<Dialog.Footer>
						<Button variant="outline">Batal</Button>
						<Button variant="destructive-solid">Hapus</Button>
					</Dialog.Footer>
				</Dialog.Content>
			</Dialog.Root>
			<Sheet.Root>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Sheet</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content class="p-5">
					<Sheet.Header class="p-0">
						<Sheet.Title>Detail sumber</Sheet.Title>
						<Sheet.Description>Panel samping 360px dengan tepi 2px.</Sheet.Description>
					</Sheet.Header>
				</Sheet.Content>
			</Sheet.Root>
			<Drawer.Root>
				<Drawer.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Drawer</Button>
					{/snippet}
				</Drawer.Trigger>
				<Drawer.Content>
					<div class="mx-auto flex max-w-sm flex-col gap-2 p-6 text-center">
						<p class="font-heading text-xl">Aksi cepat</p>
						<p class="text-muted-foreground text-sm">Drawer bawah dengan grip.</p>
					</div>
				</Drawer.Content>
			</Drawer.Root>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Menu</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content>
					<DropdownMenu.Item>Ganti nama</DropdownMenu.Item>
					<DropdownMenu.Item>Duplikat</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item variant="destructive">Hapus</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<Popover.Root>
				<Popover.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>Popover</Button>
					{/snippet}
				</Popover.Trigger>
				<Popover.Content class="p-4">
					<p class="text-sm font-semibold">Filter pustaka</p>
					<p class="text-muted-foreground text-sm">Permukaan melayang dengan lip 3px.</p>
				</Popover.Content>
			</Popover.Root>
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button variant="outline" {...props}>Tooltip</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Salin tautan <Kbd>⌘C</Kbd></Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
			<HoverCard.Root>
				<HoverCard.Trigger
					class="text-coral-foreground text-sm font-semibold underline-offset-3 hover:underline"
				>
					@astra
				</HoverCard.Trigger>
				<HoverCard.Content>
					<p class="text-sm font-bold">Astra</p>
					<p class="text-muted-foreground text-sm">Mesin riset Aqsha — kartu hover 280px.</p>
				</HoverCard.Content>
			</HoverCard.Root>
		</div>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Command</h2>
		<Command.Root class="border-border lip-modal max-w-lg rounded-lg border-2">
			<Command.Input placeholder="Cari perintah…" />
			<Command.List>
				<Command.Empty>Tidak ada hasil.</Command.Empty>
				<Command.Group heading="Riset">
					<Command.Item>/deep — riset mendalam</Command.Item>
					<Command.Item>/ringkas — ringkas artikel</Command.Item>
				</Command.Group>
			</Command.List>
		</Command.Root>
	</section>

	<section class="flex flex-col gap-4">
		<h2 class="font-heading text-2xl">Data</h2>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Judul</Table.Head>
					<Table.Head>Sumber</Table.Head>
					<Table.Head>Tahun</Table.Head>
					<Table.Head>Status</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.judul)}
					<Table.Row>
						<Table.Cell class="font-medium">{row.judul}</Table.Cell>
						<Table.Cell>{row.sumber}</Table.Cell>
						<Table.Cell class="tabular-nums">{row.tahun}</Table.Cell>
						<Table.Cell><Badge variant="outline">{row.status}</Badge></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
		<Pagination.Root count={48} perPage={10}>
			{#snippet children({ pages, currentPage })}
				<Pagination.Content>
					<Pagination.Item>
						<Pagination.Previous />
					</Pagination.Item>
					{#each pages as page (page.key)}
						{#if page.type === 'ellipsis'}
							<Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
						{:else}
							<Pagination.Item>
								<Pagination.Link {page} isActive={currentPage === page.value} />
							</Pagination.Item>
						{/if}
					{/each}
					<Pagination.Item>
						<Pagination.Next />
					</Pagination.Item>
				</Pagination.Content>
			{/snippet}
		</Pagination.Root>
		<div class="flex flex-wrap items-start gap-6">
			<Calendar type="single" bind:value={calendarValue} />
			<Card.Card class="w-72">
				<Card.CardHeader>
					<Card.CardTitle>Kartu riset</Card.CardTitle>
					<Card.CardDescription>Border 2px + bayangan lembut.</Card.CardDescription>
				</Card.CardHeader>
				<Card.CardContent class="flex items-center gap-3">
					<Avatar.Root>
						<Avatar.Fallback>AQ</Avatar.Fallback>
					</Avatar.Root>
					<div class="flex flex-col gap-1.5">
						<Skeleton class="h-3 w-32" />
						<Skeleton class="h-3 w-20" />
					</div>
				</Card.CardContent>
			</Card.Card>
		</div>
	</section>

	<Separator />

	<Band>
		<div class="flex flex-wrap items-start justify-between gap-8">
			<div>
				<p class="font-heading text-2xl">Aqsha</p>
				<p class="text-band-ink/70 text-sm">Ide, tertaut rapi.</p>
			</div>
			<div class="flex flex-col gap-2 text-sm">
				<span class="font-bold">Produk</span>
				<a href={resolve('/design-lab')}>Fitur</a>
				<a href={resolve('/design-lab')}>Harga</a>
				<a href={resolve('/design-lab')}>Changelog</a>
			</div>
		</div>
	</Band>
</div>
