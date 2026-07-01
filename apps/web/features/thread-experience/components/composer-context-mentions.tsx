"use client";

import {
  buildPaperMentionLabel,
  type ContextRef,
  contextRefKey,
  contextRefsSignature,
  MAX_CONTEXT_PAPERS,
} from "@aqsha/chat-core";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Token konteks ambient halaman (workspace/artifact/paper/berita) — disuntik composer otomatis.
 * Default `[]` → aman dibaca surface chat di halaman tanpa provider (mis. /app, /app/threads). */
const EMPTY_AMBIENT_REFS: ContextRef[] = [];

type AmbientContextRefsValue = {
  ambientContextRefs: ContextRef[];
  /** Override imperatif (mis. "Tanya Astra" di kartu feed → ganti token ke item itu). */
  setAmbientContextRefs: (refs: ContextRef[]) => void;
  /** Naik tiap kali token ambient DI-SET (klik "Tanya Astra" / sinkron prop halaman), termasuk saat
   * isinya sama. Composer me-merge berdasar epoch (bukan signature) supaya klik-ulang item yang sama
   * setelah user menghapus pill-nya tetap menyisipkan ulang — signature tak berubah, epoch berubah. */
  ambientEpoch: number;
};
const AmbientContextRefsContext = createContext<AmbientContextRefsValue>({
  ambientContextRefs: EMPTY_AMBIENT_REFS,
  setAmbientContextRefs: () => {},
  ambientEpoch: 0,
});

/** Pilihan item library ("klik 1× = jadikan konteks") — disematkan composer sebagai pill `@paper`.
 * Terpisah dari ambient (token halaman/`Tanya Astra` yang replace-on-nav): selection bersifat
 * multi-toggle & dikurasi user, sinkron DUA ARAH dengan pill composer (hapus pill → deselect kartu). */
const EMPTY_SELECTION_REFS: ContextRef[] = [];

type SelectionContextValue = {
  /** Ref `paper` untuk tiap kartu library yang terpilih (satu sumber kebenaran highlight kartu + pill). */
  selectionRefs: ContextRef[];
  /** Naik tiap selection berubah → composer me-merge (inject/remove pill) berdasar epoch ini. */
  selectionEpoch: number;
  addSelectionRef: (ref: ContextRef) => void;
  removeSelectionArtifact: (artifactId: string) => void;
  replaceSelectionRefs: (refs: ContextRef[]) => void;
  clearSelectionRefs: () => void;
};
const SelectionContext = createContext<SelectionContextValue>({
  selectionRefs: EMPTY_SELECTION_REFS,
  selectionEpoch: 0,
  addSelectionRef: () => {},
  removeSelectionArtifact: () => {},
  replaceSelectionRefs: () => {},
  clearSelectionRefs: () => {},
});

