# Onboarding Guided Research Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah onboarding Svelte Aqsha menjadi Guided Research Journey yang naratif, personal, aksesibel, dan berakhir di `/app` tanpa mengubah data atau kontrak backend.

**Architecture:** Pertahankan pure step machine dan state/mutation yang ada. Tambahkan satu pure presentation model untuk copy dan reflection finish, lalu biarkan komponen step tetap menjadi leaf UI sementara `OnboardingPage.svelte` hanya mengorkestrasi status, transition, submit, error, dan navigation. Bentuk visual akhir sengaja tidak dikunci oleh plan; implementation harus menemukan satu treatment kohesif melalui rendered visual review dan tetap memakai semantic tokens yang sudah ada.

**Tech Stack:** Svelte 5 runes, SvelteKit 2, TypeScript 6 strict, Tailwind CSS v4, TanStack Svelte Query 6, Vitest 4 server + browser projects, Playwright Chromium, Bun 1.3.10.

## Global Constraints

- Gunakan Bun `1.3.10`; jangan gunakan `npm`, `pnpm`, atau `yarn`.
- Sebelum mengubah `.svelte`, load dan ikuti `svelte-code-writer` serta `svelte-core-bestpractices` pada sesi implementasi.
- Semua brainstorming, planning, dan komentar plan menggunakan bahasa Indonesia; nama API, type, function, package, dan framework tetap English.
- Jangan menambah pertanyaan onboarding, dependency, migration database, endpoint, atau perubahan payload API.
- Data yang tetap wajib: `background`, minimal tiga `interests`, `heardAboutSource`, serta `heardAboutOther` bila source `lainnya`.
- Destination untuk pengguna completed dan CTA finish adalah `/app`, bukan `/app/explore`.
- Kutipan Feynman tampil dalam English asli; interpretasi Aqsha tampil dalam bahasa Indonesia.
- Klaim produk harus berbunyi “sekitar 320 juta karya ilmiah” atau “menelusuri katalog sekitar 320 juta karya ilmiah”; jangan menyiratkan full-text access universal.
- Seluruh warna memakai semantic tokens dari `apps/svelte/src/styles/globals.css`; jangan menambah hardcoded palette onboarding.
- Dukung light mode, dark mode, keyboard, focus-visible, mobile viewport pendek, dan `prefers-reduced-motion`.
- Bentuk/metafora elemen visual tidak ditentukan di plan. Gunakan satu treatment visual dan motion yang kohesif; jangan gunakan confetti, 3D spectacle, atau parallax berlebihan.
- Comments menjelaskan alasan atau constraint, bukan menarasikan code dan bukan merujuk phase/ticket/plan.
- Gunakan `readableApiErrorMessage(error, fallback)`; jangan tampilkan raw `error.message`.
- Preserve perubahan user yang sudah ada di working tree: grid overlap transition di `OnboardingPage.svelte`, stable font weight di `InterestChip.svelte`, reduced-motion check scale di `SelectableOption.svelte`, dan slide conditional input di `SourceStep.svelte`.
- Jangan stage atau commit perubahan working tree di luar file onboarding dan docs yang tercantum di plan.
- Design source of truth: `docs/superpowers/specs/2026-07-15-onboarding-guided-research-journey-design.md`.

## File Map

### Create

- `apps/svelte/src/lib/features/onboarding/lib/onboarding-content.ts` — structured journey copy, Feynman quote metadata, dan pure finish-reflection builder.
- `apps/svelte/src/lib/features/onboarding/lib/onboarding-content.spec.ts` — server-project unit tests untuk label mapping, summary, unknown IDs, dan copy contract.
- `apps/svelte/src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts` — browser tests untuk welcome quote dan narrative copy pada question steps.
- `apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte.spec.ts` — browser tests untuk personalized finish.
- `apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte` — recoverable initial status-query error UI.
- `apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts` — browser test untuk error semantics dan retry callback.
- `apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts` — browser test untuk textual progress semantics.

### Modify

- `apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.ts` — destination `/app` dan CTA labels.
- `apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.spec.ts` — regression contract untuk destination dan labels.
- `apps/svelte/src/lib/features/onboarding/components/WelcomeStep.svelte` — Feynman quote, interpretation, dan welcome narrative.
- `apps/svelte/src/lib/features/onboarding/components/StepHeading.svelte` — eyebrow + focusable step heading contract.
- `apps/svelte/src/lib/features/onboarding/components/BackgroundStep.svelte` — titik-berangkat copy.
- `apps/svelte/src/lib/features/onboarding/components/InterestsStep.svelte` — 320-juta catalog copy dan progress selection.
- `apps/svelte/src/lib/features/onboarding/components/SourceStep.svelte` — awal-perkenalan copy; preserve source randomization dan slide input.
- `apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte` — reflection dari background/minat.
- `apps/svelte/src/lib/features/onboarding/components/OnboardingLayout.svelte` — full-viewport canvas contract tanpa `max-w-xl` bottleneck.
- `apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte` — accessible textual progress.
- `apps/svelte/src/lib/features/onboarding/components/SelectableOption.svelte` — visual treatment final; preserve selection semantics dan reduced-motion scale.
- `apps/svelte/src/lib/features/onboarding/components/InterestChip.svelte` — visual treatment final; preserve stable font weight.
- `apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte` — status/error branches, shared destination, stable action row, focus handoff, dan final visual composition.

### Explicitly Unchanged

- `apps/svelte/src/lib/features/onboarding/state.svelte.ts` — mutation, cache update, answers, dan client error normalization sudah benar.
- `apps/svelte/src/routes/onboarding/+page.svelte` — route boundary dan page title tidak perlu berubah.
- `apps/api/**`, `packages/services/**`, `packages/db/**` — no backend/schema work.
- `apps/svelte/src/styles/globals.css` — consume existing tokens; jangan mengubah palette.

