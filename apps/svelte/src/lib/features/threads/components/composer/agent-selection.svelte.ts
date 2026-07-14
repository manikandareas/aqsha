import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { AgentKind } from '@aqsha/chat-core';
import { useBillingCurrent } from '$lib/features/settings/api';

/** Composer agent tier — a contract alias of `AgentKind` (`@aqsha/chat-core`). */
export type ComposerAgentKind = AgentKind;

/**
 * Composer agent selection (Svelte port of `useComposerAgentSelection`). Default follows the stored
 * thread tier (`chat_threads.agent_kind`); `override` is the explicit per-session choice (null = follow
 * default). Pro is locked unless the plan is paid — clicking Pro while locked routes to billing and
 * `agentKind` is forced "lite" for free plans. Must be called during component init (uses the billing
 * query context). Returns getters so reads stay reactive in the template.
 */
export function useComposerAgentSelection(threadDefault: () => ComposerAgentKind = () => 'lite') {
	const billing = useBillingCurrent();
	let override = $state<ComposerAgentKind | null>(null);

	const canUsePro = $derived(billing.data ? billing.data.planKey !== 'free' : false);
	const selected = $derived(override ?? threadDefault());

	return {
		get agentKind(): ComposerAgentKind {
			return canUsePro ? selected : 'lite';
		},
		get canUsePro(): boolean {
			return canUsePro;
		},
		setAgentKind: (kind: ComposerAgentKind) => {
			override = kind;
		},
		handleUpgrade: () => {
			void goto(resolve('/app/settings/usage-billing'));
		}
	};
}
