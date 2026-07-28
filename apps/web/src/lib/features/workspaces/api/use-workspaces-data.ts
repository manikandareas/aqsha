import { getAuthState } from '$lib/auth/context.svelte';
import {
	useArtifact,
	useArtifactRender,
	useDeleteArtifact,
	useMoveArtifact,
	useRenameArtifact,
	useRetryUrlExtraction,
	useUpdateDocument
} from '$lib/features/artifacts/api';
import { useWorkspace } from '../api';
import { isWorkspaceDetailQueryEnabled } from '../lib/query-gates';

/**
 * Composite workspace data hooks for the artifact reader. Returns getter properties so reactive query
 * state is read on access. Mutations are exposed as plain async functions.
 *
 * Call these during component init (they call query/api-client context internally). The reactive
 * `artifactId` input flows as a getter into the leaf hooks.
 */

export function useArtifactDetailData(
	artifactId: () => string,
	workspaceId: () => string = () => ''
) {
	const auth = getAuthState();
	const ready = () => auth.isSignedIn;
	const workspaceQuery = useWorkspace(workspaceId, () =>
		isWorkspaceDetailQueryEnabled(ready(), workspaceId())
	);
	const artifactQuery = useArtifact(artifactId, ready);
	const renderQuery = useArtifactRender(artifactId, ready);
	const updateDocumentMutation = useUpdateDocument(artifactId);
	const retryUrlMutation = useRetryUrlExtraction(artifactId);
	const renameArtifactMutation = useRenameArtifact();
	const moveArtifactMutation = useMoveArtifact();
	const deleteArtifactMutation = useDeleteArtifact();

	return {
		get workspaceName() {
			return workspaceQuery.data?.name;
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
