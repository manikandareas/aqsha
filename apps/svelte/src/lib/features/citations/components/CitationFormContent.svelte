<script module lang="ts">
	import { formatCitationAuthor, type CitationDetail, type ManualCitationFields } from '../types';

	type FormState = {
		title: string;
		authors: string;
		publishedYear: string;
		venue: string;
		publisher: string;
		doi: string;
		url: string;
		tags: string;
	};

	function initialStateFor(citation: CitationDetail | null): FormState {
		return {
			title: citation?.title ?? '',
			authors: (citation?.authors ?? []).map(formatCitationAuthor).join('; '),
			publishedYear: citation?.publishedYear ? String(citation.publishedYear) : '',
			venue: citation?.venue ?? '',
			publisher: citation?.publisher ?? '',
			doi: citation?.doi ?? '',
			url: citation?.url ?? '',
			tags: (citation?.tags ?? []).join(', ')
		};
	}

	/** "Family, Given; Family, Given" / nama tunggal → CitationAuthor[]. */
	function parseAuthorsInput(value: string): ManualCitationFields['authors'] {
		const parts = value
			.split(';')
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.length === 0) return undefined;
		return parts.map((part) => {
			const comma = part.indexOf(',');
			if (comma > 0) {
				const family = part.slice(0, comma).trim();
				const given = part.slice(comma + 1).trim();
				return given ? { family, given } : { family };
			}
			return { literal: part };
		});
	}

	function fieldsFromState(state: FormState): ManualCitationFields {
		const year = Number.parseInt(state.publishedYear, 10);
		return {
			title: state.title.trim(),
			authors: parseAuthorsInput(state.authors),
			publishedYear: Number.isInteger(year) && year > 0 ? year : null,
			venue: state.venue.trim() || null,
			publisher: state.publisher.trim() || null,
			doi: state.doi.trim() || null,
			url: state.url.trim() || null
		};
	}

	function tagsFromState(state: FormState): string[] {
		return state.tags
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { readableApiErrorMessage } from '$lib/errors';

	let {
		citation,
		onOpenChange,
		onSubmit
	}: {
		citation: CitationDetail | null;
		onOpenChange: (open: boolean) => void;
		onSubmit: (value: { fields: ManualCitationFields; tags: string[] }) => Promise<unknown>;
	} = $props();

	let draft = $state<FormState>(untrack(() => initialStateFor(citation)));
	let pending = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!draft.title.trim() || pending) return;
		pending = true;
		error = null;
		try {
			await onSubmit({ fields: fieldsFromState(draft), tags: tagsFromState(draft) });
			onOpenChange(false);
		} catch (err) {
			error = readableApiErrorMessage(err, 'Gagal menyimpan referensi');
		} finally {
			pending = false;
		}
	}
</script>

{#snippet labeledInput(cfg: {
	label: string;
	hint?: string;
	required?: boolean;
	value: string;
	oninput: (event: Event) => void;
	inputMode?: 'numeric';
})}
	<label class="grid gap-1.5">
		<span class="text-[12px] font-semibold text-foreground">
			{cfg.label}
			{#if cfg.required}<span class="text-destructive"> *</span>{/if}
			{#if cfg.hint}<span class="ml-1.5 font-medium text-muted-foreground">({cfg.hint})</span>{/if}
		</span>
		<Input value={cfg.value} oninput={cfg.oninput} inputmode={cfg.inputMode} />
	</label>
{/snippet}

<Dialog.Content class="sm:max-w-md">
	<Dialog.Header>
		<Dialog.Title>{citation ? 'Edit referensi' : 'Tambah referensi manual'}</Dialog.Title>
		<Dialog.Description>
			Isi metadata inti — field lain bisa dilengkapi lewat edit kapan saja.
		</Dialog.Description>
	</Dialog.Header>
	<form class="grid gap-3" onsubmit={handleSubmit}>
		{@render labeledInput({
			label: 'Judul',
			required: true,
			value: draft.title,
			oninput: (event) => (draft.title = (event.currentTarget as HTMLInputElement).value)
		})}
		{@render labeledInput({
			label: 'Penulis',
			hint: 'pisahkan dengan ; — format Family, Given',
			value: draft.authors,
			oninput: (event) => (draft.authors = (event.currentTarget as HTMLInputElement).value)
		})}
		<div class="grid grid-cols-2 gap-3">
			{@render labeledInput({
				label: 'Tahun',
				value: draft.publishedYear,
				oninput: (event) => (draft.publishedYear = (event.currentTarget as HTMLInputElement).value),
				inputMode: 'numeric'
			})}
			{@render labeledInput({
				label: 'Venue/jurnal',
				value: draft.venue,
				oninput: (event) => (draft.venue = (event.currentTarget as HTMLInputElement).value)
			})}
		</div>
		<div class="grid grid-cols-2 gap-3">
			{@render labeledInput({
				label: 'Penerbit',
				value: draft.publisher,
				oninput: (event) => (draft.publisher = (event.currentTarget as HTMLInputElement).value)
			})}
			{@render labeledInput({
				label: 'DOI',
				value: draft.doi,
				oninput: (event) => (draft.doi = (event.currentTarget as HTMLInputElement).value)
			})}
		</div>
		{@render labeledInput({
			label: 'URL',
			value: draft.url,
			oninput: (event) => (draft.url = (event.currentTarget as HTMLInputElement).value)
		})}
		{@render labeledInput({
			label: 'Tag',
			hint: 'pisahkan dengan koma',
			value: draft.tags,
			oninput: (event) => (draft.tags = (event.currentTarget as HTMLInputElement).value)
		})}
		{#if error}
			<p class="text-[12px] font-medium text-destructive">{error}</p>
		{/if}
		<Dialog.Footer>
			<Button type="button" variant="ghost" onclick={() => onOpenChange(false)} disabled={pending}>
				Batal
			</Button>
			<Button type="submit" disabled={!draft.title.trim() || pending}>
				{pending ? 'Menyimpan…' : citation ? 'Simpan' : 'Tambah'}
			</Button>
		</Dialog.Footer>
	</form>
</Dialog.Content>
