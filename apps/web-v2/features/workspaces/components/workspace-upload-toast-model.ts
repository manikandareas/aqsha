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
  if (item.status === "queued") return "Menunggu giliran";
  if (item.status === "uploading") return "Mengirim file";
  if (item.status === "processing") return "Menyimpan ke workspace";
  if (item.status === "complete") return "Tersimpan";
  return item.error ?? "Upload gagal";
}

export function getUploadSummary(items: UploadQueueItem[]) {
  const total = items.length;
  let complete = 0;
  let failed = 0;
  let active = 0;

  for (const item of items) {
    if (item.status === "complete") {
      complete += 1;
    } else if (item.status === "failed") {
      failed += 1;
    } else {
      active += 1;
    }
  }

  const progress = total === 0 ? 0 : Math.round((complete / total) * 100);

  if (failed > 0 && active === 0) {
    return {
      title: `${failed} file belum tersimpan`,
      description: `${complete} dari ${total} file berhasil masuk workspace.`,
      progress,
    };
  }
  if (complete === total) {
    return {
      title: `${total} file sudah tersimpan`,
      description: "Semua dokumen sudah masuk ke workspace.",
      progress: 100,
    };
  }
  return {
    title: `Menyimpan ${total} file ke workspace`,
    description:
      complete > 0
        ? `${complete} file selesai, ${active} masih berjalan.`
        : `${active} file sedang diproses.`,
    progress,
  };
}

export function isRetryableUploadItem(item: UploadQueueItem) {
  return item.status === "failed" && item.file.size <= MAX_UPLOAD_BYTES;
}
