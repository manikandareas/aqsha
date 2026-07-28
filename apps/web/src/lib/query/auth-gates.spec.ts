import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const authenticatedApis = [
	'../features/artifacts/api.ts',
	'../features/citations/api.ts',
	'../features/discovery/api.ts',
	'../features/document/api.ts',
	'../features/explore/api.ts',
	'../features/settings/api.ts',
	'../features/threads/api.ts',
	'../features/threads/use-recent-thread-summaries.svelte.ts',
	'../features/workspaces/api.ts'
];

describe('authenticated query gates', () => {
	it.each(authenticatedApis)('%s tidak memberi default true pada enabled', (path) => {
		const source = readFileSync(new URL(path, import.meta.url), 'utf8');

		expect(source).not.toMatch(
			/enabled:\s*\(\) => boolean\s*=\s*(?:always|alwaysTrue|\(\) => true)/
		);
	});

	it.each([
		['../features/artifacts/api.ts', 'useContextPickerArtifacts'],
		['../features/citations/api.ts', 'useCitationDetail'],
		['../features/citations/api.ts', 'useCitationSettings'],
		['../features/explore/api.ts', 'useExploreSuggest'],
		['../features/settings/api.ts', 'useBillingCurrent'],
		['../features/threads/api.ts', 'useThreadArtifacts']
	])('%s mewajibkan auth gate pada %s', (path, name) => {
		const source = readFileSync(new URL(path, import.meta.url), 'utf8');
		const signature = source.slice(source.indexOf(`export function ${name}`));

		expect(signature.slice(0, signature.indexOf(') {') + 1)).toContain('enabled: () => boolean');
	});
});
