import type { Db } from "@aqsha/db";
import { ArtifactService } from "./artifact.service";
import { ExploreService } from "./explore.service";
import { FeedService } from "./feed.service";
import { WorkspaceService } from "./workspace.service";

/** Hard caps sisi server (UX caps lebih kecil di chat-core). */
const MAX_WORKSPACES = 30;
const MAX_ARTIFACTS = 8;
/** Cap sumber Explore eksternal (paper publik / berita) yang disematkan per giliran. */
const MAX_DISCOVERY = 4;

export type HydratedContext = {
  /** Catatan ringkas (markdown) untuk dikirim sebagai `clientContext` ke agen. */
  note: string;
  /** Id workspace yang TERVALIDASI milik user (untuk scope RAG). */
  workspaceIds: string[];
  /** Id artifact yang TERVALIDASI milik user. */
  artifactIds: string[];
  /** Key paper Explore eksternal yang berhasil di-resolve. */
  paperKeys: string[];
  /** Id feed item (berita) yang berhasil di-resolve. */
  feedItemIds: string[];
};

/**
 * ContextService.hydrate (Slice 6.6) — resolve `@mention` token (workspace/paper
 * yang di-pin user) → konteks ringkas tepercaya. Memvalidasi kepemilikan tiap id
 * (drop yang bukan milik / hilang), meng-clamp jumlah, dan menyusun catatan
 * markdown yang dikirim composer sebagai `clientContext` (ephemeral, satu turn)
 * ke proses eve. Sisi eve, tool `search_thread_documents` bisa men-scope RAG ke
 * `workspaceIds` yang dikembalikan di catatan.
 *
 * Diakses dari api (bun, src). Subpath `./context` + entri tsup ditambah agar
 * konsisten dengan service lain (D-E) bila kelak dipakai dari proses eve.
 */
export const ContextService = {
  async hydrate(
    // `Db` (bukan `DbOrTx`): paper/feed resolver di bawah butuh koneksi pooled (cache + fetch
    // OpenAlex + upsert), bukan handle transaksi. Pemanggil (`/threads/context/hydrate`) memang
    // mengoper `Db`. Hindari cast `as Db` yang menyembunyikan prasyarat ini.
    db: Db,
    input: {
      ownerUserId: string;
      workspaceIds: string[];
      artifactIds: string[];
      paperKeys?: string[];
      feedItemIds?: string[];
    },
  ): Promise<HydratedContext> {
    const wantWorkspaces = dedupe(input.workspaceIds).slice(0, MAX_WORKSPACES);
    const wantArtifacts = dedupe(input.artifactIds).slice(0, MAX_ARTIFACTS);
    const wantPapers = dedupe(input.paperKeys ?? []).slice(0, MAX_DISCOVERY);
    const wantFeedItems = dedupe(input.feedItemIds ?? []).slice(0, MAX_DISCOVERY);

    const [workspaces, artifacts, papers, feedItems] = await Promise.all([
      Promise.all(
        wantWorkspaces.map((id) => WorkspaceService.get(db, input.ownerUserId, id)),
      ),
      Promise.all(
        wantArtifacts.map((id) => ArtifactService.getForAgent(db, input.ownerUserId, id)),
      ),
      // Paper Explore publik: resolve-on-miss (`fetchOnMiss: true`). Paper di sini DI-PIN eksplisit
      // (@mention / "Tanya Astra" / auto-mention halaman), jadi konteksnya HARUS ikut — cache-only
      // dulu mem-drop diam-diam paper feed yang belum pernah dibuka (tak ada di cache OpenAlex),
      // menyisakan pill tanpa abstrak. Cache hit = jalur umum (paper yang dibuka reader sudah panas);
      // miss menanggung satu cold-resolve sekali lalu panas. Dibatasi `MAX_DISCOVERY` + best-effort
      // (`.catch` → null): kegagalan/timeout satu key drop pill itu saja, tak menggagalkan hydrate.
      Promise.all(
        wantPapers.map((key) =>
          ExploreService.getOrFetchPaper(db, key, { fetchOnMiss: true }).catch(() => null),
        ),
      ),
      Promise.all(
        wantFeedItems.map((id) =>
          FeedService.getFeedItem(db, input.ownerUserId, id).catch(() => null),
        ),
      ),
    ]);

    const validWorkspaces = workspaces.filter((w): w is NonNullable<typeof w> => w !== null);
    const validArtifacts = artifacts.filter((a): a is NonNullable<typeof a> => a !== null);
    const validPapers = papers.filter((p): p is NonNullable<typeof p> => p !== null);
    // Hanya berita (`kind: "news"`): kontrak `feedItemIds` = berita-by-id, dan `buildNote`
    // melabelinya "Berita" → jangan salah-label feed item kind lain yang lolos lewat API.
    const validFeedItems = feedItems.filter(
      (f): f is NonNullable<typeof f> => f !== null && f.kind === "news",
    );

    return {
      note: buildNote(validWorkspaces, validArtifacts, validPapers, validFeedItems),
      workspaceIds: validWorkspaces.map((w) => w.id),
      artifactIds: validArtifacts.map((a) => a._id),
      paperKeys: validPapers.map((p) => p.key),
      feedItemIds: validFeedItems.map((f) => f._id),
    };
  },
};

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))];
}

