import { messagePreview } from "./core.ts";

export type AgentKind = "lite" | "pro";

// ---------------------------------------------------------------------------
// Context refs are the runtime-neutral model behind inline `@mention` pills.
// ---------------------------------------------------------------------------

/** UX caps per percakapan (juga di-clamp ContextService.hydrate sisi server). */
export const MAX_CONTEXT_WORKSPACES = 5;
export const MAX_CONTEXT_PAPERS = 8;
export const MAX_CONTEXT_ANNOTATIONS = 8;

export type ContextRef =
  | { kind: "workspace"; workspaceId: string; label: string }
  | { kind: "paper"; workspaceId: string; artifactId: string; label: string }
  // Sumber Explore eksternal (BUKAN artifact workspace) — disematkan langsung dari halaman
  // baca paper/berita. Hydrate menariknya dari cache OpenAlex / feed (lihat ContextService).
  | { kind: "explore-paper"; paperKey: string; label: string }
  | { kind: "news"; feedItemId: string; label: string }
  // Referensi dari Citation Library workspace (tab Sitasi). Menyemat satu citation
  // (metadata terstruktur saja — bukan file/token) supaya agen bisa membacanya via
  // get_workspace_citation. Butuh workspaceId + citationId untuk validasi owner saat hydrate.
  | {
      kind: "workspace-citation";
      workspaceId: string;
      citationId: string;
      label: string;
    }
  // Pilihan blok di editor BlockNote (tombol "Tanya Astra" di Formatting Toolbar). Menyemat
  // blok spesifik sebuah artifact markdown + cuplikan teksnya supaya agen tahu bagian persis
  // yang dimaksud (baca via get_render_payload). Mengedit bagian = lewat AI editor native di dokumen.
  | {
      kind: "artifact-selection";
      artifactId: string;
      blockIds: string[];
      excerpt: string;
      label: string;
    }
  // Anotasi dokumen Typst (mode anotasi preview). Membawa seluruh data anchor secara inline
  // (selectedText/page/note) sehingga TIDAK ikut hydrate server — konteksnya diformat lokal via
  // buildDocumentAnnotationClientContext. annotationId dipakai untuk mark-sent setelah kirim.
  | {
      kind: "document-annotation";
      workspaceId: string;
      annotationId: string;
      page: number;
      selectedText: string;
      note: string;
      elementLabel: string;
      label: string;
    };

/** Cuplikan pilihan blok editor untuk hydrate (validasi ownership + clamp di server). */
export type ContextSelection = {
  artifactId: string;
  blockIds: string[];
  excerpt: string;
};

/** Stable identity for dedupe + signature comparison. */
export function contextRefKey(ref: ContextRef): string {
  switch (ref.kind) {
    case "paper":
      return `${ref.workspaceId}:${ref.artifactId}`;
    case "workspace":
      return `${ref.workspaceId}:`;
    case "explore-paper":
      return `epk:${ref.paperKey}`;
    case "news":
      return `nid:${ref.feedItemId}`;
    case "workspace-citation":
      return `wcite:${ref.workspaceId}:${ref.citationId}`;
    case "artifact-selection":
      // Key by artifact + blok terurut → pilihan blok yang sama dedupe, pilihan berbeda distinct.
      return `asel:${ref.artifactId}:${[...ref.blockIds].sort().join(",")}`;
    case "document-annotation":
      return `anno:${ref.annotationId}`;
  }
}

export function contextRefsSignature(refs: ContextRef[]): string {
  return refs.map(contextRefKey).join("|");
}

/** Split refs into the id lists the hydrate endpoint expects. */
export type ContextCitation = { workspaceId: string; citationId: string };

export type DocumentAnnotationRef = Extract<
  ContextRef,
  { kind: "document-annotation" }
>;

