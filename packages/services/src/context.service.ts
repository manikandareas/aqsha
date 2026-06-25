import type { DbOrTx } from "@aqsha/db";
import { ArtifactService } from "./artifact.service";
import { WorkspaceService } from "./workspace.service";

/** Hard caps sisi server (UX caps lebih kecil di chat-core). */
const MAX_WORKSPACES = 30;
const MAX_ARTIFACTS = 8;

export type HydratedContext = {
  /** Catatan ringkas (markdown) untuk dikirim sebagai `clientContext` ke agen. */
  note: string;
  /** Id workspace yang TERVALIDASI milik user (untuk scope RAG). */
  workspaceIds: string[];
  /** Id artifact yang TERVALIDASI milik user. */
  artifactIds: string[];
};

/**
 * ContextService.hydrate (Slice 6.6) — resolve `@mention` token (workspace/paper
 * yang di-pin user) → konteks ringkas tepercaya. Memvalidasi kepemilikan tiap id
 * (drop yang bukan milik / hilang), meng-clamp jumlah, dan menyusun catatan
 * markdown yang dikirim composer sebagai `clientContext` (ephemeral, satu turn)
 * ke proses eve. Sisi eve, tool `search_thread_documents` bisa men-scope RAG ke
 * `workspaceIds` yang dikembalikan di catatan.
 *
 * Diakses dari api-v2 (bun, src). Subpath `./context` + entri tsup ditambah agar
 * konsisten dengan service lain (D-E) bila kelak dipakai dari proses eve.
 */
export const ContextService = {
  async hydrate(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceIds: string[]; artifactIds: string[] },
  ): Promise<HydratedContext> {
    const wantWorkspaces = dedupe(input.workspaceIds).slice(0, MAX_WORKSPACES);
    const wantArtifacts = dedupe(input.artifactIds).slice(0, MAX_ARTIFACTS);

    const [workspaces, artifacts] = await Promise.all([
      Promise.all(
        wantWorkspaces.map((id) => WorkspaceService.get(db, input.ownerUserId, id)),
      ),
      Promise.all(
        wantArtifacts.map((id) => ArtifactService.getForAgent(db, input.ownerUserId, id)),
      ),
    ]);

    const validWorkspaces = workspaces.filter((w): w is NonNullable<typeof w> => w !== null);
    const validArtifacts = artifacts.filter((a): a is NonNullable<typeof a> => a !== null);

    return {
      note: buildNote(validWorkspaces, validArtifacts),
      workspaceIds: validWorkspaces.map((w) => w.id),
      artifactIds: validArtifacts.map((a) => a._id),
    };
  },
};

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

function buildNote(
  workspaces: Array<{ id: string; name: string }>,
  artifacts: Array<{ _id: string; title: string; plainTextPreview: string | null }>,
): string {
  if (workspaces.length === 0 && artifacts.length === 0) return "";
  const lines: string[] = ["Konteks yang disematkan pengguna untuk percakapan ini:"];
  for (const w of workspaces) {
    lines.push(`- Workspace "${w.name}" (workspaceId: ${w.id})`);
  }
  for (const a of artifacts) {
    const preview = a.plainTextPreview ? ` — ${a.plainTextPreview.slice(0, 200)}` : "";
    lines.push(`- Dokumen "${a.title}" (artifactId: ${a._id})${preview}`);
  }
  lines.push(
    "",
    "Prioritaskan konteks ini. Untuk pertanyaan yang menyinggung dokumen di workspace tersemat, panggil search_thread_documents dengan workspaceId yang sesuai.",
  );
  return lines.join("\n");
}
