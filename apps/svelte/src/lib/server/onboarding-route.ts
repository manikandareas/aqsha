export type OnboardingStatus = { completed: boolean };

export type OnboardingRouteState<T extends OnboardingStatus> = {
	status: T | null;
	redirectTo: '/app' | '/onboarding' | null;
};

export async function onboardingRouteState<T extends OnboardingStatus>(
	surface: 'app' | 'onboarding',
	getStatus: () => Promise<T>
): Promise<OnboardingRouteState<T>> {
	try {
		const status = await getStatus();
		return {
			status,
			redirectTo:
				surface === 'app'
					? status.completed
						? null
						: '/onboarding'
					: status.completed
						? '/app'
						: null
		};
	} catch {
		return { status: null, redirectTo: null };
	}
}

export async function onboardingRedirect(
	surface: 'app' | 'onboarding',
	getStatus: () => Promise<OnboardingStatus>
): Promise<'/app' | '/onboarding' | null> {
	return (await onboardingRouteState(surface, getStatus)).redirectTo;
}
