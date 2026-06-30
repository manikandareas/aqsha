"use client";

import { type BlockNoteEditor, filterSuggestionItems, type PartialBlock } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  SuggestionMenuController,
  useComponentsContext,
  useCreateBlockNote,
  useEditorChange,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  AIExtension,
  AIMenuController,
  AIToolbarButton,
  getAISlashMenuItems,
} from "@blocknote/xl-ai";
import { en as aiEn } from "@blocknote/xl-ai/locales";
import "@blocknote/xl-ai/style.css";
import { SparklesIcon } from "@aqsha/ui/icons";
import { useAuth } from "@clerk/nextjs";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { documentEditBus } from "@/lib/document-edit-bus";
import { blockNotePlainText, parseBlockNoteJson } from "../utils/artifact-editor-model";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type DocumentEditorContent = {
  blocksJson: string;
  markdown: string;
  plainText: string;
};

/** Pilihan blok yang dilaporkan tombol "Tanya Astra" (Formatting Toolbar) ke pemanggil. */
export type EditorSelection = { blockIds: string[]; excerpt: string };

/** State engine AI native (subset `AIPluginState`) yang relevan untuk pause-autosave. */
const AI_BUSY_STATUSES = new Set(["thinking", "ai-writing", "user-reviewing"]);

export function BlockNoteDocumentEditor({
  artifactId,
  initialBlocksJson,
  initialMarkdown = "",
  onContentChange,
  onAskAstraAboutSelection,
}: {
  /** Artifact yang sedang diedit — dikirim ke route AI (`body.artifactId`) untuk ownership + billing. */
  artifactId: string;
  initialBlocksJson: string;
  initialMarkdown?: string;
  onContentChange: (content: DocumentEditorContent) => void;
  /** Saat di-set, Formatting Toolbar memuat tombol "Tanya Astra" yang menyemat pilihan blok ke chat. */
  onAskAstraAboutSelection?: (selection: EditorSelection) => void;
}) {
  const [initialContent] = useState(
    () => parseBlockNoteJson(initialBlocksJson) as PartialBlock[],
  );
  const [initialMarkdownSnapshot] = useState(initialMarkdown);

  const { getToken } = useAuth();
  // `getToken` (Clerk) BUKAN referensi yang dijamin stabil antar-render. Dibaca lewat ref saat
  // request supaya `transport` tak ikut berubah → editor TAK di-recreate (yang akan membuang
  // kursor/undo/diff yang sedang ditinjau) hanya karena identitas `getToken` berganti.
  const getTokenRef = useRef(getToken);

  // Transport AI SDK → route Astra `/blocknote-ai/chat`. Auth Clerk disuntik per-request (Bearer),
  // `artifactId` ikut body tiap request (ownership + billing + konteks). Stabil per-artifact →
  // editor dibuat sekali. Cast `as ChatTransport` (ai@7-beta web ↔ ai@6 xl-ai) = skew tipe sengaja,
  // runtime fetch/SSE kompatibel (lihat docs §7 temuan PoC #2).
  const transport = useMemo(() => {
    const authedFetch: typeof fetch = async (input, init) => {
      const token = await getTokenRef.current();
      const headers = new Headers(init?.headers);
      if (token) headers.set("authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers });
    };
    return new DefaultChatTransport({
      api: `${API_BASE}/blocknote-ai/chat`,
      body: { artifactId },
      fetch: authedFetch,
    });
  }, [artifactId]);

  const editor = useCreateBlockNote(
    {
      dictionary: { ...en, ai: aiEn },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extensions: [AIExtension({ transport: transport as any, agentCursor: { name: "Astra", color: "#7c5cff" } })],
      ...(initialContent.length > 0 ? { initialContent } : {}),
    },
    [transport],
  );

  const hydratedFromMarkdown = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Hydrasi awal dari markdown bila tak ada blocksJson (port path lama; jalan sekali).
  useEffect(() => {
    if (
      hydratedFromMarkdown.current ||
      initialContent.length > 0 ||
      !initialMarkdownSnapshot.trim()
    ) {
      return;
    }
    hydratedFromMarkdown.current = true;
    const hydrate = async () => {
      const blocks = await Promise.resolve(
        editor.tryParseMarkdownToBlocks(initialMarkdownSnapshot),
      );
      if (blocks.length === 0) {
        return;
      }
      editor.replaceBlocks(editor.document, blocks);
      emitContent();
    };
    void hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, initialContent.length, initialMarkdownSnapshot]);

  function emitContent() {
    const document = editor.document;
    onContentChange({
      blocksJson: JSON.stringify(document),
      markdown: editor.blocksToMarkdownLossy(document),
      plainText: blockNotePlainText(
        document as unknown as Parameters<typeof blockNotePlainText>[0],
      ),
    });
  }

  /**
   * Jalankan edit Astra secara programatik (dari panel/agent) DENGAN UI review native.
   *
   * WAJIB `openAIMenuAtBlock` dulu: `invokeAI` memanggil `setAIResponseStatus("thinking")` yang
   * NO-OP saat `aiMenuState === "closed"`, jadi tanpa membuka menu di sebuah blok, diff + tombol
   * Accept/Reject tak pernah dirender (tombol AI native pun `openAIMenuAtBlock` lebih dulu). Anchor =
   * blok terakhir terpilih (bila pakai selection) atau blok kursor (fallback blok pertama dokumen).
   */
  function triggerAstraEdit(userPrompt: string, useSelection: boolean): Promise<void> | undefined {
    const ai = editor.getExtension(AIExtension);
    if (!ai) return;
    editor.focus();
    const selectionBlocks = editor.getSelection()?.blocks ?? [];
    const anchorId =
      useSelection && selectionBlocks.length > 0
        ? selectionBlocks[selectionBlocks.length - 1]!.id
        : (editor.getTextCursorPosition().block?.id ?? editor.document[0]?.id ?? null);
    if (!anchorId) return;
    ai.openAIMenuAtBlock(anchorId);
    return ai.invokeAI({ userPrompt, useSelection });
  }

  // Pause autosave saat engine AI menulis/menunggu review: konten diff-belum-Accept TIDAK boleh
  // ter-persist (korupsi dokumen). Emit final ditangani efek "flush saat menu AI menutup" di bawah —
  // BUKAN oleh useEditorChange ini (lihat GOTCHA di komentar efek tersebut).
  useEditorChange(() => {
    const ai = editor.getExtension(AIExtension);
    const aiState = ai?.store.state.aiMenuState;
    if (aiState && aiState !== "closed" && AI_BUSY_STATUSES.has(aiState.status)) {
      return;
    }
    emitContent();
  }, editor);

  // Snapshot terbaru untuk pemanggil imperatif (subscription store AI di bawah) tanpa stale closure.
  const emitContentRef = useRef(emitContent);
  useEffect(() => {
    emitContentRef.current = emitContent;
    getTokenRef.current = getToken;
  });

  // Flush autosave saat menu AI MENUTUP (Accept/Reject). GOTCHA: xl-ai meng-commit hasil edit
  // (`merge`) SAAT status masih "user-reviewing", lalu `closeAIMenu` hanya men-set status "closed"
  // TANPA mutasi dokumen lagi — jadi useEditorChange di atas men-skip emit final itu (pause). Tanpa
  // flush ini, edit yang DI-ACCEPT tak pernah ter-serialize → HILANG saat reload. Reject → konten
  // kembali == lastSaved → reducer autosave men-dedupe jadi no-op (lihat `autosaveReducer`).
  useEffect(() => {
    const ai = editor.getExtension(AIExtension);
    if (!ai) return;
    let prev = ai.store.state.aiMenuState;
    return ai.store.subscribe(() => {
      const next = ai.store.state.aiMenuState;
      if (prev !== "closed" && next === "closed") emitContentRef.current();
      prev = next;
    });
  }, [editor]);

  // Bridge agent-driven (Fase 3.5): sinyal `request_document_edit` dari panel chat → AI editor.
  // Subscribe bus; saat artifactId cocok dengan dokumen ini, jalankan `invokeAI` (tanpa selection
  // — instruksi agen sudah menyebut target). Editor lain (artifactId beda) mengabaikan event.
  useEffect(() => {
    return documentEditBus.subscribe((request) => {
      if (request.artifactId !== artifactId) return;
      void triggerAstraEdit(request.instruction, false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, artifactId]);

  return (
    <div ref={wrapperRef} className="relative min-h-[60svh] px-1 py-3">
      <BlockNoteView
        editor={editor}
        className="aqsha-blocknote"
        formattingToolbar={false}
        slashMenu={false}
      >
        {/* Menu AI native (diff + Accept/Reject lewat state user-reviewing). */}
        <AIMenuController />

        {/* Formatting toolbar: item bawaan + "Tanya Astra" (chat tentang bagian) + tombol AI native (edit). */}
        <FormattingToolbarController
          formattingToolbar={() => (
            <FormattingToolbar>
              {getFormattingToolbarItems()}
              {onAskAstraAboutSelection ? (
                <AskAstraToolbarButton editor={editor} onAsk={onAskAstraAboutSelection} />
              ) : null}
              <AIToolbarButton />
            </FormattingToolbar>
          )}
        />

        {/* Slash menu: item default + item AI native (`/ai`, ringkas, perbaiki tulisan, dst.). */}
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [...getDefaultReactSlashMenuItems(editor), ...getAISlashMenuItems(editor)],
              query,
            )
          }
        />
      </BlockNoteView>
    </div>
  );
}

/**
 * Tombol "Tanya Astra" di Formatting Toolbar (mode TANYA — baca, lewat chat). Klik → baca pilihan
 * editor (blok + teks) lalu laporkan ke pemanggil yang menyematkannya sebagai context token di
 * composer chat. Untuk MENGEDIT bagian terpilih, pakai tombol AI native di sebelahnya (engine xl-ai
 * → diff Accept/Reject). Fallback ke blok kursor bila pilihan kosong (mis. caret tanpa range).
 */
function AskAstraToolbarButton({
  editor,
  onAsk,
}: {
  editor: BlockNoteEditor;
  onAsk: (selection: EditorSelection) => void;
}) {
  const Components = useComponentsContext();
  if (!Components) return null;
  return (
    <Components.FormattingToolbar.Button
      className="aqsha-blocknote-ask-astra"
      mainTooltip="Tanya Astra tentang bagian ini"
      label="Tanya Astra"
      icon={<SparklesIcon className="size-3.5" />}
      onClick={() => {
        const selectionBlocks = editor.getSelection()?.blocks ?? [];
        const cursorBlock = editor.getTextCursorPosition().block;
        const blockIds =
          selectionBlocks.length > 0
            ? selectionBlocks.map((block) => block.id)
            : cursorBlock
              ? [cursorBlock.id]
              : [];
        if (blockIds.length === 0) return;
        onAsk({ blockIds, excerpt: editor.getSelectedText() });
      }}
    >
      Tanya Astra
    </Components.FormattingToolbar.Button>
  );
}
