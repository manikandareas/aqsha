"use client";

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { BookOpen } from "@aqsha/ui/icons";
import { useSyncExternalStore } from "react";
import type { DocumentCitationCluster } from "@/features/citations/types";
import { cn } from "@/lib/utils";
import {
  type CitationRenderSnapshot,
  EMPTY_CITATION_SNAPSHOT,
  getCitationStore,
} from "./blocknote-citation-store";

const noopSubscribe = () => () => {};
const getEmptySnapshot = () => EMPTY_CITATION_SNAPSHOT;

/** Baca snapshot render sitasi dari store yang dilekatkan ke editor (null-safe). */
function useCitationSnapshot(editor: object | null | undefined): CitationRenderSnapshot {
  const store = getCitationStore(editor);
  const subscribe = store ? store.subscribe : noopSubscribe;
  // getServerSnapshot (arg ke-3) WAJIB: exporter markdown BlockNote me-render node ini secara
  // statis → tanpa itu useSyncExternalStore melempar "Missing getServerSnapshot".
  const getSnapshot = store ? store.getSnapshot : getEmptySnapshot;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function parseIds(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Tampilan inline citation (komponen bernama → patuh rules-of-hooks di spec `render`). */
function CitationInlineView({
  editor,
  citationIds,
  nodeId,
}: {
  editor: object;
  citationIds: string;
  nodeId: string;
}) {
  const snap = useCitationSnapshot(editor);
  const ids = parseIds(citationIds);
  const allMissing = ids.length > 0 && ids.every((id) => snap.missingIds.includes(id));
  const text = snap.textByNode[nodeId];

  if (allMissing) {
    return (
      <span
        contentEditable={false}
        title="Referensi ini sudah dihapus dari Citation Library"
        className="mx-px inline-flex items-center rounded-[4px] border border-destructive/40 bg-destructive/10 px-1 text-[0.85em] font-medium text-destructive"
      >
        ⚠ sitasi hilang
      </span>
    );
  }
  return (
    <span
      contentEditable={false}
      className={cn(
        "mx-px inline cursor-default rounded-[4px] px-1 text-[0.92em] font-medium",
        "bg-[color:var(--accent-lavender,#efeafe)] text-[color:var(--accent-lavender-ink,#5b46c9)]",
        !text && "opacity-60",
      )}
    >
      {text || "[…]"}
    </span>
  );
}

/** Tampilan block daftar pustaka (komponen bernama → patuh rules-of-hooks). */
function BibliographyBlockView({ editor }: { editor: object }) {
  const snap = useCitationSnapshot(editor);
  return (
    <div
      contentEditable={false}
      className="my-2 rounded-[8px] border border-border/60 bg-muted/30 p-3"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
        <BookOpen className="size-3.5" />
        Daftar pustaka
      </div>
      {snap.bibliography.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Belum ada sitasi di dokumen ini. Sisipkan sitasi lewat perintah /sitasi.
        </p>
      ) : (
        <div className="grid gap-1.5">
          {snap.bibliography.map((entry) => (
            <div
              key={entry.id}
              className="text-[13px] leading-relaxed text-foreground [text-indent:-1.25rem] [padding-left:1.25rem]"
            >
              {entry.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline content `citation` — menyimpan `citationIds` (csv) + `nodeId` stabil + locator/affix.
 * Node TIDAK menyimpan teks terformat (keputusan #7): marker in-text di-render reaktif dari
 * store (di-refresh controller tiap himpunan sitasi/style berubah) → ganti style aman.
 */
export const citationInlineSpec = createReactInlineContentSpec(
  {
    type: "citation",
    content: "none",
    propSchema: {
      citationIds: { default: "" },
      nodeId: { default: "" },
      locator: { default: "" },
      label: { default: "" },
      prefix: { default: "" },
      suffix: { default: "" },
    },
  } as const,
  {
    render: (props) => (
      <CitationInlineView
        editor={props.editor}
        citationIds={props.inlineContent.props.citationIds}
        nodeId={props.inlineContent.props.nodeId}
      />
    ),
  },
);

/**
 * Block `bibliography` — daftar pustaka used-in-document, render reaktif dari store (live;
 * tak menyimpan teks di blocksJson agar ganti style/hapus sitasi selalu konsisten). `content:
 * "none"` → non-editable.
 */
export const bibliographyBlockSpec = createReactBlockSpec(
  {
    type: "bibliography",
    content: "none",
    propSchema: {},
  },
  {
    render: (props) => <BibliographyBlockView editor={props.editor} />,
  },
);

/** Schema editor Aqsha = default BlockNote + inline `citation` + block `bibliography`. */
export const aqshaBlockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    bibliography: bibliographyBlockSpec(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    citation: citationInlineSpec,
  },
});

export type AqshaBlockNoteSchema = typeof aqshaBlockNoteSchema;
export type AqshaEditor = AqshaBlockNoteSchema["BlockNoteEditor"];
export type AqshaPartialBlock = AqshaBlockNoteSchema["PartialBlock"];

/**
 * Ekstrak cluster sitasi dari `editor.document` (urutan dokumen, depth-first). Bentuk hasil =
 * kontrak endpoint render dokumen. Locator/affix hanya diambil bila terisi (sitasi tunggal).
 */
export function extractDocumentClusters(blocks: unknown): DocumentCitationCluster[] {
  const out: DocumentCitationCluster[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const block of nodes) {
      const content = (block as { content?: unknown })?.content;
      if (Array.isArray(content)) {
        for (const inline of content as Array<{ type?: string; props?: Record<string, unknown> }>) {
          if (inline?.type === "citation" && inline.props) {
            const ids = parseIds(inline.props.citationIds);
            if (ids.length === 0) continue;
            const props = inline.props;
            const str = (key: string) =>
              typeof props[key] === "string" && (props[key] as string).trim()
                ? (props[key] as string).trim()
                : undefined;
            out.push({
              nodeId: str("nodeId") ?? "",
              citationIds: ids,
              ...(str("locator") ? { locator: str("locator") } : {}),
              ...(str("label") ? { label: str("label") } : {}),
              ...(str("prefix") ? { prefix: str("prefix") } : {}),
              ...(str("suffix") ? { suffix: str("suffix") } : {}),
            });
          }
        }
      }
      const children = (block as { children?: unknown })?.children;
      if (Array.isArray(children)) walk(children);
    }
  };
  walk(blocks);
  return out;
}
