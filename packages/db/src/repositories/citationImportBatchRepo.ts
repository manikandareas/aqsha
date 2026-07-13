import { and, eq } from "drizzle-orm";
import {
  type CitationImportBatch,
  citationImportBatches,
  type NewCitationImportBatch,
} from "../schema/citationImportBatches";
import type { DbOrTx } from "../types";

/** Repo citation_import_batches — staging preview→commit + audit ringkas. */
export const CitationImportBatchRepo = {
  async findById(
    db: DbOrTx,
    ownerUserId: string,
    id: string,
  ): Promise<CitationImportBatch | null> {
    const rows = await db
      .select()
      .from(citationImportBatches)
      .where(
        and(eq(citationImportBatches.ownerUserId, ownerUserId), eq(citationImportBatches.id, id)),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewCitationImportBatch): Promise<void> {
    await db.insert(citationImportBatches).values(row);
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewCitationImportBatch>,
  ): Promise<void> {
    await db.update(citationImportBatches).set(patch).where(eq(citationImportBatches.id, id));
  },
};