---

### Task 1: Pure Journey Content Model dan Navigation Contract

**Files:**

- Create: `apps/svelte/src/lib/features/onboarding/lib/onboarding-content.ts`
- Create: `apps/svelte/src/lib/features/onboarding/lib/onboarding-content.spec.ts`
- Modify: `apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.ts:27-48`
- Modify: `apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.spec.ts:1-64`

**Interfaces:**

- Consumes: `OnboardingAnswers`, `OnboardingStep`, `BACKGROUND_OPTIONS`, `INTEREST_OPTIONS`, dan `MIN_INTERESTS` yang sudah ada.
- Produces: `FEYNMAN_QUOTE`, `ONBOARDING_COPY`, `FinishReflection`, dan `buildFinishReflection(answers: OnboardingAnswers): FinishReflection`.
- Produces: `HOME_AFTER_ONBOARDING === '/app'`, `PRIMARY_LABEL.welcome === 'Mulai dari satu ide'`, dan `PRIMARY_LABEL.finish === 'Mulai research'`.

- [ ] **Step 1: Tambahkan failing tests untuk navigation dan CTA contract**

Update import `onboarding-machine.spec.ts` agar menyertakan `HOME_AFTER_ONBOARDING`, lalu ganti test primary labels menjadi:

```ts
import {
	ADVANCE_TARGET,
	BACK_TARGET,
	buildCompletePayload,
	EMPTY_ANSWERS,
	HOME_AFTER_ONBOARDING,
	isQuestionStep,
	isStepValid,
	type OnboardingAnswers,
	PRIMARY_LABEL,
	questionIndexOf,
	QUESTION_STEPS,
	toggleInterest
} from './onboarding-machine';

it('uses the approved onboarding destination and journey CTAs', () => {
	expect(HOME_AFTER_ONBOARDING).toBe('/app');
	expect(PRIMARY_LABEL.welcome).toBe('Mulai dari satu ide');
	expect(PRIMARY_LABEL.source).toBe('Selesai');
	expect(PRIMARY_LABEL.finish).toBe('Mulai research');
});
```

- [ ] **Step 2: Buat failing tests untuk copy dan finish reflection**

Create `onboarding-content.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OnboardingAnswers } from './onboarding-machine';
import { buildFinishReflection, FEYNMAN_QUOTE, ONBOARDING_COPY } from './onboarding-content';

const answers = (over: Partial<OnboardingAnswers> = {}): OnboardingAnswers => ({
	background: 'mahasiswa_s1',
	interests: ['ai_cs', 'pendidikan', 'psikologi'],
	source: 'teman',
	sourceOther: '',
	...over
});

describe('onboarding journey content', () => {
	it('keeps the verified English Feynman quote and approved product claims', () => {
		expect(FEYNMAN_QUOTE).toEqual({
			text: 'The first principle is that you must not fool yourself—and you are the easiest person to fool.',
			attribution: 'Richard Feynman',
			sourceUrl: 'https://magazine.caltech.edu/post/feynman-at-100',
			interpretation:
				'Sesuatu yang terdengar meyakinkan belum tentu benar. Aqsha membantu mencari dan memeriksa; kamu tetap menentukan apa yang layak dipercaya.'
		});
		expect(ONBOARDING_COPY.interests.description).toContain('sekitar 320 juta karya ilmiah');
		expect(ONBOARDING_COPY.interests.description).not.toContain('akses penuh');
	});

	it('maps background and up to three interests to human labels', () => {
		expect(buildFinishReflection(answers())).toEqual({
			backgroundLabel: 'Mahasiswa S1',
			visibleInterestLabels: ['Kecerdasan buatan & ilmu komputer', 'Pendidikan', 'Psikologi'],
			remainingInterestCount: 0,
			interestSummary: 'Kecerdasan buatan & ilmu komputer, Pendidikan, dan Psikologi'
		});
	});

	it('summarizes interests after the first three labels', () => {
		const reflection = buildFinishReflection(
			answers({
				interests: ['ai_cs', 'pendidikan', 'psikologi', 'hukum', 'fisika']
			})
		);
		expect(reflection.visibleInterestLabels).toHaveLength(3);
		expect(reflection.remainingInterestCount).toBe(2);
		expect(reflection.interestSummary).toBe(
			'Kecerdasan buatan & ilmu komputer, Pendidikan, Psikologi, dan 2 bidang lain'
		);
	});

	it('omits unknown background and ignores unknown interests without crashing', () => {
		expect(
			buildFinishReflection(
				answers({
					background: 'unknown',
					interests: ['unknown-a', 'unknown-b', 'unknown-c']
				})
			)
		).toEqual({
			backgroundLabel: null,
			visibleInterestLabels: [],
			remainingInterestCount: 0,
			interestSummary: 'bidang yang kamu pilih'
		});
	});
});
```

- [ ] **Step 3: Jalankan tests untuk membuktikan RED**

Run dari `apps/svelte`:

```bash
bun run test:unit --run src/lib/features/onboarding/lib/onboarding-machine.spec.ts src/lib/features/onboarding/lib/onboarding-content.spec.ts --project server
```

Expected: FAIL karena `onboarding-content.ts` belum ada, destination masih `/app/explore`, dan CTA masih copy lama.

- [ ] **Step 4: Implement pure content model**

Create `onboarding-content.ts`:

