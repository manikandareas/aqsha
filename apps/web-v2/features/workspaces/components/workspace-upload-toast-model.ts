import { MAX_UPLOAD_BYTES } from "@/lib/artifact-upload-limits";
import type { WorkspaceUploadStatus } from "../utils/workspace-file-upload";

export type UploadQueueItem = {
  id: string;
  file: File;
  folderId: "root" | string;
  status: WorkspaceUploadStatus;
  progress: number;
  error?: string;
};

export function getStatusText(item: UploadQueueItem) {
  if (item.status === "queued") return "Menunggu";
  if (item.status === "uploading") return "Mengunggah";
  if (item.status === "processing") return "Memproses";
  if (item.status === "complete") return "Selesai";
  return item.error ?? "Gagal";
}

/**
 * Ringkasan untuk header toast: `tone` memilih ikon/aksen, `completeCount/total`
 * jadi chip angka, `progress` mengisi bar agregat. Sengaja tanpa kalimat panjang —
 * angka + bar sudah cukup.
 */
export function getUploadSummary(items: UploadQueueItem[]) {
  const total = items.length;
  let complete = 0;
  let failed = 0;
  let active = 0;

  for (const item of items) {
    if (item.status === "complete") complete += 1;
    else if (item.status === "failed") failed += 1;
    else active += 1;
  }

  const progress = total === 0 ? 0 : Math.round((complete / total) * 100);

  if (active === 0 && failed > 0) {
    return {
      tone: "failed" as WorkspaceUploadStatus,
      title: `${failed} dari ${total} file gagal`,
      completeCount: complete,
      failedCount: failed,
      total,
      progress,
    };
  }
  if (total > 0 && complete === total) {
    return {
      tone: "complete" as WorkspaceUploadStatus,
      title: `${total} file tersimpan`,
      completeCount: complete,
      failedCount: failed,
      total,
      progress: 100,
    };
  }
  return {
    tone: "processing" as WorkspaceUploadStatus,
    title: `Memproses ${total} file`,
    completeCount: complete,
    failedCount: failed,
    total,
    progress,
  };
}

export function isRetryableUploadItem(item: UploadQueueItem) {
  return item.status === "failed" && item.file.size <= MAX_UPLOAD_BYTES;
}
