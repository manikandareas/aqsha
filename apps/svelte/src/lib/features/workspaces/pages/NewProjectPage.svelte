<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Textarea } from '@aqsha/ui-svelte/components/textarea';
	import { PageTitle } from '$lib/seo';
	import { getAuthState } from '$lib/auth/context.svelte';
	import { Icon, ArrowLeftIcon, FileTextIcon, UploadIcon, XIcon } from '$lib/icons';
	import { useUploadArtifact } from '$lib/features/artifacts/api';
	import KindInfoFields from '../components/KindInfoFields.svelte';
	import { useCreateWorkspace, useWorkspacesList } from '../api';
	import { isClerkSignedInQueryEnabled } from '../lib/query-gates';
	import { WORKSPACE_KIND_DESCRIPTIONS, WORKSPACE_KIND_LABELS } from '../labels';
	import {
		THESIS_FAMILY_KINDS,
		WORKSPACE_KINDS,
		type WorkspaceKind,
		type WorkspaceKindInfo
	} from '../types';

	/**
	 * Buat proyek dua tahap: pilih jenis (grid kartu) → form info (`?kind=`). Semua field opsional;
	 * kind_info di-prefill dari proyek se-jenis terbaru. Thesis-family bisa mengunggah pedoman PDF
	 * (best-effort — gagal ≠ batal). Jenis immutable setelah create → dipilih di depan.
	 */
	const kindParam = $derived(page.url.searchParams.get('kind'));
	const kind = $derived(
		WORKSPACE_KINDS.includes(kindParam as WorkspaceKind) ? (kindParam as WorkspaceKind) : null
	);
	const isThesisFamily = $derived(kind ? THESIS_FAMILY_KINDS.includes(kind) : false);

	const auth = getAuthState();
	const createWorkspace = useCreateWorkspace();
	const list = useWorkspacesList(
		() => false,
		() => isClerkSignedInQueryEnabled(auth.isLoaded, auth.userId)
	);

	let name = $state('');
	let topicNote = $state('');
	let deadlineInput = $state('');
	let kindInfo = $state<WorkspaceKindInfo>({});
	let guidelineFile = $state<File | null>(null);
	let submitting = $state(false);
	let createdWorkspaceId = $state('');

	const uploadGuideline = useUploadArtifact(() => createdWorkspaceId);

	// Prefill kind_info dari proyek se-jenis terbaru (sekali per kind; pedoman tidak di-prefill).
	let prefilledKind = $state<string | null>(null);
	$effect(() => {
		const k = kind;
		if (!k || prefilledKind === k || list.isPending) return;
		const items = list.data?.pages.flatMap((p) => p.items) ?? [];
		const prior = items
			.filter((w) => w.kind === k && w.kindInfo)
			.sort((a, b) => b.updatedAt - a.updatedAt)[0];
		kindInfo = prior?.kindInfo ? { ...prior.kindInfo } : {};
		prefilledKind = k;
	});

	function prunedKindInfo(): WorkspaceKindInfo {
		const out: WorkspaceKindInfo = {};
		for (const [key, val] of Object.entries(kindInfo)) {
			if (typeof val === 'string' && val.trim()) out[key as keyof WorkspaceKindInfo] = val.trim();
		}
		return out;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!kind || submitting) return;
		submitting = true;
		try {
			const cleanKindInfo = prunedKindInfo();
			const result = await createWorkspace.mutateAsync({
				kind,
				...(Object.keys(cleanKindInfo).length > 0 ? { kindInfo: cleanKindInfo } : {}),
				...(name.trim() ? { name: name.trim() } : {}),
				...(topicNote.trim() ? { topicNote: topicNote.trim() } : {}),
				...(deadlineInput ? { deadline: new Date(`${deadlineInput}T00:00:00`).getTime() } : {})
			});
			// Rate-limit = return union (bukan throw) — tampilkan inline, form tak hilang.
			if (!('id' in result)) {
				toast.warning(result.message);
				return;
			}
			createdWorkspaceId = result.id;
			if (guidelineFile) {
				try {
					await uploadGuideline.mutateAsync({ file: guidelineFile });
				} catch {
					toast.warning(
						'Proyek dibuat, tapi pedoman gagal diunggah. Unggah lagi dari Detail proyek.'
					);
				}
			}
			await goto(resolve('/app/(product)/projects/[projectId]', { projectId: result.id }));
		} catch {
			// Throw jaringan/tak terduga sudah di-toast oleh mutation onError; form dibiarkan terbuka.
		} finally {
			submitting = false;
		}
	}