```ts
import { BACKGROUND_OPTIONS, INTEREST_OPTIONS, MIN_INTERESTS } from './onboarding-options';
import type { OnboardingAnswers, OnboardingStep } from './onboarding-machine';

type JourneyStepCopy = Readonly<{
	eyebrow: string;
	title: string;
	description: string;
}>;

export const FEYNMAN_QUOTE = {
	text: 'The first principle is that you must not fool yourself—and you are the easiest person to fool.',
	attribution: 'Richard Feynman',
	sourceUrl: 'https://magazine.caltech.edu/post/feynman-at-100',
	interpretation:
		'Sesuatu yang terdengar meyakinkan belum tentu benar. Aqsha membantu mencari dan memeriksa; kamu tetap menentukan apa yang layak dipercaya.'
} as const;

export const ONBOARDING_COPY = {
	welcome: {
		eyebrow: 'Mulai sebelum merasa siap',
		title: 'Kamu nggak harus tahu semuanya untuk mulai.',
		description:
			'Bawa satu ide yang masih mentah. Kita akan mencari pertanyaan, sumber, dan arah berikutnya bersama.'
	},
	background: {
		eyebrow: 'Titik berangkat',
		title: 'Kamu saat ini...',
		description: 'Setiap perjalanan research punya titik berangkat yang berbeda.'
	},
	interests: {
		eyebrow: 'Arah rasa penasaran',
		title: 'Apa yang membuatmu terus penasaran?',
		description: `Pilih minimal ${MIN_INTERESTS}. Di antara sekitar 320 juta karya ilmiah, mari mulai dari hal yang benar-benar berarti buatmu.`
	},
	source: {
		eyebrow: 'Awal perkenalan',
		title: 'Dari mana kamu menemukan Aqsha?',
		description: 'Sebelum kita mulai, bantu kami memahami bagaimana perjalananmu sampai ke sini.'
	},
	finish: {
		eyebrow: 'Langkah pertamamu',
		title: 'Rasa penasaranmu sekarang punya arah.',
		description: 'Aqsha siap membantu mencari dan memeriksa; keputusan akhirnya tetap milikmu.'
	}
} satisfies Record<OnboardingStep, JourneyStepCopy>;

export type FinishReflection = Readonly<{
	backgroundLabel: string | null;
	visibleInterestLabels: string[];
	remainingInterestCount: number;
	interestSummary: string;
}>;

const labelById = (options: ReadonlyArray<{ id: string; label: string }>, id: string | null) =>
	id ? (options.find((option) => option.id === id)?.label ?? null) : null;

const formatCompleteList = (labels: string[]): string => {
	if (labels.length === 0) return 'bidang yang kamu pilih';
	if (labels.length === 1) return labels[0]!;
	if (labels.length === 2) return `${labels[0]} dan ${labels[1]}`;
	return `${labels.slice(0, -1).join(', ')}, dan ${labels.at(-1)}`;
};

export function buildFinishReflection(answers: OnboardingAnswers): FinishReflection {
	const interestLabels = answers.interests
		.map((id) => labelById(INTEREST_OPTIONS, id))
		.filter((label): label is string => label !== null);
	const visibleInterestLabels = interestLabels.slice(0, 3);
	const remainingInterestCount = Math.max(0, interestLabels.length - visibleInterestLabels.length);
	const interestSummary =
		remainingInterestCount > 0
			? `${visibleInterestLabels.join(', ')}, dan ${remainingInterestCount} bidang lain`
			: formatCompleteList(visibleInterestLabels);

	return {
		backgroundLabel: labelById(BACKGROUND_OPTIONS, answers.background),
		visibleInterestLabels,
		remainingInterestCount,
		interestSummary
	};
}
```

- [ ] **Step 5: Update destination dan CTA constants**

Di `onboarding-machine.ts`, replace constants terkait dengan:

```ts
export const HOME_AFTER_ONBOARDING = '/app';

export const PRIMARY_LABEL: Record<OnboardingStep, string> = {
	welcome: 'Mulai dari satu ide',
	background: 'Lanjut',
	interests: 'Lanjut',
	source: 'Selesai',
	finish: 'Mulai research'
};

export const STEP_LABEL: Partial<Record<OnboardingStep, string>> = {
	background: 'Titik berangkat',
	interests: 'Arah rasa penasaran',
	source: 'Awal perkenalan'
};
```

- [ ] **Step 6: Jalankan tests untuk membuktikan GREEN**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/lib/onboarding-machine.spec.ts src/lib/features/onboarding/lib/onboarding-content.spec.ts --project server
```

Expected: semua onboarding server tests PASS.

- [ ] **Step 7: Commit Task 1 saja**

```bash
git add apps/svelte/src/lib/features/onboarding/lib/onboarding-content.ts apps/svelte/src/lib/features/onboarding/lib/onboarding-content.spec.ts apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.ts apps/svelte/src/lib/features/onboarding/lib/onboarding-machine.spec.ts
git commit -m "feat(svelte): add onboarding journey content model"
```

---

### Task 2: Welcome Quote dan Narrative Question Steps

**Files:**

- Create: `apps/svelte/src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/onboarding/components/WelcomeStep.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/StepHeading.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/BackgroundStep.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/InterestsStep.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/SourceStep.svelte`

**Interfaces:**

- Consumes: `FEYNMAN_QUOTE` dan `ONBOARDING_COPY` dari Task 1.
- Produces: `StepHeading` props `{ eyebrow: string; title: string; subtitle: string }` dan heading hook `[data-onboarding-heading]` untuk Task 5.
- Preserves: `SourceStep` module-scope shuffled source order, `SOURCE_OTHER` pinned last, conditional input slide, autofocus after explicit “Lainnya” selection, dan reduced-motion branch.

- [ ] **Step 1: Tulis browser tests untuk narrative contract**

Create `onboarding-steps.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import WelcomeStep from './WelcomeStep.svelte';
import BackgroundStep from './BackgroundStep.svelte';
import InterestsStep from './InterestsStep.svelte';
import SourceStep from './SourceStep.svelte';

