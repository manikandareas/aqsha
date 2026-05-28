"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircle2Icon,
  Loader2Icon,
  RotateCcwIcon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@aqsha/ui/components/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@aqsha/convex/artifact-upload-limits";
import {
  MAX_WORKSPACE_UPLOAD_FILES,
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
  type WorkspaceUploadStatus,
} from "../utils/workspace-file-upload";

type UploadFiles = (
  files: File[],
  folderId: "root" | string,
  options?: {
    onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
  },
) => Promise<WorkspaceUploadResult[]>;

type UploadQueueItem = {
  id: string;
  file: File;
  folderId: "root" | string;
  status: WorkspaceUploadStatus;
  progress: number;
  error?: string;
};

const toastId = "workspace-upload-queue";
const completeDismissDelayMs = 5000;

export function useWorkspaceUploadToast({
  onUploadFiles,
}: {
  onUploadFiles: UploadFiles;
}) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const [isUploadActive, setIsUploadActive] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const activeRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    setItems([]);
    setIsUploadActive(false);
    setIsCollapsed(false);
    activeRef.current = false;
    toast.dismiss(toastId);
  }, [clearDismissTimer]);

  const updateItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const runUpload = useCallback(
    async (queueItems: UploadQueueItem[]) => {
      if (queueItems.length === 0) return;

      activeRef.current = true;
      setIsUploadActive(true);
      clearDismissTimer();

      const ids = queueItems.map((item) => item.id);
      await onUploadFiles(
        queueItems.map((item) => item.file),
        queueItems[0]?.folderId ?? "root",
        {
          onFileChange: (event) => {
            const id = ids[event.index];
            if (!id) return;
            updateItem(id, {
              status: event.status,
              progress: event.progress,
              error: event.error,
            });
          },
        },
      );

      activeRef.current = false;
      setIsUploadActive(false);
    },
    [clearDismissTimer, onUploadFiles, updateItem],
  );

  const enqueue = useCallback(
    (files: File[], folderId: "root" | string) => {
      if (files.length === 0) return;
      if (activeRef.current) {
        toast.error("Tunggu upload berjalan selesai sebelum menambahkan file lagi.");
        return;
      }
      if (files.length > MAX_WORKSPACE_UPLOAD_FILES) {
        toast.error(`Maksimal ${MAX_WORKSPACE_UPLOAD_FILES} file dalam satu upload.`);
        return;
      }

      const queueItems = files.map<UploadQueueItem>((file) => {
        const isOversized = file.size > MAX_UPLOAD_BYTES;
        return {
          id: createUploadItemId(),
          file,
          folderId,
          status: isOversized ? "failed" : "queued",
          progress: 0,
          error: isOversized
            ? `${file.name} melebihi batas ${MAX_UPLOAD_MB} MB.`
            : undefined,
        };
      });
      setItems(queueItems);
      setIsCollapsed(false);

      const uploadable = queueItems.filter((item) => item.status !== "failed");
      void runUpload(uploadable);
    },
    [runUpload],
  );

  const retryFailed = useCallback(() => {
    if (activeRef.current) return;
    const failed = items.filter(
      (item) => item.status === "failed" && item.file.size <= MAX_UPLOAD_BYTES,
    );
    if (failed.length === 0) return;

    setItems((current) =>
      current.map((item) =>
        item.status === "failed" && item.file.size <= MAX_UPLOAD_BYTES
          ? { ...item, status: "queued", progress: 0, error: undefined }
          : item,
      ),
    );
    void runUpload(
      failed.map((item) => ({
        ...item,
        status: "queued",
        progress: 0,
        error: undefined,
      })),
    );
  }, [items, runUpload]);

  const hasItems = items.length > 0;
  const hasFailed = items.some((item) => item.status === "failed");
  const allComplete = hasItems && items.every((item) => item.status === "complete");

  useEffect(() => {
    if (!hasItems) return;

    toast.custom(
      () => (
        <WorkspaceUploadToast
          items={items}
          isUploadActive={isUploadActive}
          isCollapsed={isCollapsed}
          onDismiss={dismiss}
          onToggleCollapsed={() => setIsCollapsed((collapsed) => !collapsed)}
          onRetryFailed={retryFailed}
        />
      ),
      {
        id: toastId,
        className: "!w-auto !border-0 !bg-transparent !p-0 !shadow-none !ring-0",
        closeButton: false,
        duration: Infinity,
        dismissible: false,
      },
    );
  }, [dismiss, hasItems, isCollapsed, isUploadActive, items, retryFailed]);

  useEffect(() => {
    clearDismissTimer();
    if (!allComplete || hasFailed) return;

    dismissTimerRef.current = setTimeout(dismiss, completeDismissDelayMs);
    return clearDismissTimer;
  }, [allComplete, clearDismissTimer, dismiss, hasFailed]);

  return {
    enqueue,
    isUploadActive,
  };
}

