import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * artifact_urls — 1:1 untuk artifact bertipe `url` (P3). Selalu workspace-scoped →
 * `workspace_id` NON-null. `readable_text` inline ATAU offloaded ke R2
 * (`readable_text_r2_key`). UNIQUE (owner, workspace, normalized_url) = dedupe nyata
 * di DB; aman karena `remove` meng-hard-delete child rows (artifact-cleanup) → slot
 * unique bebas untuk re-create (fix leak V1).
 */
export const artifactUrls = pgTable(
  "artifact_urls",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    originalUrl: text("original_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    status: text("status").notNull(),
    title: text("title"),
    description: text("description"),
    siteName: text("site_name"),
    readableText: text("readable_text"),
    contextText: text("context_text"),
    readableTextR2Key: text("readable_text_r2_key"),
    failureReason: text("failure_reason"),
    extractedAt: bigint("extracted_at", { mode: "number" }),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [
    check("artifact_urls_status_check", sql`${t.status} in ('pending', 'ready', 'failed')`),
    uniqueIndex("artifact_urls_by_owner_workspace_normalized_url").on(
      t.ownerUserId,
      t.workspaceId,
      t.normalizedUrl,
    ),
    index("artifact_urls_by_owner_artifact").on(t.ownerUserId, t.artifactId),
    index("artifact_urls_by_owner_workspace_status_updated").on(
      t.ownerUserId,
      t.workspaceId,
      t.status,
      t.updatedAt,
    ),
  ],
);

export type ArtifactUrl = typeof artifactUrls.$inferSelect;
export type NewArtifactUrl = typeof artifactUrls.$inferInsert;