describe('onboarding journey steps', () => {
	it('opens with the English Feynman quote and Indonesian interpretation', async () => {
		const { container } = render(WelcomeStep);
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Kamu nggak harus tahu semuanya untuk mulai.'
				})
			)
			.toBeInTheDocument();
		expect(container.querySelector('blockquote')?.textContent).toContain(
			'The first principle is that you must not fool yourself'
		);
		expect(container.textContent).toContain('Sesuatu yang terdengar meyakinkan belum tentu benar');
	});

	it('frames background as the user starting point and preserves selection semantics', async () => {
		render(BackgroundStep, { value: 'mahasiswa_s1', onselect: vi.fn() });
		await expect
			.element(page.getByText('Setiap perjalanan research punya titik berangkat yang berbeda.'))
			.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Mahasiswa S1' }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('states the bounded OpenAlex catalog claim and minimum selection count', async () => {
		render(InterestsStep, {
			value: ['ai_cs', 'pendidikan', 'psikologi'],
			ontoggle: vi.fn()
		});
		await expect.element(page.getByText(/sekitar 320 juta karya ilmiah/)).toBeInTheDocument();
		await expect.element(page.getByText('3 dipilih')).toBeInTheDocument();
	});

	it('keeps the attribution question direct and renders every source option', async () => {
		render(SourceStep, {
			value: null,
			other: '',
			onselect: vi.fn(),
			onotherchange: vi.fn()
		});
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Dari mana kamu menemukan Aqsha?'
				})
			)
			.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Lainnya' })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Jalankan browser test untuk membuktikan RED**

Run dari `apps/svelte`:

```bash
bun run test:unit --run src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts --project client
```

Expected: FAIL karena welcome quote dan narrative copy baru belum dirender.

- [ ] **Step 3: Perluas `StepHeading` tanpa mengunci visual composition**

Replace `StepHeading.svelte` dengan contract berikut. Class detail boleh disesuaikan saat visual review Task 5, tetapi semantic structure dan data hook wajib tetap:

```svelte
<script lang="ts">
	let { eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string } = $props();
</script>

<header class="mb-6">
	<p class="mb-3 font-mono text-xs tracking-wider text-muted-foreground">{eyebrow}</p>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading text-3xl leading-none font-normal tracking-tight text-foreground sm:text-4xl"
	>
		{title}
	</h1>
	<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
</header>
```

- [ ] **Step 4: Implement semantic welcome quote dan interpretation**

Replace `WelcomeStep.svelte` dengan:

```svelte
<script lang="ts">
	import { FEYNMAN_QUOTE, ONBOARDING_COPY } from '../lib/onboarding-content';

	const copy = ONBOARDING_COPY.welcome;
</script>

<section>
	<p class="mb-4 font-mono text-xs tracking-wider text-muted-foreground">{copy.eyebrow}</p>
	<blockquote class="max-w-3xl border-l border-border pl-5">
		<p class="font-heading text-2xl leading-tight text-foreground sm:text-3xl">
			“{FEYNMAN_QUOTE.text}”
		</p>
		<footer class="mt-3 font-mono text-xs text-muted-foreground">
			— {FEYNMAN_QUOTE.attribution}
		</footer>
	</blockquote>
	<p class="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
		{FEYNMAN_QUOTE.interpretation}
	</p>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading mt-8 max-w-3xl text-4xl leading-none font-normal tracking-tight text-foreground sm:text-5xl"
	>
		{copy.title}
	</h1>
	<p class="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">{copy.description}</p>
</section>
```

- [ ] **Step 5: Wire structured copy ke tiga question steps**

Di setiap component, import `ONBOARDING_COPY`, define `const copy`, lalu render `StepHeading` dengan exact contract.

`BackgroundStep.svelte`:

```svelte
<script lang="ts">
	import { BACKGROUND_OPTIONS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import SelectableOption from './SelectableOption.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, onselect }: { value: string | null; onselect: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.background;
</script>

<div>
	<StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.description} />
	<div class="grid gap-2.5">
		{#each BACKGROUND_OPTIONS as option (option.id)}
			<SelectableOption selected={value === option.id} onclick={() => onselect(option.id)}>
				{option.label}
			</SelectableOption>
		{/each}
	</div>
</div>
```

`InterestsStep.svelte` keeps its option loop and counter, but uses:

```svelte
<script lang="ts">
	import { INTEREST_OPTIONS } from '../lib/onboarding-options';
	import { ONBOARDING_COPY } from '../lib/onboarding-content';
	import InterestChip from './InterestChip.svelte';
	import StepHeading from './StepHeading.svelte';

	let { value, ontoggle }: { value: string[]; ontoggle: (id: string) => void } = $props();
	const copy = ONBOARDING_COPY.interests;
</script>

<div>
	<StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.description} />
	<div class="flex flex-wrap gap-2">
		{#each INTEREST_OPTIONS as option (option.id)}
			<InterestChip selected={value.includes(option.id)} onclick={() => ontoggle(option.id)}>
				{option.label}
			</InterestChip>
		{/each}
	</div>
	<p class="mt-4 font-mono text-xs text-muted-foreground" aria-live="polite">
		{value.length} dipilih
	</p>
</div>
```

Di `SourceStep.svelte`, preserve kedua script blocks dan seluruh randomization/slide code; apply exact diff berikut:

```diff
 <script lang="ts">
 	import { prefersReducedMotion } from 'svelte/motion';
 	import { slide } from 'svelte/transition';
 	import { Input } from '$lib/components/ui/input';
+	import { ONBOARDING_COPY } from '../lib/onboarding-content';
 	import SelectableOption from './SelectableOption.svelte';
 	import StepHeading from './StepHeading.svelte';

 	const reduce = $derived(prefersReducedMotion.current);
+	const copy = ONBOARDING_COPY.source;
@@
-	<StepHeading
-		title="Dari mana kamu tahu Aqsha?"
-		subtitle="Membantu kami tahu cara orang menemukan Aqsha."
-	/>
+	<StepHeading eyebrow={copy.eyebrow} title={copy.title} subtitle={copy.description} />
```

