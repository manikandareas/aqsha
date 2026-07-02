"use client";

/**
 * Bus event ringan yang menjembatani panel chat Astra → AI editor dokumen terbuka (Fase 3.5).
 *
 * Saat agent memanggil tool `request_document_edit`, hasilnya tiba di stream chat dan
 * `use-mastra-agent` mem-`publish` sinyal ke bus ini. Editor BlockNote yang sedang terbuka
 * (`blocknote-document-editor`) ber-`subscribe`; bila `artifactId`-nya cocok, ia memanggil
 * `invokeAI` → engine xl-ai berjalan lewat route Astra dan menampilkan diff (Accept/Reject).
 *
 * Pakai bus singkat (bukan prop-threading) supaya tak menyentuh composer/chat panel yang dipakai
 * bersama: chat hook hanya `publish` (satu import), editor hanya `subscribe`. Kedua sisi hidup di
 * satu React tree (reader artifact), jadi event sinkron dalam satu proses cukup.
 */

export type DocumentEditRequest = { artifactId: string; instruction: string };

type Listener = (request: DocumentEditRequest) => void;

const listeners = new Set<Listener>();

export const documentEditBus = {
  /**
   * Pancarkan permintaan edit ke semua editor terbuka yang men-subscribe. Tiap listener dikurung
   * try/catch: `publish` dipanggil dari `onChunk` (reducer stream chat), jadi throw dari satu editor
   * (mis. `openAIMenuAtBlock` saat tak ada anchor) TIDAK boleh naik dan mematahkan timeline chat.
   */
  publish(request: DocumentEditRequest): void {
    for (const listener of listeners) {
      try {
        listener(request);
      } catch (err) {
        console.error("[document-edit-bus] listener gagal", err);
      }
    }
  },
  /** Daftarkan editor; return unsubscribe (panggil saat unmount). */
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
