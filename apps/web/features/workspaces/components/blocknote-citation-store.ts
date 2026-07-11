/**
 * Store render sitasi eksternal (Fase 3) — jembatan antara controller (yang memanggil
 * endpoint render dokumen via React Query) dan komponen render node BlockNote (inline
 * `citation` + block `bibliography`). DILEKATKAN ke instance editor (bukan React context)
 * supaya andal menembus portal node-view BlockNote: komponen render membaca `props.editor`
 * → `getCitationStore(editor)` → `useSyncExternalStore`. Nilai berubah sering (tiap render
 * dokumen), jadi context akan memicu re-render berlebih; store eksternal lebih tepat.
 */
export type CitationRenderSnapshot = {
  /** nodeId inline citation → marker in-text terformat (mis. "(Smith, 2020)" / "[1]"). */
  textByNode: Record<string, string>;
  /** Bibliography used-in-document, terurut per style; keyed citation id. */
  bibliography: Array<{ id: string; text: string }>;
  /** citationId yang direferensikan dokumen tapi sudah dihapus/tak ada. */
  missingIds: string[];
  styleId: string | null;
  isLoading: boolean;
};

export const EMPTY_CITATION_SNAPSHOT: CitationRenderSnapshot = {
  textByNode: {},
  bibliography: [],
  missingIds: [],
  styleId: null,
  isLoading: false,
};

export type CitationRenderStore = {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => CitationRenderSnapshot;
  set: (snapshot: CitationRenderSnapshot) => void;
};

export function createCitationRenderStore(): CitationRenderStore {
  let snapshot = EMPTY_CITATION_SNAPSHOT;
  const listeners = new Set<() => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    set(next) {
      snapshot = next;
      for (const cb of listeners) cb();
    },
  };
}

const STORE_KEY = Symbol.for("aqsha.citationRenderStore");

export function attachCitationStore(editor: object, store: CitationRenderStore): void {
  (editor as Record<symbol, unknown>)[STORE_KEY] = store;
}

export function getCitationStore(editor: object | null | undefined): CitationRenderStore | null {
  if (!editor) return null;
  return ((editor as Record<symbol, unknown>)[STORE_KEY] as CitationRenderStore) ?? null;
}
