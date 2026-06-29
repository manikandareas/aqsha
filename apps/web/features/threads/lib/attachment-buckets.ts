import type { Artifact } from "@/features/artifacts/types";
import type { FileChipData } from "../components/file-chip";
import type { TimelineMessage } from "./timeline-types";

/** Lampiran upload yang dipetakan ke satu pesan user (dirender sebagai FileChip read-only). */
export type MessageAttachment = FileChipData;

function toAttachment(a: Artifact): MessageAttachment {
  return { id: a._id, title: a.title, mimeType: a.mimeType, indexingStatus: a.indexingStatus };
}

/**
 * Petakan lampiran upload thread → pesan user. Mastra tak menautkan artifact ke pesan tertentu
 * (lihat catatan adapter), jadi tautan dibangun di sisi-baca lewat DUA jalur:
 *
 * 1. **Eksplisit (live, eksak).** Pesan optimistik sesi ini membawa `attachmentIds` (id yang
 *    dikirim user) → dipetakan langsung dari id, TANPA menebak waktu. Ini menyingkirkan kerapuhan
 *    skew jam klien-vs-server pada tampilan live.
 * 2. **Jendela waktu (rehydrate — HEURISTIK).** Pesan hasil rehydrate tak punya `attachmentIds`;
 *    tiap upload ditempel ke pesan user yang dibuat tepat setelah ia di-finalize. Batas bawah =
 *    pesan USER sebelumnya (BUKAN pesan asisten di antaranya), jadi file yang di-stage saat asisten
 *    membalas tetap menempel ke pesan user berikutnya. Timestamp server → stabil lintas refresh,
 *    TAPI tetap tebakan: upload yatim / finalize tak urut / file di-stage-tapi-belum-kirim bisa
 *    menempel ke pesan user berikutnya. Tautan persisten artifact↔pesan akan menghapus tebakan ini
 *    (terhalang Mastra yang memiliki id pesan chat).
 *
 * Lampiran yang dicabut sebelum kirim sudah di-soft-delete (tak ada di daftar) → tak terpetakan.
 */
export function bucketMessageAttachments(
  messages: readonly TimelineMessage[],
  artifacts: readonly Artifact[] | undefined,
): Map<string, MessageAttachment[]> {
  const map = new Map<string, MessageAttachment[]>();
  if (!artifacts || artifacts.length === 0) return map;

  // Upload aktif urut waktu — dasar jalur jendela-waktu (rehydrate).
  const uploads = artifacts
    .filter((a) => a.source === "upload" && a.status !== "deleted" && a.createdAt > 0)
    .sort((x, y) => x.createdAt - y.createdAt);

  // `byId` (untuk jalur eksplisit) dibangun MALAS — hanya bila ada pesan ber-`attachmentIds`. Pada
  // rehydrate (kasus umum) tak ada, jadi map ini tak dibangun sia-sia.
  let byId: Map<string, Artifact> | null = null;
  const lookupById = (): Map<string, Artifact> => {
    if (!byId) {
      byId = new Map(artifacts.filter((a) => a.status !== "deleted").map((a) => [a._id, a]));
    }
    return byId;
  };

  // Batas bawah tiap pesan user = createdAt pesan USER sebelumnya (pesan pertama = 0). Pesan asisten
  // TIDAK menggeser batas → lampiran yang di-stage saat asisten membalas tetap milik pesan user
  // berikutnya. Pesan tanpa timestamp terbaca (upper 0) tak menggeser batas (tak bisa di-window).
  let prevUserAt = 0;
  for (const m of messages) {
    if (m.role !== "user") continue;

    // Jalur eksplisit: pesan live membawa id lampiran → petakan langsung (eksak).
    if (m.attachmentIds && m.attachmentIds.length > 0) {
      const lookup = lookupById();
      const owned = m.attachmentIds
        .map((id) => lookup.get(id))
        .filter((a): a is Artifact => Boolean(a))
        .map(toAttachment);
      if (owned.length > 0) map.set(m.id, owned);
      if (m.createdAt) prevUserAt = m.createdAt;
      continue;
    }

    const upper = m.createdAt || 0;
    if (!upper) continue;
    const lower = prevUserAt;
    prevUserAt = upper;
    if (uploads.length === 0) continue;
    const owned = uploads.filter((u) => u.createdAt > lower && u.createdAt <= upper);
    if (owned.length > 0) map.set(m.id, owned.map(toAttachment));
  }
  return map;
}
