import type { ContextSelection } from "@aqsha/chat-core";
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
/** Cap pilihan blok editor ("Tanya Astra") per giliran + clamp cuplikan teksnya. */
const MAX_SELECTIONS = 4;
const MAX_SELECTION_BLOCK_IDS = 50;
const MAX_SELECTION_EXCERPT_CHARS = 500;

/** Pilihan blok editor tersemat (validasi ownership di hydrate) — alias tipe wire SSOT chat-core. */
export type ContextSelectionInput = ContextSelection;

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
      selections?: ContextSelectionInput[];
    },
  ): Promise<HydratedContext> {
    const wantWorkspaces = dedupe(input.workspaceIds).slice(0, MAX_WORKSPACES);
    const wantArtifacts = dedupe(input.artifactIds).slice(0, MAX_ARTIFACTS);
    const wantPapers = dedupe(input.paperKeys ?? []).slice(0, MAX_DISCOVERY);
    const wantFeedItems = dedupe(input.feedItemIds ?? []).slice(0, MAX_DISCOVERY);
    // Pilihan blok: dedup per artifact (pilihan terakhir menang), clamp jumlah + blockIds + excerpt.
    const wantSelections = dedupeSelections(input.selections ?? []).slice(0, MAX_SELECTIONS);
    // Gabung id artifact lane @mention dokumen + lane pilihan blok → satu fetch per id unik. Tanpa
    // ini, dokumen yang di-@mention SEKALIGUS punya pilihan "Tanya Astra" (alur utama fitur ini)
    // di-`findById` dua kali tiap kirim pesan.
    const wantArtifactSet = new Set(wantArtifacts);
    const artifactIdsToHydrate = dedupe([...wantArtifacts, ...wantSelections.map((s) => s.artifactId)]);

    const [workspaces, artifactEntries, papers, feedItems] = await Promise.all([
      Promise.all(
        wantWorkspaces.map((id) => WorkspaceService.get(db, input.ownerUserId, id)),
      ),
      // Lane @mention dokumen strict (throw → gagalkan hydrate, sesuai semula); id yang HANYA dari
      // pilihan blok best-effort (validasi ownership sama, tapi gagal → drop senyap).
      Promise.all(
        artifactIdsToHydrate.map(async (id) => {
          try {
            return [id, await ArtifactService.getForAgent(db, input.ownerUserId, id)] as const;
          } catch (err) {
            if (wantArtifactSet.has(id)) throw err;
            return [id, null] as const;
          }
        }),
      ),
      // Paper Explore publik dari CACHE saja (`fetchOnMiss: false`): hydrate ada di jalur kirim
      // (composer `await` sebelum mengirim), jadi jangan blokir dengan cold-resolve OpenAlex
      // (jaringan, rate-limited). Cache miss → drop pill diam-diam (abstrak tak tersedia turn ini).
      // Best-effort: kegagalan satu key tak menggagalkan hydrate.
      Promise.all(
        wantPapers.map((key) =>
          ExploreService.getOrFetchPaper(db, key, { fetchOnMiss: false }).catch(() => null),
        ),
      ),
      Promise.all(
        wantFeedItems.map((id) =>
          FeedService.getFeedItem(db, input.ownerUserId, id).catch(() => null),
        ),
      ),
    ]);

    const artifactById = new Map(artifactEntries);
    const validWorkspaces = workspaces.filter((w): w is NonNullable<typeof w> => w !== null);
    const validArtifacts = wantArtifacts
      .map((id) => artifactById.get(id) ?? null)
      .filter((a): a is NonNullable<typeof a> => a !== null);
    const validPapers = papers.filter((p): p is NonNullable<typeof p> => p !== null);
    // Hanya berita (`kind: "news"`): kontrak `feedItemIds` = berita-by-id, dan `buildNote`
    // melabelinya "Berita" → jangan salah-label feed item kind lain yang lolos lewat API.
    const validFeedItems = feedItems.filter(
      (f): f is NonNullable<typeof f> => f !== null && f.kind === "news",
    );
    // Pilihan blok: artifact bukan-milik / hilang → drop senyap. Title diambil untuk catatan;
    // blockIds + excerpt sudah di-clamp.
    const validSelections: NoteSelection[] = wantSelections
      .map((sel) => {
        const artifact = artifactById.get(sel.artifactId);
        return artifact
          ? {
              artifactId: artifact._id,
              title: artifact.title,
              blockIds: sel.blockIds,
              excerpt: sel.excerpt,
            }
          : null;
      })
      .filter((s): s is NoteSelection => s !== null);

    return {
      note: buildNote(validWorkspaces, validArtifacts, validPapers, validFeedItems, validSelections),
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

/** Dedup pilihan per artifact (yang terakhir menang) + clamp blockIds & excerpt sisi server. */
function dedupeSelections(selections: ContextSelectionInput[]): ContextSelectionInput[] {
  const byArtifact = new Map<string, ContextSelectionInput>();
  for (const sel of selections) {
    const artifactId = (sel.artifactId ?? "").trim();
    if (!artifactId) continue;
    const blockIds = [...new Set((sel.blockIds ?? []).filter((id) => id.length > 0))].slice(
      0,
      MAX_SELECTION_BLOCK_IDS,
    );
    if (blockIds.length === 0) continue;
    byArtifact.set(artifactId, {
      artifactId,
      blockIds,
      excerpt: (sel.excerpt ?? "").slice(0, MAX_SELECTION_EXCERPT_CHARS),
    });
  }
  return [...byArtifact.values()];
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

type NoteSelection = {
  artifactId: string;
  title: string;
  blockIds: string[];
  excerpt: string;
};

function buildNote(
  workspaces: Array<{ id: string; name: string }>,
  artifacts: Array<{ _id: string; title: string; plainTextPreview: string | null }>,
  papers: NotePaper[],
  feedItems: NoteFeedItem[],
  selections: NoteSelection[],
): string {
  if (
    workspaces.length === 0 &&
    artifacts.length === 0 &&
    papers.length === 0 &&
    feedItems.length === 0 &&
    selections.length === 0
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
  if (selections.length > 0) {
    lines.push(
      "",
      "Bagian dokumen tersemat (pengguna memilih blok SPESIFIK di editor — fokuskan jawaban ke sana):",
      "Untuk membaca konteks lengkap blok tetangga panggil `get_render_payload` dengan artifactId. Untuk MENGEDIT dokumen, pengguna memakai AI editor native di dokumen (Astra dapat menyunting bagian terpilih langsung di editor); JANGAN klaim sudah mengubah dokumen dari sini.",
    );
    for (const s of selections) {
      const excerpt = s.excerpt.trim();
      lines.push(`- "${s.title}" (artifactId: ${s.artifactId}, blockIds: ${s.blockIds.join(", ")})`);
      if (excerpt) lines.push(`  Kutipan terpilih: ${excerpt}`);
    }
  }
  lines.push("</system-reminder>");
  return lines.join("\n");
}
