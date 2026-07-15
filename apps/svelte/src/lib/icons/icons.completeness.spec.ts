import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as core from '@hugeicons/core-free-icons';
import * as aqshaIcons from './index';

/**
 * Icon-map completeness contract. `$lib/icons` must stay glyph-identical to
 * `packages/ui/src/icons.tsx`: every Aqsha-facing name resolves to the identical
 * `@hugeicons/core-free-icons` glyph.
 *
 * The expected map is parsed from the shared source (not hand-copied) so this test tracks
 * drift automatically — adding/renaming an icon without updating the adapter fails loudly.
 */
const reactSourcePath = fileURLToPath(
	new URL('../../../../../packages/ui/src/icons.tsx', import.meta.url)
);
const source = readFileSync(reactSourcePath, 'utf8');

/** Map each local import identifier → its real `@hugeicons/core-free-icons` glyph name. */
function parseCoreImports(src: string): Map<string, string> {
	const block = src.match(/import\s*\{([\s\S]*?)\}\s*from\s*["']@hugeicons\/core-free-icons["']/);
	if (!block) throw new Error('could not locate the core-free-icons import block');
	const localToGlyph = new Map<string, string>();
	for (const raw of block[1].split(',')) {
		const entry = raw.trim();
		if (!entry) continue;
		const aliased = entry.match(/^(\w+)\s+as\s+(\w+)$/);
		if (aliased) localToGlyph.set(aliased[2], aliased[1]);
		else localToGlyph.set(entry, entry);
	}
	return localToGlyph;
}

/** Map each exported Aqsha name → the core glyph name it renders. */
function parseExpectedMap(src: string): Map<string, string> {
	const localToGlyph = parseCoreImports(src);
	const expected = new Map<string, string>();
	const re = /export const (\w+)\s*=\s*createIcon\((\w+)\)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src))) {
		const [, aqshaName, local] = m;
		const glyph = localToGlyph.get(local);
		if (!glyph) throw new Error(`icon ${aqshaName} references unknown import ${local}`);
		expected.set(aqshaName, glyph);
	}
	return expected;
}

const expected = parseExpectedMap(source);

describe('icon adapter matches @aqsha/ui/icons', () => {
	it('parses a non-trivial number of icons from the shared source', () => {
		// Guards against a parser regression silently reducing coverage to zero.
		expect(expected.size).toBeGreaterThan(120);
	});

	it('exports every Aqsha icon name backed by the identical Hugeicons glyph', () => {
		const problems: string[] = [];
		for (const [name, glyphName] of expected) {
			const svelteGlyph = (aqshaIcons as Record<string, unknown>)[name];
			const coreGlyph = (core as Record<string, unknown>)[glyphName];
			if (svelteGlyph === undefined) {
				problems.push(`missing export: ${name}`);
			} else if (svelteGlyph !== coreGlyph) {
				problems.push(`wrong glyph: ${name} should be ${glyphName}`);
			}
		}
		expect(problems).toEqual([]);
	});

	it('exposes the Icon render component and artifact-type helper', () => {
		expect(aqshaIcons.Icon).toBeDefined();
		expect(aqshaIcons.getArtifactTypeIcon('pdf')).toBe(core.FileScriptIcon);
		expect(aqshaIcons.getArtifactTypeIcon('mermaid')).toBe(core.GitBranchIcon);
		expect(aqshaIcons.getArtifactTypeIcon(undefined)).toBe(core.FileScriptIcon);
	});
});