function WorkspaceUploadToast({
  items,
  isUploadActive,
  isCollapsed,
  onDismiss,
  onToggleCollapsed,
  onRetryFailed,
}: {
  items: UploadQueueItem[];
  isUploadActive: boolean;
  isCollapsed: boolean;
  onDismiss: () => void;
  onToggleCollapsed: () => void;
  onRetryFailed: () => void;
}) {
  const summary = useMemo(() => getUploadSummary(items), [items]);
  const failedCount = items.filter((item) => item.status === "failed").length;
  const retryableCount = items.filter(
    (item) => item.status === "failed" && item.file.size <= MAX_UPLOAD_BYTES,
  ).length;
  const canRetry = retryableCount > 0 && !isUploadActive;

  return (
    <section className="w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] border border-border bg-card text-card-foreground shadow-aqsha sm:w-[380px]">
      <header className="flex items-start gap-2 border-b border-border/70 px-3.5 py-3">
        <button
          aria-expanded={!isCollapsed}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40"
          onClick={onToggleCollapsed}
          type="button"
        >
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UploadCloudIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[13px] font-semibold leading-5">
              {summary.title}
            </h2>
            <p className="truncate text-[11px] leading-4 text-muted-foreground">
              {summary.description}
            </p>
          </div>
          <div className="mt-1 flex size-5 shrink-0 items-center justify-center text-muted-foreground">
            {isCollapsed ? (
              <ChevronUpIcon className="size-3.5" />
            ) : (
              <ChevronDownIcon className="size-3.5" />
            )}
          </div>
        </button>
        <Button
          aria-label="Tutup status upload"
          className="-mr-1 -mt-1"
          onClick={onDismiss}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <XIcon className="size-3.5" />
        </Button>
      </header>

      {isCollapsed ? (
        <div className="px-3.5 pb-3 pt-2">
          <Progress className="h-1.5 bg-muted" value={summary.progress} />
        </div>
      ) : (
        <>
          <div className="max-h-72 overflow-y-auto px-2 py-2">
            {items.map((item) => (
              <UploadQueueRow key={item.id} item={item} />
            ))}
          </div>

          {canRetry ? (
            <footer className="flex items-center justify-between border-t border-border/70 px-3.5 py-2.5">
              <span className="text-[11px] font-medium text-coral-foreground">
                {failedCount} file perlu dicoba lagi
              </span>
              <Button
                className="h-7 gap-1.5 text-[12px]"
                onClick={onRetryFailed}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCcwIcon className="size-3.5" />
                Coba lagi
              </Button>
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}

function UploadQueueRow({ item }: { item: UploadQueueItem }) {
  const isInProgress =
    item.status === "queued" ||
    item.status === "uploading" ||
    item.status === "processing";
  const statusText = getStatusText(item);

  return (
    <div className="grid gap-1.5 rounded-lg px-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <StatusIcon status={item.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-4">
            {item.file.name}
          </div>
          <div
            className={cn(
              "truncate text-[11px] leading-4 text-muted-foreground",
              item.status === "failed" && "text-coral-foreground",
            )}
          >
            {statusText}
          </div>
        </div>
        {item.status === "uploading" ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {item.progress}%
          </span>
        ) : null}
      </div>
      {isInProgress ? (
        <Progress
          className="h-1.5 bg-muted"
          value={item.status === "queued" ? 0 : item.progress}
        />
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: WorkspaceUploadStatus }) {
  if (status === "complete") {
    return <CheckCircle2Icon className="size-4 shrink-0 text-mint-foreground" />;
  }
  if (status === "failed") {
    return <AlertCircleIcon className="size-4 shrink-0 text-coral-foreground" />;
  }
  if (status === "processing") {
    return <Loader2Icon className="size-4 shrink-0 animate-spin text-sky-foreground" />;
  }
  if (status === "uploading") {
    return <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" />;
  }
  return <UploadCloudIcon className="size-4 shrink-0 text-muted-foreground" />;
}

function getStatusText(item: UploadQueueItem) {
  if (item.status === "queued") return "Menunggu giliran";
  if (item.status === "uploading") return "Mengirim file";
  if (item.status === "processing") return "Menyimpan ke workspace";
  if (item.status === "complete") return "Tersimpan";
  return item.error ?? "Upload gagal";
}

function getUploadSummary(items: UploadQueueItem[]) {
  const total = items.length;
  const complete = items.filter((item) => item.status === "complete").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const active = items.filter(
    (item) =>
      item.status === "queued" ||
      item.status === "uploading" ||
      item.status === "processing",
  ).length;
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

function createUploadItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
