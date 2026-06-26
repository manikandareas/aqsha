import { inArray } from "drizzle-orm";
import {
  artifactExtractions,
  type NewArtifactExtraction,
} from "../schema/artifactExtractions";
import type { DbOrTx } from "../types";

/** Repo artifact_extractions (1:N job-log) — query Drizzle saja. */
export const ArtifactExtractionRepo = {
  async insert(db: DbOrTx, row: NewArtifactExtraction): Promise<void> {
    await db.insert(artifactExtractions).values(row);
  },

  async deleteByArtifactIds(db: DbOrTx, artifactIds: string[]): Promise<void> {
    if (artifactIds.length === 0) return;
    await db.delete(artifactExtractions).where(inArray(artifactExtractions.artifactId, artifactIds));
  },
};
