export type ProjectActivationState = {
	shellPainted: boolean;
	wide: boolean | null;
	documentRuntimeActive: boolean;
	desktopActivationPending: boolean;
};

export type ProjectActivationEvent =
	| { type: 'layout-measured'; wide: boolean }
	| { type: 'shell-painted' }
	| { type: 'desktop-delay-complete' }
	| { type: 'open-document-surface' };

export function initialProjectActivation(): ProjectActivationState {
	return {
		shellPainted: false,
		wide: null,
		documentRuntimeActive: false,
		desktopActivationPending: false
	};
}

export function reduceProjectActivation(
	state: ProjectActivationState,
	event: ProjectActivationEvent
): ProjectActivationState {
	switch (event.type) {
		case 'layout-measured': {
			const desktopActivationPending =
				event.wide && state.shellPainted && !state.documentRuntimeActive;
			if (state.wide === event.wide && state.desktopActivationPending === desktopActivationPending)
				return state;
			return { ...state, wide: event.wide, desktopActivationPending };
		}
		case 'shell-painted': {
			const desktopActivationPending = state.wide === true && !state.documentRuntimeActive;
			if (state.shellPainted && state.desktopActivationPending === desktopActivationPending)
				return state;
			return { ...state, shellPainted: true, desktopActivationPending };
		}
		case 'desktop-delay-complete':
			if (!state.desktopActivationPending) return state;
			return { ...state, documentRuntimeActive: true, desktopActivationPending: false };
		case 'open-document-surface':
			if (state.documentRuntimeActive && !state.desktopActivationPending) return state;
			return { ...state, documentRuntimeActive: true, desktopActivationPending: false };
	}
}
