import { sql } from "drizzle-orm";
import { bigint, check, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export type IntegrationProvider = "mendeley" | "zotero";
export type IntegrationStatus = "connected" | "expired" | "error" | "revoked";

/** Profil provider yang aman ditampilkan di Settings (bukan credential). */
export type IntegrationProfile = {
  id?: string;
  name?: string;
  email?: string;
};

/**
 * integration_connections — koneksi akun ke aplikasi referensi (Mendeley/Zotero),
 * ACCOUNT-LEVEL (bukan per-workspace): satu token/key milik owner dipakai banyak
 * workspace. `credentials_encrypted` = AES-256-GCM at-rest (secret deployment);
 * TIDAK PERNAH di-serialize ke `apps/web`. Penarikan data tetap keputusan
 * per-workspace via tab Sitasi. Skema generik multi-provider (kolom `provider`).
 */
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    // OAuth access+refresh token (Mendeley) atau API key + user id (Zotero),
    // AES-GCM ciphertext. Bentuk plaintext-nya per-provider; hanya service yang tahu.
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    tokenExpiresAt: bigint("token_expires_at", { mode: "number" }),
    externalProfileJson: jsonb("external_profile_json").$type<IntegrationProfile>(),
    selectedFoldersJson: jsonb("selected_folders_json").$type<string[]>(),
    lastSyncAt: bigint("last_sync_at", { mode: "number" }),
    syncCursor: text("sync_cursor"),
    status: text("status").notNull().default("connected"),
    lastError: text("last_error"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check(
      "integration_connections_provider_check",
      sql`${t.provider} in ('mendeley', 'zotero')`,
    ),
    check(
      "integration_connections_status_check",
      sql`${t.status} in ('connected', 'expired', 'error', 'revoked')`,
    ),
    // Satu koneksi aktif per (owner, provider) — reconnect = upsert baris yang sama.
    uniqueIndex("integration_connections_by_owner_provider").on(t.ownerUserId, t.provider),
  ],
);

export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type NewIntegrationConnection = typeof integrationConnections.$inferInsert;
