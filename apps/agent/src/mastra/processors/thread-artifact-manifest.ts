import { ArtifactService } from "@aqsha/services/artifact";
import type { ProcessInputArgs } from "@mastra/core/processors";
import { getServiceDb } from "../lib/db";
import { resolveOwnerThread } from "../lib/owner-thread";

/** Maks artifact yang di-list di manifest (lampiran percakapan jarang banyak; jaga agar reminder ringkas). */
const MANIFEST_LIMIT = 50;

/**
 * Manifest lampiran thread (B3 — anti-"linglung").
 *
 * Konteks `@mention`/lampiran yang dikirim composer bersifat EPHEMERAL (`ifIdle.streamOptions.context`,
 * tak dipersist ke memory) → di giliran berikutnya agent "lupa" file mana yang menempel pada
 * percakapan dan bisa salah menjawab "silakan unggah dulu". Processor input ini menyuntik
 * `<system-reminder>` DURABLE per-turn yang me-list artifact aktif thread (judul + artifactId +
 * status indexing) langsung dari `artifacts` (SoT), bukan dari note ephemeral. Dengan begitu agent
 * SELALU tahu dokumen apa yang tersedia dan diarahkan membacanya (`search_thread_documents` /
 * `get_render_payload`) alih-alih meminta unggah ulang.
 *
 * Tidak mempersist apa pun (reminder hanya hidup untuk turn ini, di-regenerate tiap giliran).
 * Best-effort: kegagalan query tak boleh meracuni turn (return messages apa adanya).
 */
export const threadArtifactManifestProcessor = {
  id: "thread-artifact-manifest" as const,
  async processInput({ requestContext, messages, systemMessages }: ProcessInputArgs) {
    const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
    if (!ownerUserId || !threadId) return messages;
    try {
      const items = await ArtifactService.listByThread(
        getServiceDb(),
        ownerUserId,
        threadId,
        MANIFEST_LIMIT,
      );
      if (items.length === 0) return messages;
      const reminder = buildManifestReminder(items);
      systemMessages.push({ role: "system", content: reminder });
      return { messages, systemMessages };
    } catch (err) {
      console.error("[thread-artifact-manifest] failed", err);
      return messages;
    }
  },
};

type ManifestItem = {
  _id: string;
  title: string;
  artifactType: string;
  indexingStatus: string;
};

function buildManifestReminder(items: readonly ManifestItem[]): string {
  const lines = items.map(
    (a) => `- "${a.title}" (artifactId: ${a._id}, jenis: ${a.artifactType}, indexing: ${a.indexingStatus})`,
  );
  return [
    "<system-reminder>",
    "Dokumen/artefak berikut SUDAH terlampir pada percakapan ini (sumber milik pengguna, tepercaya):",
    ...lines,
    "",
    "Saat pengguna menyinggung salah satu dokumen di atas, JANGAN minta ia mengunggah ulang — file-nya sudah ada. Baca isinya lebih dulu: panggil `search_thread_documents` untuk cuplikan relevan, atau `get_render_payload` dengan `artifactId` untuk isi penuh. Bila `search_thread_documents` mengembalikan kosong padahal dokumennya ada di daftar ini, pakai `get_render_payload`. Status `pending` = masih di-index (cuplikan mungkin belum tersedia, isi penuh tetap bisa dibaca via `get_render_payload`); `failed` = ekstraksi gagal (beri tahu pengguna dengan jujur).",
    "</system-reminder>",
  ].join("\n");
}
