import { getAuthState } from '$lib/auth/context.svelte';
import { useProfile } from '$lib/features/settings/api';
import {
	useArtifact,
	useArtifactRender,
	useDeleteArtifact,
	useMoveArtifact,
	useRenameArtifact,
	useRetryUrlExtraction,
	useUpdateDocument
} from '$lib/features/artifacts/api';
import { useWorkspacesList } from '../api';

/**
 * Composite workspace data hooks for the artifact reader. Returns objects with **getter** properties so
 * accessing `.workspaces`/`.artifact` re-reads the underlying reactive svelte-query state. Mutations are
 * exposed as plain async functions.
 *
 * Call these during component init (they call query/api-client context internally). The reactive
 * `artifactId` input flows as a getter into the leaf hooks.
 */

function flattenWorkspaces(
	pages:
		| Array<{
				items: Array<{
					id: string;
					name: string;
					emoji: string | null;
					updatedAt: number;
				}>;
		  }>
		| undefined
) {
	return (pages ?? []).flatMap((page) =>
		page.items.map((workspace) => ({
			_id: workspace.id,
			name: workspace.name,
			emoji: workspace.emoji ?? undefined,
			updatedAt: workspace.updatedAt
		}))
	);
}

export function useWorkspaceIndexData() {
	const auth = getAuthState();
	// Gate queries on Clerk being signed-in: a hard-reload of a deep authed route
	// fires these before clerk-js loads → 401 tokenless → transient empty. `isSignedIn` = isLoaded && userId.
	const ready = () => auth.isSignedIn;
	const profile = useProfile();
	const workspacesQuery = useWorkspacesList(undefined, ready);

	return {
		get isAuthenticated() {
			return auth.isLoaded && auth.isSignedIn;
		},
		get viewer() {
			return profile.data
				? {
						name: profile.data.name,
						email: profile.data.email,
						image: profile.data.image
					}
				: undefined;
		},
		get workspaces() {
			return flattenWorkspaces(workspacesQuery.data?.pages);
		}
	};
}

export function useArtifactDetailData(artifactId: () => string) {
	const auth = getAuthState();
	const ready = () => auth.isSignedIn;
	const index = useWorkspaceIndexData();
	const artifactQuery = useArtifact(artifactId, ready);
	const renderQuery = useArtifactRender(artifactId, ready);
	const updateDocumentMutation = useUpdateDocument(artifactId);
	const retryUrlMutation = useRetryUrlExtraction(artifactId);
	const renameArtifactMutation = useRenameArtifact();
	const moveArtifactMutation = useMoveArtifact();
	const deleteArtifactMutation = useDeleteArtifact();

	return {
		get isAuthenticated() {
			return index.isAuthenticated;
		},
		get viewer() {
			return index.viewer;
		},
		get workspaces() {
			return index.workspaces;
		},
		get artifact() {
			return artifactQuery.data ?? (artifactQuery.isLoading ? undefined : null);
		},
		get paperExtraction() {
			return undefined;
		},
		get renderPayload() {
			return renderQuery.data;
		},
		get isLoading() {
			return artifactQuery.isLoading || renderQuery.isLoading;
		},
		updateDocument: async (args: {
			title?: string;
			blocksJson?: string;
			markdown?: string;
			plainText: string;
		}) => {
			await updateDocumentMutation.mutateAsync(args);
		},
		retryUrlExtraction: async () => {
			await retryUrlMutation.mutateAsync();
		},
		retryGrobidExtraction: async () => ({
			ok: false as const,
			reason: 'not_available' as const
		}),
		renameArtifact: async (args: { artifactId: string; title: string }) => {
			await renameArtifactMutation.mutateAsync({ id: args.artifactId, title: args.title });
		},
		moveArtifact: async (args: { artifactId: string; targetWorkspaceId: string }) => {
			await moveArtifactMutation.mutateAsync({
				id: args.artifactId,
				targetWorkspaceId: args.targetWorkspaceId
			});
		},
		removeArtifact: async (args: { artifactId: string }) => {
			await deleteArtifactMutation.mutateAsync({ id: args.artifactId });
			return { ok: true as const };
		}
	};
}
