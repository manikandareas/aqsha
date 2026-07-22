import {
  ArtifactRepo,
  throwAppError,
  WORKSPACE_KIND_INFO_FIELDS,
  WORKSPACE_KINDS,
  type Workspace,
  type WorkspaceKind,
  type WorkspaceKindInfo,
  WorkspaceRepo,
} from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { decodeKeysetCursor } from "@aqsha/db";
import { previewFromTypstSource } from "./artifacts/model";
import { PLAN_CATALOG, UNLIMITED } from "./plan";
import { resolveEffectivePlanKey } from "./billing/snapshot";
import { scaffoldTypstDocument } from "./typst/scaffold";
import { WorkspaceDocumentService } from "./workspace-document.service";
import { normalizeName } from "./workspaces/normalize";
import { normalizeWorkspaceEmoji, workspaceEmojiForNewWorkspace } from "./workspaces/emoji";

/** Simpan hanya field kind_info yang relevan untuk `kind` (validasi bentuk = strip lenient). */
function sanitizeKindInfo(
  kind: WorkspaceKind,
  kindInfo: WorkspaceKindInfo | null | undefined,
): WorkspaceKindInfo | null {
  if (!kindInfo) return null;
  const out: WorkspaceKindInfo = {};
  for (const field of WORKSPACE_KIND_INFO_FIELDS[kind]) {
    const value = kindInfo[field];
    if (typeof value === "string" && value.trim()) out[field] = value.trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const DEFAULT_WORKSPACE_NAME = "Workspace Saya";

/** Workspace row + sneak-peek teks dokumen Typst untuk rak/list (null bila belum ada dokumen). */
export type WorkspaceListItem = Workspace & {
  documentPreview: string | null;
};

const WORKSPACE_NAME_LABEL = "Workspace name";
const DEFAULT_LIST_LIMIT = 25;
const MAX_LIST_LIMIT = 100;

/** Workspace seam — CRUD penuh + capacity. Dipakai route api + tool agent. */
export const WorkspaceService = {
  /**
   * Idempotent: kembalikan id workspace terbaru milik owner bila ada; selain itu
   * buat "Workspace Saya" (emoji deterministik, status active). Port V1
   * `ensureDefaultWorkspaceForOwner`.
   */
  async ensureDefaultWorkspaceForOwner(db: DbOrTx, ownerUserId: string): Promise<string> {
    const existing = await WorkspaceRepo.findNewestByOwner(db, ownerUserId);
    if (existing) return existing.id;

    const now = Date.now();
    const id = crypto.randomUUID();
    await WorkspaceRepo.insert(db, {
      id,
      ownerUserId,
      name: DEFAULT_WORKSPACE_NAME,
      emoji: workspaceEmojiForNewWorkspace({ ownerUserId, name: DEFAULT_WORKSPACE_NAME, now }),
      description: null,
      kind: "freeform",
      kindInfo: null,
      documentArtifactId: null,
      deadline: null,
      topicNote: null,
      status: "active",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },

  /**
   * Assert kepemilikan baris (di service, bukan edge — supaya MCP/worker terjaga
   * sama). Missing/not-owned → 404 `workspace_not_found`; `requireActive` & arsip →
   * 409 `workspace_archived`. Mengembalikan row.
   */
  async assertWorkspaceOwner(
    db: DbOrTx,
    ownerUserId: string,
    workspaceId: string,
    options: { requireActive?: boolean } = {},
  ): Promise<Workspace> {
    const workspace = await WorkspaceRepo.findById(db, workspaceId);
    if (!workspace || workspace.ownerUserId !== ownerUserId) {
      throwAppError({
        message: "Workspace not found",
        code: "workspace_not_found",
        severity: "error",
        status: 404,
      });
    }
    if (options.requireActive && workspace.status !== "active") {
      throwAppError({
        message: "Workspace is archived",
        code: "workspace_archived",
        severity: "warning",
        status: 409,
      });
    }
    return workspace;
  },

  /** List keyset milik owner (active-only kecuali `includeArchived`) + sneak-peek dokumen Typst. */
  async list(
    db: DbOrTx,
    ownerUserId: string,
    args: { includeArchived?: boolean; cursor?: string | null; limit?: number },
  ): Promise<{ items: WorkspaceListItem[]; nextCursor: string | null }> {
    const limit = clampLimit(args.limit);
    const page = await WorkspaceRepo.listByOwner(db, {
      ownerUserId,
      includeArchived: args.includeArchived ?? false,
      limit,
      cursor: decodeKeysetCursor(args.cursor),
    });
    const documentIds = page.items
      .map((item) => item.documentArtifactId)
      .filter((id): id is string => Boolean(id));
    // Raw content prefix (or stored preview) → one Typst cleaner. Client only soft-renders blocks.
    const rawPreviews = await ArtifactRepo.findPreviewsByIds(db, documentIds);
    return {
      items: page.items.map((item) => {
        const raw = item.documentArtifactId
          ? (rawPreviews.get(item.documentArtifactId) ?? null)
          : null;
        const cleaned = raw?.trim() ? previewFromTypstSource(raw) : "";
        return {
          ...item,
          documentPreview: cleaned || null,
        };
      }),
      nextCursor: page.nextCursor,
    };
  },

  /** Soft ownership: `null` bila missing/not-owned (BUKAN throw). Port `workspaces.get` V1. */
  async get(db: DbOrTx, ownerUserId: string, workspaceId: string): Promise<Workspace | null> {
    const workspace = await WorkspaceRepo.findById(db, workspaceId);
    if (!workspace || workspace.ownerUserId !== ownerUserId) return null;
    return workspace;
  },

  /**
   * Buat proyek: capacity per plan + emoji deterministik + scaffold dokumen Typst awal
   * (halaman judul thesis-family dari kindInfo, heading bab standar) — satu transaksi
   * (count + insert workspace + insert dokumen → cegah race lewat cap). `name` opsional;
   * UI memakai `topicNote` sebagai placeholder judul.
   */
  async create(
    db: Db,
    input: {
      ownerUserId: string;
      ownerEmail?: string | null;
      name?: string;
      kind: WorkspaceKind;
      kindInfo?: WorkspaceKindInfo | null;
      authorName?: string | null;
      topicNote?: string | null;
      deadline?: number | null;
    },
  ): Promise<{ id: string }> {
    const name =
      input.name !== undefined && input.name.trim() !== ""
        ? normalizeName(input.name, WORKSPACE_NAME_LABEL)
        : "";
    if (!WORKSPACE_KINDS.includes(input.kind)) {
      throwAppError({
        message: "Jenis karya tulis tidak dikenal",
        code: "workspace_kind_invalid",
        severity: "warning",
        status: 422,
      });
    }
    const kindInfo = sanitizeKindInfo(input.kind, input.kindInfo);
    const plan = await resolveEffectivePlanKey(db, { ownerUserId: input.ownerUserId, email: input.ownerEmail });
    const limit = PLAN_CATALOG[plan].workspaceLimit;
    const now = Date.now();
    const id = crypto.randomUUID();
    const source = scaffoldTypstDocument(input.kind, {
      title: name || undefined,
      authorName: input.authorName ?? undefined,
      year: new Date(now).getFullYear(),
      kindInfo,
    });

    await db.transaction(async (tx) => {
      if (limit !== UNLIMITED) {
        const activeCount = await WorkspaceRepo.countActiveByOwner(tx, input.ownerUserId, limit);
        if (activeCount >= limit) {
          throwAppError({
            message: "Workspace limit reached for current plan",
            code: "workspace_limit_reached",
            severity: "warning",
            status: 403,
          });
        }
      }
      await WorkspaceRepo.insert(tx, {
        id,
        ownerUserId: input.ownerUserId,
        name,
        emoji: workspaceEmojiForNewWorkspace({ ownerUserId: input.ownerUserId, name, now }),
        description: null,
        kind: input.kind,
        kindInfo,
        documentArtifactId: null,
        deadline: input.deadline ?? null,
        topicNote: input.topicNote?.trim() || null,
        status: "active",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await WorkspaceDocumentService.insertInitialDocument(tx, {
        ownerUserId: input.ownerUserId,
        workspaceId: id,
        title: name || "Dokumen proyek",
        source,
        author: "system",
      });
    });

    return { id };
  },

  /**
   * Satu PATCH untuk identitas + atribut proyek (nama/emoji/deskripsi/kindInfo/
   * deadline/topik). Minimal satu field; `kind` sengaja TIDAK bisa diubah —
   * ganti jenis = proyek baru. `kindInfo` divalidasi terhadap `kind` proyek (strip lenient).
   */
  async update(
    db: DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      name?: string;
      emoji?: string;
      description?: string | null;
      kindInfo?: WorkspaceKindInfo | null;
      deadline?: number | null;
      topicNote?: string | null;
    },
  ): Promise<{ ok: true }> {
    const hasField =
      input.name !== undefined ||
      input.emoji !== undefined ||
      input.description !== undefined ||
      input.kindInfo !== undefined ||
      input.deadline !== undefined ||
      input.topicNote !== undefined;
    if (!hasField) {
      throwAppError({
        message: "Minimal satu field wajib.",
        code: "bad_request",
        severity: "warning",
      });
    }
    const workspace = await this.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    await WorkspaceRepo.update(db, input.workspaceId, {
      ...(input.name !== undefined ? { name: normalizeName(input.name, WORKSPACE_NAME_LABEL) } : {}),
      ...(input.emoji !== undefined ? { emoji: normalizeWorkspaceEmoji(input.emoji) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.kindInfo !== undefined
        ? { kindInfo: sanitizeKindInfo(workspace.kind as WorkspaceKind, input.kindInfo) }
        : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
      ...(input.topicNote !== undefined ? { topicNote: input.topicNote?.trim() || null } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },

  /** Idempotent archive (no unarchive). Sudah archived → no rewrite. Port `workspaces.archive` V1. */
  async archive(
    db: DbOrTx,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<{ ok: true }> {
    const workspace = await this.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    if (workspace.status === "archived") return { ok: true };
    const now = Date.now();
    await WorkspaceRepo.update(db, input.workspaceId, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
};

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIST_LIMIT;
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)));
}