export function splitContextRefs(refs: ContextRef[]): {
  workspaceIds: string[];
  artifactIds: string[];
  paperKeys: string[];
  feedItemIds: string[];
  workspaceCitations: ContextCitation[];
  selections: ContextSelection[];
  documentAnnotations: DocumentAnnotationRef[];
} {
  const workspaceIds: string[] = [];
  const artifactIds: string[] = [];
  const paperKeys: string[] = [];
  const feedItemIds: string[] = [];
  const workspaceCitations: ContextCitation[] = [];
  const selections: ContextSelection[] = [];
  const documentAnnotations: DocumentAnnotationRef[] = [];
  for (const ref of refs) {
    switch (ref.kind) {
      case "workspace":
        workspaceIds.push(ref.workspaceId);
        break;
      case "paper":
        artifactIds.push(ref.artifactId);
        break;
      case "explore-paper":
        paperKeys.push(ref.paperKey);
        break;
      case "news":
        feedItemIds.push(ref.feedItemId);
        break;
      case "workspace-citation":
        workspaceCitations.push({
          workspaceId: ref.workspaceId,
          citationId: ref.citationId,
        });
        break;
      case "artifact-selection":
        selections.push({
          artifactId: ref.artifactId,
          blockIds: ref.blockIds,
          excerpt: ref.excerpt,
        });
        break;
      case "document-annotation":
        documentAnnotations.push(ref);
        break;
      default: {
        // Exhaustiveness: menambah kind ContextRef baru jadi error compile di sini.
        const _exhaustive: never = ref;
        void _exhaustive;
      }
    }
  }
  return {
    workspaceIds,
    artifactIds,
    paperKeys,
    feedItemIds,
    workspaceCitations,
    selections,
    documentAnnotations,
  };
}

export function countContextRefs(refs: ContextRef[]): {
  workspaces: number;
  papers: number;
  explorePapers: number;
  news: number;
  workspaceCitations: number;
  selections: number;
  documentAnnotations: number;
} {
  let workspaces = 0;
  let papers = 0;
  let explorePapers = 0;
  let news = 0;
  let workspaceCitations = 0;
  let selections = 0;
  let documentAnnotations = 0;
  for (const ref of refs) {
    switch (ref.kind) {
      case "workspace":
        workspaces += 1;
        break;
      case "paper":
        papers += 1;
        break;
      case "explore-paper":
        explorePapers += 1;
        break;
      case "news":
        news += 1;
        break;
      case "workspace-citation":
        workspaceCitations += 1;
        break;
      case "artifact-selection":
        selections += 1;
        break;
      case "document-annotation":
        documentAnnotations += 1;
        break;
      default: {
        const _exhaustive: never = ref;
        void _exhaustive;
      }
    }
  }
  return {
    workspaces,
    papers,
    explorePapers,
    news,
    workspaceCitations,
    selections,
    documentAnnotations,
  };
}

export function buildWorkspaceMentionLabel(workspaceName: string): string {
  return `@${workspaceName}`;
}

export function buildPaperMentionLabel(
  workspaceName: string,
  paperTitle: string,
): string {
  return `@${workspaceName}:${paperTitle}`;
}

/** Label pill untuk paper Explore eksternal / berita (judulnya saja; tanpa prefix workspace). */
export function buildExternalPaperMentionLabel(paperTitle: string): string {
  return `@${paperTitle}`;
}

/** Berita Explore — label = judul saja (format sama dgn paper eksternal). */
export const buildNewsMentionLabel = buildExternalPaperMentionLabel;

/** Label pill referensi dari tab Sitasi. Prefiks `⟢` membedakannya dari pill lain. */
export function buildWorkspaceCitationMentionLabel(
  citationTitle: string,
): string {
  return `⟢ ${messagePreview(citationTitle, 28)}`;
}

/**
 * Label pill untuk pilihan blok editor ("Tanya Astra"). Pakai cuplikan teks bila ada
 * (`❝ "kutipan…"`, clamp 24 char); kalau pilihan kosong-teks (mis. heading/embed), pakai jumlah
 * blok (`❝ N blok`). Prefiks `❝` membedakannya secara visual dari pill workspace/paper.
 */
