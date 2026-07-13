import { and, eq } from "drizzle-orm";
import {
  type IntegrationConnection,
  integrationConnections,
  type IntegrationProvider,
  type NewIntegrationConnection,
} from "../schema/integrationConnections";
import type { DbOrTx } from "../types";

/** Repo integration_connections — query Drizzle saja; lifecycle + crypto di @aqsha/services. */
export const IntegrationConnectionRepo = {
  async listByOwner(db: DbOrTx, ownerUserId: string): Promise<IntegrationConnection[]> {
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.ownerUserId, ownerUserId));
  },

  async findByProvider(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationConnection | null> {
    const rows = await db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.ownerUserId, ownerUserId),
          eq(integrationConnections.provider, provider),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  /** Upsert per (owner, provider) — connect ATAU reconnect menulis baris yang sama. */
  async upsert(
    db: DbOrTx,
    row: NewIntegrationConnection,
    patch: Partial<
      Pick<
        NewIntegrationConnection,
        | "credentialsEncrypted"
        | "tokenExpiresAt"
        | "externalProfileJson"
        | "selectedFoldersJson"
        | "status"
        | "lastError"
        | "updatedAt"
      >
    >,
  ): Promise<void> {
    await db
      .insert(integrationConnections)
      .values(row)
      .onConflictDoUpdate({
        target: [integrationConnections.ownerUserId, integrationConnections.provider],
        set: patch,
      });
  },

  async updateById(
    db: DbOrTx,
    id: string,
    patch: Partial<NewIntegrationConnection>,
  ): Promise<void> {
    await db.update(integrationConnections).set(patch).where(eq(integrationConnections.id, id));
  },

  async deleteByProvider(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
  ): Promise<void> {
    await db
      .delete(integrationConnections)
      .where(
        and(
          eq(integrationConnections.ownerUserId, ownerUserId),
          eq(integrationConnections.provider, provider),
        ),
      );
  },
};
