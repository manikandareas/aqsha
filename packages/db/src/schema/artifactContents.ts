import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { artifacts } from "./artifacts";
import { users } from "./users";
import { workspaces } from "./workspaces";

/**
 * artifact_contents — 1:1 body artifact (markdown/text). Inline ATAU offloaded ke R2
 * di atas `ARTIFACT_BODY_INLINE_LIMIT` (kolom `*_r2_key`). `blocks_json` jsonb =
 * BlockNote blocks (di-stringify saat dikembalikan ke client). URL artifact TIDAK
 * punya content row (pakai artifact_urls). Kolom unused V1 (upload/ingestion) di-drop.
 */
export const artifactContents = pgTable(
  "artifact_contents",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.ownerUserId, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    threadId: text("thread_id"),
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id),
    blocksJson: jsonb("blocks_json"),
    markdown: text("markdown"),
    plainText: text("plain_text"),
    contextText: text("context_text"),
    plainTextR2Key: text("plain_text_r2_key"),
    blocksJsonR2Key: text("blocks_json_r2_key"),
    markdownR2Key: text("markdown_r2_key"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
  (t) => [index("artifact_contents_by_owner_artifact").on(t.ownerUserId, t.artifactId)],
);

export type ArtifactContent = typeof artifactContents.$inferSelect;
export type NewArtifactContent = typeof artifactContents.$inferInsert;