</script>

<PageTitle title="Proyek baru" />

<div class="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-4 py-10">
	{#if !kind}
		<header class="grid gap-1.5">
			<Button
				href={resolve('/app/(product)')}
				variant="ghost"
				size="sm"
				class="w-fit gap-1.5 text-muted-foreground"
			>
				<Icon icon={ArrowLeftIcon} class="size-3.5" /> Kembali
			</Button>
			<h1 class="font-heading text-2xl font-bold">Proyek baru</h1>
			<p class="text-sm text-muted-foreground">Kamu lagi nulis apa? Pilih jenisnya dulu.</p>
		</header>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each WORKSPACE_KINDS as k (k)}
				<a
					href={`?kind=${k}`}
					class="group grid gap-1.5 rounded-lg border-2 border-border bg-card p-4 transition-colors hover:border-ring focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					<div class="flex items-center gap-2">
						<Icon icon={FileTextIcon} class="size-4 text-primary" />
						<span class="font-heading text-base font-bold">{WORKSPACE_KIND_LABELS[k]}</span>
					</div>
					<p class="text-label text-muted-foreground">{WORKSPACE_KIND_DESCRIPTIONS[k]}</p>
				</a>
			{/each}
		</div>
	{:else}
		<header class="grid gap-1.5">
			<Button
				href={page.url.pathname}
				variant="ghost"
				size="sm"
				class="w-fit gap-1.5 text-muted-foreground"
			>
				<Icon icon={ArrowLeftIcon} class="size-3.5" /> Ganti jenis
			</Button>
			<h1 class="font-heading text-2xl font-bold">Proyek {WORKSPACE_KIND_LABELS[kind]} baru</h1>
			<p class="text-sm text-muted-foreground">
				Semua isian opsional — bisa dilengkapi kapan pun dari Detail proyek.
			</p>
		</header>

		<form class="grid gap-5" onsubmit={submit}>
			<div class="grid gap-1.5">
				<label class="text-label font-medium" for="project-topic">Topik kasar</label>
				<Textarea
					id="project-topic"
					bind:value={topicNote}
					rows={2}
					placeholder="cth. dampak media sosial terhadap kesehatan mental remaja"
				/>
			</div>

			{#key kind}
				<KindInfoFields {kind} bind:value={kindInfo} />
			{/key}

			{#if isThesisFamily}
				<div class="grid gap-1.5">
					<span class="text-label font-medium">Pedoman penulisan (PDF, opsional)</span>
					{#if guidelineFile}
						<div
							class="flex items-center gap-2 rounded-md border-2 border-border bg-card px-3 py-2 text-label"
						>
							<Icon icon={FileTextIcon} class="size-4 shrink-0 text-muted-foreground" />
							<span class="min-w-0 flex-1 truncate">{guidelineFile.name}</span>
							<button
								type="button"
								class="rounded-md p-1 text-muted-foreground hover:text-destructive"
								aria-label="Hapus pedoman"
								onclick={() => (guidelineFile = null)}
							>
								<Icon icon={XIcon} class="size-4" />
							</button>
						</div>
					{:else}
						<label
							class="flex w-fit cursor-pointer items-center gap-1.5 rounded-md border-2 border-dashed border-border px-3 py-2 text-label text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
						>
							<Icon icon={UploadIcon} class="size-4" /> Unggah pedoman
							<input
								type="file"
								accept="application/pdf"
								class="sr-only"
								onchange={(e) => (guidelineFile = e.currentTarget.files?.[0] ?? null)}
							/>
						</label>
					{/if}
				</div>
			{/if}

			<details class="group">
				<summary class="cursor-pointer text-label font-medium text-muted-foreground">
					Opsional: judul & tenggat
				</summary>
				<div class="mt-3 grid gap-3">
					<div class="grid gap-1.5">
						<label class="text-label font-medium" for="project-name">Judul (boleh kosong)</label>
						<Input id="project-name" bind:value={name} placeholder="Bisa diisi nanti" />
					</div>
					<div class="grid gap-1.5">
						<label class="text-label font-medium" for="project-deadline">Tenggat</label>
						<Input id="project-deadline" type="date" bind:value={deadlineInput} />
					</div>
				</div>
			</details>

			<Button type="submit" disabled={submitting} class="w-fit">
				{submitting ? 'Membuat…' : 'Buat proyek'}
			</Button>
		</form>
	{/if}
</div>