export function buildSelectionMentionLabel(
  excerpt: string,
  blockCount = 0,
): string {
  const trimmed = (excerpt ?? "").replace(/\s+/g, " ").trim();
  if (trimmed) return `❝ ${messagePreview(trimmed, 24)}`;
  if (blockCount > 0) return `❝ ${blockCount} blok`;
  return "❝ Pilihan";
}

/** Label pill anotasi dokumen. Prefiks `✎` membedakannya dari pill lain. */
export function buildDocumentAnnotationMentionLabel(
  elementLabel: string,
  selectedText: string,
): string {
  const trimmed = (selectedText ?? "").replace(/\s+/g, " ").trim();
  return `✎ ${elementLabel}: ${messagePreview(trimmed, 24)}`;
}

/**
 * Serialisasi chip anotasi → satu context message untuk Astra. Anchor edit = teks terseleksi
 * (typst.ts tak mengekspos peta span→baris); alur kerja tool ada di instruksi agen, bukan di sini.
 */
export function buildDocumentAnnotationClientContext(
  refs: DocumentAnnotationRef[],
): string {
  const lines = refs.map((r, i) => {
    const excerpt = r.selectedText ? ` — teks: "${r.selectedText}"` : "";
    const note = r.note ? ` — catatan: ${r.note}` : "";
    return `${i + 1}. [id:${r.annotationId}] (hal. ${r.page}) [${r.elementLabel}]${excerpt}${note}`;
  });
  return [
    "Anotasi dari user pada dokumen proyek ini. Panggil get_document_source lalu propose_document_edit; pakai teks terseleksi sebagai anchor (edits.oldText).",
    ...lines,
  ].join("\n");
}

/** Inline mention markers (private-use sentinels) — keep pills inline in sent text. */
export const MENTION_MARKER_OPEN = String.fromCharCode(0xe000);
export const MENTION_MARKER_CLOSE = String.fromCharCode(0xe001);

export function wrapMentionLabel(label: string): string {
  return `${MENTION_MARKER_OPEN}${label}${MENTION_MARKER_CLOSE}`;
}

/** Remove inline mention markers, keeping the readable label inside. */
export function stripMentionMarkers(text: string): string {
  // Common case (teks tanpa marker) → kembalikan apa adanya tanpa alokasi split/join. Penting:
  // processor input men-strip TIAP pesan user TIAP giliran, mayoritas tak ber-mention.
  if (
    !text.includes(MENTION_MARKER_OPEN) &&
    !text.includes(MENTION_MARKER_CLOSE)
  )
    return text;
  return text
    .split(MENTION_MARKER_OPEN)
    .join("")
    .split(MENTION_MARKER_CLOSE)
    .join("");
}

export type MentionSegment =
  { type: "text"; value: string } | { type: "mention"; label: string };

/** Split a message string into ordered text / mention segments. */
export function parseMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf(MENTION_MARKER_OPEN, index);
    if (open === -1) {
      if (index < text.length)
        segments.push({ type: "text", value: text.slice(index) });
      break;
    }
    if (open > index)
      segments.push({ type: "text", value: text.slice(index, open) });
    const close = text.indexOf(MENTION_MARKER_CLOSE, open + 1);
    if (close === -1) {
      segments.push({ type: "text", value: text.slice(open) });
      break;
    }
    segments.push({ type: "mention", label: text.slice(open + 1, close) });
    index = close + 1;
  }
  return segments;
}

// ---------------------------------------------------------------------------
// ask_questions (HITL klarifikasi) — kontrak BERSAMA web (render kartu Questions),
// agent (tool suspend/resume), dan workflow /deep (step `clarify`). Pure & zero-dep
// di sini; skema zod dibangun di sisi agent (`lib/ask-questions-schema.ts`) lalu
// diasersi cocok dengan tipe ini (SATU SSOT, drift = error compile). Sejajar pola
// built-in `ask_user` Mastra, tapi PLURAL: satu kartu bisa memuat >1 pertanyaan →
// satu resume.
// ---------------------------------------------------------------------------

/** Tipe interaksi satu pertanyaan: `single` = radio (≤1 pilihan), `multi` = checkbox (>1). */
