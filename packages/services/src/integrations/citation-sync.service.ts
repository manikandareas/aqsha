import type { DbOrTx, IntegrationProvider } from "@aqsha/db";
import { throwAppError } from "@aqsha/db";
import {
  type ImportPreviewResult,
  stageImportBatch,
} from "../citations/citation-import.service";
import { IntegrationService } from "./integration.service";

/**
 * Penarikan data provider → preview batch account-level (reuse pipeline import
 * file). Commit memakai `CitationImportService.commit` yang sama (batch
 * `sourceKind = provider_sync`). Satu jalur commit untuk file dan provider;
 * idempotent via externalId.
 */
export const CitationSyncService = {
  async previewFolder(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      provider: IntegrationProvider;
      folderId: string | null;
    },
  ): Promise<ImportPreviewResult> {
    const { connection, documents } = await IntegrationService.pullDocuments(
      db,
      input.ownerUserId,
      input.provider,
      input.folderId,
    );
    if (documents.length === 0) {
      throwAppError({
        message: "Tidak ada referensi pada folder yang dipilih.",
        code: "integration_sync_empty",
        severity: "warning",
      });
    }
    const preview = await stageImportBatch(db, {
      ownerUserId: input.ownerUserId,
      entries: documents.map((d) => ({ csl: d.csl, externalId: d.externalId })),
      source: "provider_sync",
      sourceKind: "provider_sync",
      format: null,
      provider: input.provider,
    });
    await IntegrationService.touchSync(db, connection.id, { folderId: input.folderId });
    return preview;
  },
};