export function ComposerMentionsProvider({
  children,
  ambientContextRefs,
}: {
  children: ReactNode;
  threadId?: string;
  ambientWorkspaceId?: string | null;
  /** Token halaman aktif untuk auto-mention di composer (lihat MastraChatThreadSurface). */
  ambientContextRefs?: ContextRef[];
}) {
  // Selection library ("klik 1× = konteks") — sumber tunggal highlight kartu + pill composer. Epoch
  // naik tiap perubahan supaya composer bisa re-merge (inject/remove) tanpa loop, dan setter no-op saat
  // isi tak berubah (mis. removeSelectionArtifact untuk id yang sudah tak terpilih → back-prop aman).
  const [selection, setSelection] = useState<{ refs: ContextRef[]; epoch: number }>({
    refs: EMPTY_SELECTION_REFS,
    epoch: 0,
  });
  const selectionActions = useMemo(
    () => ({
      addSelectionRef: (ref: ContextRef) =>
        setSelection((current) =>
          current.refs.some((existing) => contextRefKey(existing) === contextRefKey(ref))
            ? current
            : { refs: [...current.refs, ref], epoch: current.epoch + 1 },
        ),
      removeSelectionArtifact: (artifactId: string) =>
        setSelection((current) => {
          const next = current.refs.filter(
            (ref) => !(ref.kind === "paper" && ref.artifactId === artifactId),
          );
          return next.length === current.refs.length
            ? current
            : { refs: next, epoch: current.epoch + 1 };
        }),
      replaceSelectionRefs: (refs: ContextRef[]) =>
        setSelection((current) => ({ refs, epoch: current.epoch + 1 })),
      clearSelectionRefs: () =>
        setSelection((current) =>
          current.refs.length === 0
            ? current
            : { refs: EMPTY_SELECTION_REFS, epoch: current.epoch + 1 },
        ),
    }),
    [],
  );
  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selectionRefs: selection.refs,
      selectionEpoch: selection.epoch,
      ...selectionActions,
    }),
    [selection, selectionActions],
  );

  // Token ambient = state internal supaya kartu "Tanya Astra" bisa override imperatif, TAPI
  // disinkron dari prop halaman (mis. data reader/artifact baru termuat). Pola "adjust state during
  // render" (guard signature) — bukan effect → tak memicu cascading render. `epoch` naik tiap set
  // (imperatif maupun sinkron-prop) supaya consumer bisa membedakan "di-set ulang" dari "tak berubah"
  // meski isinya identik (klik-ulang "Tanya Astra" item yang sama setelah pill dihapus).
  const propRefs = ambientContextRefs ?? EMPTY_AMBIENT_REFS;
  const propSignature = contextRefsSignature(propRefs);
  const [ambient, setAmbient] = useState<{ refs: ContextRef[]; epoch: number }>({
    refs: propRefs,
    epoch: 0,
  });
  const [seenPropSignature, setSeenPropSignature] = useState(propSignature);
  if (propSignature !== seenPropSignature) {
    setSeenPropSignature(propSignature);
    setAmbient((current) => ({ refs: propRefs, epoch: current.epoch + 1 }));
  }
  const setAmbientContextRefs = useCallback(
    (refs: ContextRef[]) => setAmbient((current) => ({ refs, epoch: current.epoch + 1 })),
    [],
  );
  const ambientValue = useMemo<AmbientContextRefsValue>(
    () => ({
      ambientContextRefs: ambient.refs,
      setAmbientContextRefs,
      ambientEpoch: ambient.epoch,
    }),
    [ambient, setAmbientContextRefs],
  );

  return (
    <SelectionContext.Provider value={selectionValue}>
      <AmbientContextRefsContext.Provider value={ambientValue}>
        {children}
      </AmbientContextRefsContext.Provider>
    </SelectionContext.Provider>
  );
}

/** Token konteks ambient halaman aktif. Aman di luar provider (kembalikan `[]`). */
export function useAmbientContextRefs(): ContextRef[] {
  return useContext(AmbientContextRefsContext).ambientContextRefs;
}

/** Setter token ambient — untuk "Tanya Astra" imperatif dari kartu feed/related. No-op tanpa provider. */
export function useSetAmbientContextRefs(): (refs: ContextRef[]) => void {
  return useContext(AmbientContextRefsContext).setAmbientContextRefs;
}

/** Epoch token ambient — naik tiap set (lihat `ambientEpoch`). Composer me-merge berdasar epoch ini. */
export function useAmbientContextEpoch(): number {
  return useContext(AmbientContextRefsContext).ambientEpoch;
}

/** Selection library (refs + epoch + aksi) untuk composer: inject pill, back-prop hapus, clear-on-send.
 * Aman di luar provider (refs `[]`, aksi no-op). */
export function useComposerSelection(): SelectionContextValue {
  return useContext(SelectionContext);
}

/** Adapter untuk board/grid library ("klik 1× = konteks"). Membangun ref `paper` dari artifactId dan
 * menyinkronkan highlight kartu dengan selection provider (yang sama disematkan composer sebagai pill). */
export function usePanelContextSelection(args: {
  workspaceId: string;
  workspaceName: string;
  titleById: Map<string, string>;
}) {
  const { selectionRefs, addSelectionRef, removeSelectionArtifact, replaceSelectionRefs } =
    useComposerSelection();
  const selectedIds = new Set(
    selectionRefs.flatMap((ref) => (ref.kind === "paper" ? [ref.artifactId] : [])),
  );
  const buildRef = (artifactId: string): ContextRef => ({
    kind: "paper",
    workspaceId: args.workspaceId,
    artifactId,
    label: buildPaperMentionLabel(args.workspaceName, args.titleById.get(artifactId) ?? "Paper"),
  });

  return {
    contextCount: selectedIds.size,
    getArtifactSelected: (artifactId: string) => selectedIds.has(artifactId),
    onToggleArtifactContext: (artifactId: string) => {
      if (selectedIds.has(artifactId)) removeSelectionArtifact(artifactId);
      // Batasi selection library ke budget paper yang sama dengan gerbang palette @-mention
      // (MAX_CONTEXT_PAPERS): di batas, klik-tambah diabaikan alih-alih menembus 8.
      else if (selectedIds.size < MAX_CONTEXT_PAPERS) addSelectionRef(buildRef(artifactId));
    },
    onSetArtifactContextSelection: (artifactIds: string[]) => {
      replaceSelectionRefs(artifactIds.slice(0, MAX_CONTEXT_PAPERS).map(buildRef));
    },
  };
}
