import { page } from 'vitest/browser';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { WorkspaceStage } from '../types';
import { WORKSPACE_STAGE_LABELS } from '../labels';
import StageStepper from './StageStepper.svelte';

function pressKey(el: Element, key: string) {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

function radio(stage: WorkspaceStage) {
	return page.getByRole('radio', { name: WORKSPACE_STAGE_LABELS[stage] });
}

it('exposes a roving tabindex so only the active stage is Tab-reachable', async () => {
	render(StageStepper, { stage: 'research', onStageChange: () => {} });

	const active = radio('research');
	await expect.element(active).toHaveAttribute('tabindex', '0');
	await expect.element(active).toHaveAttribute('aria-checked', 'true');
	await expect.element(radio('exploration')).toHaveAttribute('tabindex', '-1');
});

it('moves selection with arrow keys, wrapping at the ends', async () => {
	let stage: WorkspaceStage = 'exploration';
	const onStageChange = vi.fn((next: WorkspaceStage) => {
		stage = next;
	});
	const view = render(StageStepper, { stage, onStageChange });

	const group = page.getByRole('radiogroup', { name: 'Tahap proyek' });
	await expect.element(group).toBeInTheDocument();
	const groupEl = group.element();

	pressKey(groupEl, 'ArrowRight');
	expect(onStageChange).toHaveBeenLastCalledWith('proposal');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('proposal')).toHaveAttribute('aria-checked', 'true');
	await expect.element(radio('proposal')).toHaveAttribute('tabindex', '0');

	// From proposal, left goes back to exploration — not a wrap.
	pressKey(groupEl, 'ArrowLeft');
	expect(onStageChange).toHaveBeenLastCalledWith('exploration');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('exploration')).toHaveAttribute('aria-checked', 'true');

	// First → last wrap.
	pressKey(groupEl, 'ArrowLeft');
	expect(onStageChange).toHaveBeenLastCalledWith('done');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('done')).toHaveAttribute('aria-checked', 'true');

	// Last → first wrap.
	pressKey(groupEl, 'ArrowRight');
	expect(onStageChange).toHaveBeenLastCalledWith('exploration');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('exploration')).toHaveAttribute('aria-checked', 'true');

	pressKey(groupEl, 'End');
	expect(onStageChange).toHaveBeenLastCalledWith('done');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('done')).toHaveAttribute('aria-checked', 'true');

	pressKey(groupEl, 'Home');
	expect(onStageChange).toHaveBeenLastCalledWith('exploration');
	await view.rerender({ stage, onStageChange });
	await expect.element(radio('exploration')).toHaveAttribute('aria-checked', 'true');

	// Home on the already-active first stage → no redundant PATCH.
	const callsBeforeHomeNoop = onStageChange.mock.calls.length;
	pressKey(groupEl, 'Home');
	expect(onStageChange).toHaveBeenCalledTimes(callsBeforeHomeNoop);
});