type NotePaper = {
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url: string;
  abstract?: string;
  snippet: string;
};

type NoteFeedItem = {
  title: string;
  sourceLabel: string;
  url: string;
  tldr?: string;
  summary: string;
  publishedAt?: number;
};

function buildNote(
  workspaces: Array<{ id: string; name: string }>,
  artifacts: Array<{ _id: string; title: string; plainTextPreview: string | null }>,
  papers: NotePaper[],
  feedItems: NoteFeedItem[],
): string {
  if (
    workspaces.length === 0 &&
    artifacts.length === 0 &&
    papers.length === 0 &&
    feedItems.length === 0
  ) {
    return "";
  }
  // <system-reminder> otoritatif berisi konteks @mention giliran ini. Cara MEMBACA tipe milik-user
  // (workspace/dokumen) diajarkan penuh di `instructions.ts` → di sini cukup daftar id + 1 pointer
  // tool ringkas. Sumber Explore publik (paper/berita) TIDAK punya artifactId/tool — isinya
  // disisipkan langsung di catatan ini supaya agen bisa membacanya tanpa fetch.
  const lines: string[] = [
    "<system-reminder>",
    "Pengguna menyematkan konteks berikut lewat @mention untuk giliran ini (PRIORITASKAN, baca lebih dulu):",
  ];
  if (artifacts.length > 0) {
    lines.push("", "Dokumen tersemat (baca via `get_render_payload` dengan artifactId persis):");
    for (const a of artifacts) {
      const preview = a.plainTextPreview ? ` — ${a.plainTextPreview.slice(0, 240)}` : "";
      lines.push(`- "${a.title}" (artifactId: ${a._id})${preview}`);
    }
  }
  if (workspaces.length > 0) {
    lines.push(
      "",
      "Workspace tersemat (cari isinya via `search_thread_documents` dengan workspaceId persis):",
    );
    for (const w of workspaces) {
      lines.push(`- "${w.name}" (workspaceId: ${w.id})`);
    }
  }
  if (papers.length > 0) {
    lines.push(
      "",
      "Paper Explore tersemat (sumber publik; abstraknya disertakan — kutip pakai judul/DOI/tautan):",
    );
    for (const p of papers) {
      const meta = [p.authors.slice(0, 3).join(", "), p.year ? String(p.year) : null, p.venue]
        .filter(Boolean)
        .join(" · ");
      const ident = [p.doi ? `DOI ${p.doi}` : null, p.url].filter(Boolean).join(" · ");
      const body = (p.abstract ?? p.snippet ?? "").trim();
      lines.push(`- "${p.title}"${meta ? ` (${meta})` : ""}${ident ? ` — ${ident}` : ""}`);
      if (body) lines.push(`  Abstrak: ${body.slice(0, 600)}`);
    }
  }
  if (feedItems.length > 0) {
    lines.push(
      "",
      "Berita tersemat (sumber publik; ringkasannya disertakan — sebut sumber & tautannya):",
    );
    for (const f of feedItems) {
      const body = (f.tldr ?? f.summary ?? "").trim();
      lines.push(`- "${f.title}" (${f.sourceLabel})${f.url ? ` — ${f.url}` : ""}`);
      if (body) lines.push(`  Ringkas: ${body.slice(0, 600)}`);
    }
  }
  lines.push("</system-reminder>");
  return lines.join("\n");
}
