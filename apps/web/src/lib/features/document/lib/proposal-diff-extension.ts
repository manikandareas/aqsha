import { type Extension, StateEffect, StateField, type Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { ProposalHunk } from '../api';

export type ProposalDiffState = {
	hunks: ProposalHunk[];
	labelFor: (hunk: ProposalHunk) => string;
	busyIndex: number | null;
	errors: Record<number, string[]>;
	onDecide: (index: number, decision: 'accept' | 'reject') => void;
};

export type DiffDecorationPlan =
	| { kind: 'bar'; line: number; hunkIndex: number }
	| { kind: 'removed'; line: number; hunkIndex: number }
	| { kind: 'added'; line: number; hunkIndex: number; lines: string[] };

function clamp(line: number, total: number): number {
	return Math.min(Math.max(line, 1), Math.max(total, 1));
}

/**
 * Terjemahkan hunk unified diff menjadi rencana dekorasi terhadap buffer. Buffer berisi sumber
 * tersimpan, jadi baris '-' dan konteks menempati nomor baris nyata sementara baris '+' hanya
 * punya jangkar: baris terakhir yang sudah dikonsumsi. Murni supaya pemetaan barisnya dapat diuji.
 */
export function planDiffDecorations(
	totalLines: number,
	hunks: readonly ProposalHunk[]
): DiffDecorationPlan[] {
	const plan: DiffDecorationPlan[] = [];
	for (const hunk of hunks) {
		plan.push({ kind: 'bar', line: clamp(hunk.oldStart, totalLines), hunkIndex: hunk.index });
		let oldLine = hunk.oldStart;
		let anchor = hunk.oldStart - 1;
		let pending: string[] = [];
		const flush = () => {
			if (pending.length === 0) return;
			plan.push({
				kind: 'added',
				line: clamp(anchor, totalLines),
				hunkIndex: hunk.index,
				lines: pending
			});
			pending = [];
		};
		for (const raw of hunk.lines) {
			if (raw.startsWith('\\')) continue;
			if (raw.startsWith('+')) {
				pending.push(raw.slice(1));
				continue;
			}
			flush();
			if (raw.startsWith('-')) {
				plan.push({ kind: 'removed', line: clamp(oldLine, totalLines), hunkIndex: hunk.index });
			}
			anchor = oldLine;
			oldLine += 1;
		}
		flush();
	}
	return plan;
}

export const setProposalDiff = StateEffect.define<ProposalDiffState | null>();

class AddedLinesWidget extends WidgetType {
	constructor(readonly lines: string[]) {
		super();
	}
	eq(other: AddedLinesWidget): boolean {
		return other.lines.join('\n') === this.lines.join('\n');
	}
	toDOM(): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 'cm-proposal-added';
		for (const line of this.lines) {
			const row = document.createElement('div');
			row.className = 'cm-proposal-added-line';
			// Baris kosong tetap perlu tinggi agar blok tambahan terbaca utuh.
			row.textContent = line === '' ? ' ' : line;
			wrap.appendChild(row);
		}
		return wrap;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

class HunkBarWidget extends WidgetType {
	constructor(
		readonly hunk: ProposalHunk,
		readonly state: ProposalDiffState
	) {
		super();
	}
	eq(other: HunkBarWidget): boolean {
		return (
			other.hunk.index === this.hunk.index &&
			other.state.busyIndex === this.state.busyIndex &&
			(other.state.errors[this.hunk.index]?.join('|') ?? '') ===
				(this.state.errors[this.hunk.index]?.join('|') ?? '')
		);
	}
	toDOM(): HTMLElement {
		const bar = document.createElement('div');
		bar.className = 'cm-proposal-bar';

		const label = document.createElement('span');
		label.className = 'cm-proposal-bar-label';
		label.textContent = this.state.labelFor(this.hunk);
		bar.appendChild(label);

		const busy = this.state.busyIndex !== null;
		for (const decision of ['accept', 'reject'] as const) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `cm-proposal-bar-action cm-proposal-bar-${decision}`;
			button.textContent = decision === 'accept' ? 'Terima' : 'Tolak';
			button.disabled = busy;
			button.addEventListener('click', (event) => {
				event.preventDefault();
				if (busy) return;
				this.state.onDecide(this.hunk.index, decision);
			});
			bar.appendChild(button);
		}

		const errors = this.state.errors[this.hunk.index];
		if (errors && errors.length > 0) {
			const note = document.createElement('p');
			note.className = 'cm-proposal-bar-error';
			note.textContent = errors.join(' · ');
			bar.appendChild(note);
		}
		return bar;
	}
	ignoreEvent(): boolean {
		return false;
	}
}

function buildDecorations(doc: Text, state: ProposalDiffState | null): DecorationSet {
	if (!state || state.hunks.length === 0) return Decoration.none;
	const byIndex = new Map(state.hunks.map((h) => [h.index, h] as const));
	const ranges = planDiffDecorations(doc.lines, state.hunks).flatMap((item) => {
		const line = doc.line(item.line);
		if (item.kind === 'bar') {
			const hunk = byIndex.get(item.hunkIndex);
			if (!hunk) return [];
			return [
				Decoration.widget({
					widget: new HunkBarWidget(hunk, state),
					block: true,
					side: -1
				}).range(line.from)
			];
		}
		if (item.kind === 'removed') {
			return [Decoration.line({ class: 'cm-proposal-removed' }).range(line.from)];
		}
		return [
			Decoration.widget({ widget: new AddedLinesWidget(item.lines), block: true, side: 1 }).range(
				line.to
			)
		];
	});
	return Decoration.set(ranges, true);
}

/**
 * Dekorasi hidup di StateField, bukan ViewPlugin: CodeMirror menolak block decoration yang datang
 * dari plugin karena tinggi baris harus diketahui sebelum viewport dihitung — lewat plugin, SELURUH
 * set dibuang sehingga diff tak pernah tampil.
 */
const proposalDiffField = StateField.define<{
	diff: ProposalDiffState | null;
	decorations: DecorationSet;
}>({
	create: () => ({ diff: null, decorations: Decoration.none }),
	update(value, tr) {
		let diff = value.diff;
		let changed = false;
		for (const effect of tr.effects) {
			if (effect.is(setProposalDiff)) {
				diff = effect.value;
				changed = true;
			}
		}
		if (!changed && !tr.docChanged) return value;
		return { diff, decorations: buildDecorations(tr.state.doc, diff) };
	},
	provide: (field) => EditorView.decorations.from(field, (value) => value.decorations)
});

const diffTheme = EditorView.baseTheme({
	'.cm-proposal-removed': {
		backgroundColor: 'color-mix(in oklch, var(--coral) 18%, transparent)'
	},
	'.cm-proposal-added': {
		backgroundColor: 'color-mix(in oklch, var(--mint) 18%, transparent)',
		borderLeft: '2px solid var(--mint)',
		padding: '0 0 0 6px'
	},
	// `pre-wrap` sendiri hanya memutus di spasi; token panjang tanpa spasi tetap melebar dan memaksa
	// scroll horizontal. Samakan dengan perilaku `.cm-lineWrapping` bawaan CodeMirror.
	'.cm-proposal-added-line': {
		whiteSpace: 'pre-wrap',
		overflowWrap: 'anywhere',
		wordBreak: 'break-word'
	},
	'.cm-proposal-bar': {
		display: 'flex',
		alignItems: 'center',
		gap: '6px',
		flexWrap: 'wrap',
		margin: '6px 0 2px',
		padding: '4px 8px',
		border: '2px solid var(--border)',
		borderRadius: '8px',
		background: 'var(--card)',
		fontSize: '11px',
		maxWidth: '100%'
	},
	// `min-width: 0` wajib: default `auto` menahan flex item menyusut di bawah lebar isinya, sehingga
	// judul bab yang panjang melebarkan bar melewati editor.
	'.cm-proposal-bar-label': {
		flex: '1 1 auto',
		minWidth: 0,
		overflowWrap: 'anywhere',
		color: 'var(--muted-foreground)'
	},
	'.cm-proposal-bar-action': {
		border: '2px solid var(--border)',
		borderRadius: '8px',
		padding: '1px 8px',
		cursor: 'pointer',
		background: 'var(--background)'
	},
	'.cm-proposal-bar-accept': { background: 'var(--mint)', color: 'var(--mint-foreground)' },
	'.cm-proposal-bar-error': {
		flexBasis: '100%',
		minWidth: 0,
		margin: '2px 0 0',
		overflowWrap: 'anywhere',
		color: 'var(--destructive)'
	}
});

export function proposalDiffExtension(): Extension {
	return [proposalDiffField, diffTheme];
}