````

- [ ] **Step 6: Jalankan browser test untuk membuktikan GREEN**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts --project client
````

Expected: 4 tests PASS; tidak ada Svelte compile warning.

- [ ] **Step 7: Jalankan Svelte typecheck sebelum commit**

Run dari repo root:

```bash
bun run typecheck:svelte
```

Expected: `svelte-check found 0 errors and 0 warnings`.

- [ ] **Step 8: Commit Task 2 saja**

`SourceStep.svelte` sudah memiliki user-owned slide/reduced-motion hunk sebelum plan dimulai. Stage narrative import/copy hunks saja; biarkan slide hunk unstaged sampai Task 5 mengintegrasikan seluruh transition treatment.

```bash
git add apps/svelte/src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts apps/svelte/src/lib/features/onboarding/components/WelcomeStep.svelte apps/svelte/src/lib/features/onboarding/components/StepHeading.svelte apps/svelte/src/lib/features/onboarding/components/BackgroundStep.svelte apps/svelte/src/lib/features/onboarding/components/InterestsStep.svelte
git add -p apps/svelte/src/lib/features/onboarding/components/SourceStep.svelte
git diff --cached -- apps/svelte/src/lib/features/onboarding/components/SourceStep.svelte
git commit -m "feat(svelte): add onboarding journey narrative"
```

Expected staged `SourceStep.svelte` diff: hanya `ONBOARDING_COPY` import, `const copy`, dan `StepHeading` replacement; slide/reduced-motion hunk tetap unstaged.

---

### Task 3: Personalized Finish Reflection

**Files:**

- Create: `apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte`

**Interfaces:**

- Consumes: `buildFinishReflection(answers)` dan `ONBOARDING_COPY.finish` dari Task 1.
- Produces: personalized finish yang hanya memantulkan explicit answers; tidak mengubah answers atau membuat recommendation.

- [ ] **Step 1: Tulis failing browser tests untuk finish**

Create `FinishStep.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { OnboardingAnswers } from '../lib/onboarding-machine';
import FinishStep from './FinishStep.svelte';

const answers: OnboardingAnswers = {
	background: 'mahasiswa_s1',
	interests: ['ai_cs', 'pendidikan', 'psikologi', 'hukum'],
	source: 'teman',
	sourceOther: ''
};

describe('FinishStep', () => {
	it('reflects background and selected interest labels without raw ids', async () => {
		const { container } = render(FinishStep, { answers });
		await expect
			.element(
				page.getByRole('heading', {
					level: 1,
					name: 'Rasa penasaranmu sekarang punya arah.'
				})
			)
			.toBeInTheDocument();
		expect(container.textContent).toContain('Mahasiswa S1');
		expect(container.textContent).toContain(
			'Kecerdasan buatan & ilmu komputer, Pendidikan, Psikologi, dan 1 bidang lain'
		);
		expect(container.textContent).not.toContain('mahasiswa_s1');
		expect(container.textContent).not.toContain('ai_cs');
	});

	it('omits the background clause when no display label exists', () => {
		const { container } = render(FinishStep, {
			answers: { ...answers, background: 'unknown' }
		});
		expect(container.textContent).not.toContain('Titik berangkatmu:');
		expect(container.textContent).toContain('Rasa penasaranmu:');
	});
});
```

- [ ] **Step 2: Jalankan browser test untuk membuktikan RED**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/FinishStep.svelte.spec.ts --project client
```

Expected: FAIL karena finish masih hanya menampilkan jumlah minat dan copy “Mulai jelajah”.

- [ ] **Step 3: Implement personalized finish component**

Replace `FinishStep.svelte` dengan:

```svelte
<script lang="ts">
	import { Icon, SparklesIcon } from '$lib/icons';
	import { buildFinishReflection, ONBOARDING_COPY } from '../lib/onboarding-content';
	import type { OnboardingAnswers } from '../lib/onboarding-machine';

	let { answers }: { answers: OnboardingAnswers } = $props();

	const copy = ONBOARDING_COPY.finish;
	const reflection = $derived(buildFinishReflection(answers));
</script>

