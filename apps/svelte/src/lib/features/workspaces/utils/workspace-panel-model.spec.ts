import { describe, expect, test } from 'vitest';
import {
	CLOSED_WORKSPACE_PANEL,
	parseWorkspacePanelMode,
	serializeWorkspacePanelMode,
	workspacePanelTabOf
} from './workspace-panel-model';

describe('workspace-panel-model', () => {
	test('round-trip chat / cite / cite:<id>', () => {
		for (const mode of [
			{ kind: 'chat' } as const,
			{ kind: 'citations' } as const,
			{ kind: 'citations', citationId: 'abc:def' } as const
		]) {
			const raw = serializeWorkspacePanelMode(mode);
			expect(raw).not.toBeNull();
			expect(parseWorkspacePanelMode(raw ?? '')).toEqual(mode);
		}
	});

	test('closed → param absen; raw invalid → closed', () => {
		expect(serializeWorkspacePanelMode(CLOSED_WORKSPACE_PANEL)).toBeNull();
		expect(parseWorkspacePanelMode('apalah')).toEqual(CLOSED_WORKSPACE_PANEL);
		expect(parseWorkspacePanelMode('')).toEqual(CLOSED_WORKSPACE_PANEL);
	});

	test('cite: tanpa id (link terpotong) → list Sitasi', () => {
		expect(parseWorkspacePanelMode('cite:')).toEqual({ kind: 'citations' });
	});

	test('tab mapping', () => {
		expect(workspacePanelTabOf({ kind: 'chat' })).toBe('chat');
		expect(workspacePanelTabOf({ kind: 'citations', citationId: 'x' })).toBe('citations');
		expect(workspacePanelTabOf(CLOSED_WORKSPACE_PANEL)).toBeNull();
	});
});
