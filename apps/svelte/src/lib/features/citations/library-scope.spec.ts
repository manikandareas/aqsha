import { describe, expect, it } from 'vitest';
import { libraryBasePath, libraryTitle, libraryWorkspaceId } from './library-scope';

const project = { kind: 'project', workspaceId: 'ws_1', workspaceName: 'Skripsi AI' } as const;

describe('library scope', () => {
	it('keeps global and project navigation distinct', () => {
		expect(libraryBasePath({ kind: 'global' })).toBe('/app/library');
		expect(libraryBasePath(project)).toBe('/app/projects/ws_1/references');
		expect(libraryWorkspaceId(project)).toBe('ws_1');
		expect(libraryTitle(project)).toBe('Perpustakaan / Skripsi AI');
	});
});
