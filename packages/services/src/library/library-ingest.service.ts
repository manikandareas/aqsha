import { ARTIFACT_QUEUES, enqueue, removeJob } from "../clients/queue";

export type LibraryIngestJob = { ownerUserId: string; citationId: string };

/** jobId stabil supaya enqueue ganda atas item yang sama tidak menggandakan kerja. */
function jobIdFor(citationId: string): string {
  return `${ARTIFACT_QUEUES.libraryIngest}:${citationId}`;
}

export const LibraryIngestService = {
  /**
   * Gerbang tunggal post-processing perpustakaan. Dipanggil tepat sesudah item
   * dibuat, dari jalur mana pun. Satu job per item — satu DOI busuk tidak boleh
   * menjatuhkan sisa batch import.
   */
  async enqueue(input: { ownerUserId: string; citationIds: string[] }): Promise<void> {
    for (const citationId of input.citationIds) {
      const jobId = jobIdFor(citationId);
      // BullMQ menahan job selesai/gagal (removeOnComplete/Fail), dan `add` dengan
      // jobId yang masih tertahan adalah no-op senyap — buang dulu agar re-ingest jalan.
      await removeJob(ARTIFACT_QUEUES.libraryIngest, jobId).catch(() => {});
      await enqueue(
        ARTIFACT_QUEUES.libraryIngest,
        { ownerUserId: input.ownerUserId, citationId } satisfies LibraryIngestJob,
        { jobId },
      );
    }
  },
};
