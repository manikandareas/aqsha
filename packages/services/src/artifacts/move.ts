import {
  ArtifactContentRepo,
  ArtifactEmbeddingRepo,
  ArtifactPaperMetadataRepo,
  ArtifactUrlRepo,
  type DbOrTx,
} from "@aqsha/db";

/**
 * Cascade `workspace_id` ke 4 side-table untuk artifact yang pindah workspace
 * (single artifact move ATAU folder fan-out). Parent row di-patch oleh CALLER;
 * helper ini hanya menjaga side-table konsisten. Jalan SEKUENSIAL dalam satu tx
 * (postgres.js tx = satu koneksi, hindari query paralel).
 */
export async function syncArtifactWorkspaceMove(
  db: DbOrTx,
  input: { artifactIds: string[]; targetWorkspaceId: string; now: number },
): Promise<void> {
  if (input.artifactIds.length === 0) return;
  await ArtifactContentRepo.setWorkspaceByArtifactIds(
    db,
    input.artifactIds,
    input.targetWorkspaceId,
    input.now,
  );
  await ArtifactUrlRepo.setWorkspaceByArtifactIds(
    db,
    input.artifactIds,
    input.targetWorkspaceId,
    input.now,
  );
  await ArtifactPaperMetadataRepo.setWorkspaceByArtifactIds(
    db,
    input.artifactIds,
    input.targetWorkspaceId,
    input.now,
  );
  await ArtifactEmbeddingRepo.setWorkspaceByArtifactIds(
    db,
    input.artifactIds,
    input.targetWorkspaceId,
  );
}