<section>
	<p class="mb-4 font-mono text-xs tracking-wider text-muted-foreground">{copy.eyebrow}</p>
	<span
		aria-hidden="true"
		class="mb-5 inline-flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"
	>
		<Icon icon={SparklesIcon} class="size-5" />
	</span>
	<h1
		data-onboarding-heading
		tabindex="-1"
		class="font-heading text-3xl leading-none font-normal tracking-tight text-foreground sm:text-4xl"
	>
		{copy.title}
	</h1>
	<p class="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
		{#if reflection.backgroundLabel}
			Titik berangkatmu: <strong class="font-medium text-foreground">
				{reflection.backgroundLabel}</strong
			>.
		{/if}
		Rasa penasaranmu:
		<strong class="font-medium text-foreground"> {reflection.interestSummary}</strong>.
	</p>
	<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
		{copy.description}
	</p>
</section>
```

- [ ] **Step 4: Jalankan finish browser test untuk membuktikan GREEN**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/FinishStep.svelte.spec.ts --project client
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit Task 3 saja**

```bash
git add apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte apps/svelte/src/lib/features/onboarding/components/FinishStep.svelte.spec.ts
git commit -m "feat(svelte): personalize onboarding finish"
```

---

### Task 4: Recoverable Status Error dan Shared `/app` Navigation

**Files:**

- Create: `apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte`
- Create: `apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte:1-49,90-162`

**Interfaces:**

- Consumes: `HOME_AFTER_ONBOARDING` dari Task 1 dan `readableApiErrorMessage` dari `$lib/errors`.
- Produces: `OnboardingStatusError` props `{ message: string; onretry: () => void }`.
- Preserves: successful submit → finish first; completed status must not skip finish after leaving welcome.

- [ ] **Step 1: Tulis failing browser test untuk recoverable status error**

Create `OnboardingStatusError.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OnboardingStatusError from './OnboardingStatusError.svelte';

it('announces the status error and retries on demand', async () => {
	const onretry = vi.fn();
	render(OnboardingStatusError, {
		message: 'Belum bisa memeriksa status onboarding.',
		onretry
	});

	await expect
		.element(page.getByRole('alert'))
		.toHaveTextContent('Belum bisa memeriksa status onboarding.');
	await page.getByRole('button', { name: 'Coba lagi' }).click();
	expect(onretry).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Jalankan browser test untuk membuktikan RED**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts --project client
```

Expected: FAIL karena component belum ada.

- [ ] **Step 3: Implement recoverable status error component**

Create `OnboardingStatusError.svelte`:

```svelte
<script lang="ts">
	import { Button } from '$lib/components/ui/button';

	let { message, onretry }: { message: string; onretry: () => void } = $props();
</script>

<section class="mx-auto max-w-md text-center" role="alert" aria-live="assertive">
	<h1 class="font-heading text-3xl font-normal tracking-tight text-foreground">
		Kami belum bisa menyiapkan perjalananmu
	</h1>
	<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
	<Button type="button" variant="outline" class="mt-6" onclick={onretry}>Coba lagi</Button>
</section>
```

- [ ] **Step 4: Ganti hardcoded completed redirect dengan shared destination**

Di mount-only effect `OnboardingPage.svelte`, replace redirect dengan:

```ts
$effect(() => {
	if (flow.step === 'welcome' && status?.completed) {
		void goto(resolve(HOME_AFTER_ONBOARDING), { replaceState: true });
	}
});
```

- [ ] **Step 5: Tambahkan normalized status error dan explicit render branches**

Import:

```ts
import { readableApiErrorMessage } from '$lib/errors';
import OnboardingStatusError from './components/OnboardingStatusError.svelte';
```

Derived state:

```ts
const statusErrorMessage = $derived(
	statusQuery.error
		? readableApiErrorMessage(
				statusQuery.error,
				'Belum bisa memeriksa status onboarding. Coba lagi, ya.'
			)
		: null
);
```

Apply exact branch diff berikut sehingga error tidak menjadi infinite loader dan completed state tidak flash welcome:

```diff
-{#if flow.step === 'welcome' && (!status || status.completed)}
-	<!-- Wait for status before showing welcome — avoids flashing the wizard to a user we're redirecting. -->
+{#if flow.step === 'welcome' && statusQuery.isError}
+	<OnboardingLayout>
+		<OnboardingStatusError
+			message={statusErrorMessage ?? 'Belum bisa memeriksa status onboarding.'}
+			onretry={() => void statusQuery.refetch()}
+		/>
+	</OnboardingLayout>
+{:else if flow.step === 'welcome' && (statusQuery.isPending || status?.completed)}
 	<OnboardingLayout>
-		<div class="flex justify-center text-muted-foreground">
+		<div
+			class="flex justify-center text-muted-foreground"
+			role="status"
+			aria-label="Memuat onboarding"
+		>
 			<FlickerSpinner class="size-5" />
 		</div>
 	</OnboardingLayout>
 {:else}
```

````

Tambahkan semantics pada mutation state dengan exact diff:

```diff
-		<form {onsubmit}>
+		<form {onsubmit} aria-busy={flow.isSubmitting}>
@@
 			{#if flow.errorMessage}
-				<p class="mt-4 text-sm text-destructive">{flow.errorMessage}</p>
+				<p class="mt-4 text-sm text-destructive" role="alert" aria-live="assertive">
+					{flow.errorMessage}
+				</p>
 			{/if}
````

````

- [ ] **Step 6: Jalankan status error test dan onboarding server tests**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts --project client
bun run test:unit --run src/lib/features/onboarding/lib/onboarding-machine.spec.ts src/lib/features/onboarding/lib/onboarding-content.spec.ts --project server
````

Expected: semua tests PASS.

- [ ] **Step 7: Jalankan typecheck**

Run dari repo root:

```bash
bun run typecheck:svelte
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 8: Commit Task 4 saja**

`OnboardingPage.svelte` sudah memiliki user-owned grid-overlap transition hunk. Stage hanya redirect/status/error semantics dari Task 4; grid hunk tetap unstaged sampai visual integration Task 5.

```bash
git add apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte apps/svelte/src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts
git add -p apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte
git diff --cached -- apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte
git commit -m "fix(svelte): harden onboarding status flow"
```

Expected staged `OnboardingPage.svelte` diff: shared destination, normalized status error, explicit status branches, `aria-busy`, dan mutation alert semantics; grid-overlap hunk tetap unstaged.

---

### Task 5: Full-Canvas Visual Integration, Motion, dan Accessibility

**Files:**

- Create: `apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts`
- Modify: `apps/svelte/src/lib/features/onboarding/components/OnboardingLayout.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/SelectableOption.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/components/InterestChip.svelte`
- Modify: `apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte`
- Review: `apps/svelte/src/styles/globals.css` (read-only token source)

**Interfaces:**

- Consumes: `[data-onboarding-heading]` from Welcome/StepHeading/Finish tasks.
- Produces: `OnboardingLayout` as full-viewport semantic-token canvas with no `max-w-xl` bottleneck.
- Produces: accessible textual progress and a single cohesive visual/motion treatment selected through rendered review.
- Preserves: existing user edits in all four dirty onboarding files listed under Global Constraints.

- [ ] **Step 1: Tulis failing browser test untuk textual progress**

Create `OnboardingStepIndicator.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import OnboardingStepIndicator from './OnboardingStepIndicator.svelte';

it('announces current onboarding progress without relying on color or motion', async () => {
	render(OnboardingStepIndicator, {
		index: 2,
		total: 3,
		label: 'Arah rasa penasaran'
	});
	await expect
		.element(page.getByRole('status'))
		.toHaveAttribute('aria-label', 'Langkah 2 dari 3: Arah rasa penasaran');
	await expect.element(page.getByText('02')).toBeInTheDocument();
	await expect.element(page.getByText('03')).toBeInTheDocument();
});
```

- [ ] **Step 2: Jalankan browser test untuk membuktikan RED**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts --project client
```

Expected: FAIL karena indicator belum memiliki `role="status"` dan accessible label.

- [ ] **Step 3: Implement full-canvas layout boundary tanpa mengunci bentuk visual**

Replace `OnboardingLayout.svelte` minimum contract dengan:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<main class="min-h-svh w-full overflow-x-clip bg-background text-foreground">
	{@render children()}
</main>
```

`OnboardingPage.svelte` menjadi owner composition di dalam canvas ini. Jangan memperkenalkan kembali unconditional `max-w-xl`; question content boleh memiliki readable measure lokal, tetapi canvas dan narrative treatment menggunakan ruang viewport yang tersedia.

- [ ] **Step 4: Tambahkan progress semantics sambil mempertahankan reduced-motion number transition**

Pada root indicator element, tambahkan exact semantics:

```diff
-<div class="mb-8 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-muted-foreground">
+<div
+	role="status"
+	aria-label={`Langkah ${index} dari ${total}: ${label}`}
+	class="mb-8 flex items-center gap-3 font-mono text-xs tracking-[0.2em] text-muted-foreground"
+>
```

````

- [ ] **Step 5: Implement focus handoff pada keyed step content**

Di `OnboardingPage.svelte`, tambahkan helper:

```ts
function focusStepHeading(node: HTMLElement) {
	const frame = requestAnimationFrame(() => {
		node.querySelector<HTMLElement>('[data-onboarding-heading]')?.focus({ preventScroll: true });
	});
	return () => cancelAnimationFrame(frame);
}
````

Attach hanya pada keyed step wrapper, bukan pada seluruh page:

```diff
 					<div
 						class="[grid-area:1/1]"
 						in:fly={reduce ? { duration: 0 } : { y: 8, duration: 220 }}
 						out:fly={reduce ? { opacity: 1, duration: 0 } : { y: -8, duration: 220 }}
+						{@attach focusStepHeading}
 					>
```

````

- [ ] **Step 6: Author visual composition melalui rendered review, bukan plan-prescribed shapes**

Edit Tailwind classes dan semantic markup hanya di file Task 5 untuk memenuhi seluruh checks berikut. Ini adalah keputusan visual implementation-time yang sengaja tidak diganti dengan mockup/metafora di plan:

- Canvas tidak terasa seperti centered generic form dan tidak dibatasi unconditional `max-w-xl`.
- Story, question, progress, dan actions mempunyai hierarchy jelas pada 1440×900, 1024×768, 390×844, dan 360×640.
- Satu treatment visual konsisten menghubungkan welcome → questions → finish.
- Finish adalah state terkuat tetapi tanpa confetti atau visual spectacle.
- `background`, `card`, `foreground`, `muted`, `border`, `primary`, dan named soft tokens berasal dari `globals.css`; tidak ada hex/rgb/oklch literal baru di component.
- Light/dark mode keduanya terasa intentional.
- Action row tetap stabil ketika content height berubah; preserve existing grid-overlap fix.
- Selected/unselected controls tetap memiliki `aria-pressed`, focus-visible ring, readable contrast, dan minimum comfortable tap target.
- Preserve constant `font-medium` pada `InterestChip` agar wrapping tidak berubah ketika selected.
- Preserve reduced-motion scale pada check icon dan slide pada source-other input.

Setelah setiap visual pass, buka rendered onboarding dan catat mismatch berdasarkan hierarchy, density, wrapping, overflow, dan action stability; edit sampai checks di atas terpenuhi.

- [ ] **Step 7: Jalankan progress browser test untuk membuktikan GREEN**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts --project client
````

Expected: PASS.

- [ ] **Step 8: Jalankan seluruh onboarding browser tests**

Run:

```bash
bun run test:unit --run src/lib/features/onboarding/components/onboarding-steps.svelte.spec.ts src/lib/features/onboarding/components/FinishStep.svelte.spec.ts src/lib/features/onboarding/components/OnboardingStatusError.svelte.spec.ts src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts --project client
```

Expected: semua onboarding browser tests PASS di headless Chromium.

- [ ] **Step 9: Commit Task 5 setelah rendered visual review lulus**

Stage hanya file Task 5. Commit ini sengaja mengintegrasikan empat onboarding improvements yang sudah ada sebelum plan—grid overlap, stable chip weight, reduced-motion check scale, dan source-other slide—bersama visual treatment final. Inspect staged diff dan sebutkan keempatnya dalam commit body agar scope transparan.

```bash
git add apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte.spec.ts apps/svelte/src/lib/features/onboarding/components/OnboardingLayout.svelte apps/svelte/src/lib/features/onboarding/components/OnboardingStepIndicator.svelte apps/svelte/src/lib/features/onboarding/components/SelectableOption.svelte apps/svelte/src/lib/features/onboarding/components/InterestChip.svelte apps/svelte/src/lib/features/onboarding/OnboardingPage.svelte
git add apps/svelte/src/lib/features/onboarding/components/SourceStep.svelte
git diff --cached --check
git diff --cached -- apps/svelte/src/lib/features/onboarding
git commit -m "feat(svelte): redesign onboarding journey" -m "Integrates stable step overlap, chip wrapping, reduced-motion selection, and source-other transition behavior."
```

---

### Task 6: Runtime Verification dan Repository Gates

**Files:**

- Verify only: seluruh file onboarding yang disentuh Task 1–5.
- Modify only if a gate exposes a defect: file paling dekat dengan defect; tambahkan regression test pada lane server/browser yang sesuai.

**Interfaces:**

- Consumes: completed implementation dari Task 1–5.
- Produces: evidence bahwa data flow, keyboard, responsive layouts, theme, reduced motion, error recovery, dan destination `/app` bekerja pada rendered app.

- [ ] **Step 1: Jalankan seluruh Svelte test suite**

Run dari repo root:

```bash
bun run test:svelte
```

Expected: semua server dan browser projects PASS; tidak ada close timeout.

- [ ] **Step 2: Jalankan Svelte lint, typecheck, dan build gates**

Run:

```bash
bun run lint:svelte
bun run typecheck:svelte
bun run build:svelte
```

Expected:

- Prettier + ESLint clean.
- `svelte-check found 0 errors and 0 warnings`.
- Adapter-node production build selesai tanpa error.

- [ ] **Step 3: Jalankan full repository verification commands dari AGENTS.md**

Run:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Expected: seluruh configured workspace gates PASS. Bila integration test memerlukan Postgres/Redis/MinIO, start local infra dengan `bun run infra:up`, jalankan ulang gate, lalu laporkan dependency infra secara eksplisit.

- [ ] **Step 4: Verifikasi rendered onboarding dengan authenticated local test user**

Start Svelte dev server dengan Bun:

```bash
bun run dev:svelte
```

Gunakan local/test environment saja; jangan mengubah production onboarding rows. Verifikasi:

1. User incomplete melihat loader singkat lalu welcome tanpa flash redirect.
2. Feynman quote English dan interpretation Indonesia terbaca utuh.
3. Keyboard-only: CTA → pilih background → pilih minimal tiga interests → pilih source → submit.
4. Primary action disabled sebelum setiap step valid.
5. Back mempertahankan answers.
6. “Lainnya” memunculkan input dengan slide; reduced motion menghilangkan motion tetapi bukan content.
7. Submit failure mempertahankan answers dan menampilkan normalized error dekat action.
8. Finish menampilkan background + maksimum tiga interest labels + remainder.
9. CTA finish menuju `/app`, dan browser Back tidak mengembalikan user ke wizard completed.
10. User completed yang membuka `/onboarding` langsung menuju `/app`.
11. Light/dark mode pada 1440×900, 1024×768, 390×844, dan 360×640 tidak overflow atau memotong CTA.
12. Focus indicator terlihat; step change mengarahkan focus ke heading; progress tetap dimengerti tanpa motion/warna.
13. Satu clean run dapat diselesaikan dalam sekitar satu menit tanpa melewati pertanyaan.

- [ ] **Step 5: Perbaiki setiap defect dengan regression test terdekat**

Untuk setiap failure, lakukan loop berikut sebelum melanjutkan:

1. Tambahkan failing test yang mereproduksi defect pada `onboarding-content.spec.ts`, `onboarding-machine.spec.ts`, atau browser component spec terdekat.
2. Jalankan test tunggal dan pastikan FAIL karena defect tersebut.
3. Implement minimal fix tanpa mengubah visual decisions di luar defect.
4. Jalankan test tunggal dan seluruh onboarding tests.

Expected: tidak ada defect terbuka atau skipped onboarding test.

- [ ] **Step 6: Commit hanya verification fixes bila ada**

Jika Step 5 menghasilkan perubahan:

```bash
git add apps/svelte/src/lib/features/onboarding
git diff --cached --check
git commit -m "fix(svelte): close onboarding verification gaps"
```

Jika tidak ada perubahan, jangan buat empty commit.

- [ ] **Step 7: Audit final scope**

Run:

```bash
git status --short
git log --stat --oneline --max-count=8 -- apps/svelte/src/lib/features/onboarding docs/superpowers
```

Expected:

- Commits Task 1–5/6 hanya menyentuh onboarding files yang tercantum.
- Perubahan user di luar onboarding tetap unstaged/uncommitted dan tidak hilang.
- Tidak ada dependency, API, database, atau `globals.css` change.
- Design requirements dapat dipetakan ke test atau rendered verification evidence.

## Completion Checklist

- [ ] `background`, minimal tiga `interests`, source, dan source-other contract tidak berubah.
- [ ] Welcome menampilkan quote Feynman English + interpretation Indonesia.
- [ ] Question steps memiliki narrative bridge yang pendek.
- [ ] Copy memakai “sekitar 320 juta karya ilmiah” tanpa universal full-text claim.
- [ ] Finish memantulkan human labels, maksimal tiga explicit interests, dan remainder.
- [ ] Completed redirect dan finish CTA menuju `/app`.
- [ ] Status-query error dapat diretry dan tidak menjadi redirect loop/infinite loader.
- [ ] Mutation error memakai normalized message dan mempertahankan answers.
- [ ] Full canvas tidak kembali menjadi generic `max-w-xl` form.
- [ ] Hanya semantic tokens `globals.css` yang digunakan.
- [ ] Light/dark/mobile/keyboard/reduced-motion rendered checks lulus.
- [ ] Satu clean run tetap dapat diselesaikan dalam sekitar satu menit.
- [ ] Existing dirty onboarding improvements tetap ada.
- [ ] Svelte-specific dan full-repo gates lulus.
