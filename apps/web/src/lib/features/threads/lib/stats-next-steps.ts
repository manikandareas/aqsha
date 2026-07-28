/**
 * Analysis next-step ritual map — the test-order guidance à la `analisis-statistik/SKILL.md` (profile →
 * descriptive → validity → reliability → classic assumptions → regression/correlation). Tapping a chip
 * prefills the composer with a natural-language prompt (OQ3 default), WITHOUT auto-send: the agent stays
 * free to deviate when the user types their own. Deterministic & instant — no model dependency.
 *
 * Only tests with a clear follow-up are filled. `custom` (run_python_analysis) & Tier 3 tests
 * (SEM/factor/mediation/moderation/advanced-difference) are DELIBERATELY empty — don't presume the
 * research direction.
 */
export type StatsNextStep = {
	/** Concise chip label (verb). */
	label: string;
	/** Natural-language prompt that fills the composer (readable before send). */
	prompt: string;
};

/** Uniform follow-up after each classic-assumption test: regression (the point of the assumption). */
const LANJUT_REGRESI: StatsNextStep = {
	label: 'Lanjut regresi',
	prompt: 'Asumsi klasik sudah terpenuhi. Lanjutkan dengan analisis regresi.'
};

/** Closes the pipeline: compose the Bab 4 narrative from all results (not a file export — panel button). */
const NARASI_BAB4: StatsNextStep = {
	label: 'Susun narasi Bab 4',
	prompt: 'Tolong susunkan narasi Bab 4 dari seluruh hasil analisis di percakapan ini.'
};

const STATS_NEXT_STEPS: Record<string, StatsNextStep[]> = {
	descriptive: [
		{ label: 'Uji validitas', prompt: 'Lanjutkan dengan uji validitas untuk setiap variabel.' }
	],
	uji_validitas: [
		{
			label: 'Uji reliabilitas',
			prompt: "Lanjutkan dengan uji reliabilitas (Cronbach's Alpha) untuk setiap variabel."
		}
	],
	uji_reliabilitas: [
		{
			label: 'Uji asumsi klasik',
			prompt:
				'Lanjutkan dengan uji asumsi klasik: normalitas, multikolinearitas, dan heteroskedastisitas.'
		},
		{
			label: 'Statistik deskriptif',
			prompt: 'Tampilkan statistik deskriptif untuk variabel penelitian.'
		}
	],
	uji_normalitas: [LANJUT_REGRESI],
	uji_multikolinearitas: [LANJUT_REGRESI],
	uji_heteroskedastisitas: [LANJUT_REGRESI],
	uji_autokorelasi: [LANJUT_REGRESI],
	uji_linearitas: [LANJUT_REGRESI],
	regresi_linear: [
		{ label: 'Uji korelasi', prompt: 'Lanjutkan dengan uji korelasi antar variabel.' },
		NARASI_BAB4
	],
	korelasi: [NARASI_BAB4]
};

/** Suggested follow-up steps for one analysis id — `[]` when none (don't invent). */
export function statsNextStepsFor(analysis: string): StatsNextStep[] {
	return Object.hasOwn(STATS_NEXT_STEPS, analysis) ? STATS_NEXT_STEPS[analysis] : [];
}
