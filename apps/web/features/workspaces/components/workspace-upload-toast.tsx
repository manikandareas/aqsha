"use client";

import { useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from "@aqsha/convex/artifact-upload-limits";
import {
  MAX_WORKSPACE_UPLOAD_FILES,
  type WorkspaceUploadProgressEvent,
  type WorkspaceUploadResult,
} from "../utils/workspace-file-upload";
import {
  isRetryableUploadItem,
  type UploadQueueItem,
} from "./workspace-upload-toast-model";
import { WorkspaceUploadToast } from "./workspace-upload-toast-view";

type UploadFiles = (
  files: File[],
  folderId: "root" | string,
  options?: {
    onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
  },
) => Promise<WorkspaceUploadResult[]>;

const toastId = "workspace-upload-queue";
const completeDismissDelayMs = 5000;

type UploadToastState = {
  items: UploadQueueItem[];
  isUploadActive: boolean;
  isCollapsed: boolean;
};

type UploadToastAction =
  | { type: "enqueue"; items: UploadQueueItem[] }
  | { type: "reset" }
  | { type: "set-collapsed"; value: boolean }
  | { type: "set-upload-active"; value: boolean }
  | { type: "update-item"; id: string; patch: Partial<UploadQueueItem> }
  | { type: "mark-retryable-queued" };

const initialUploadToastState: UploadToastState = {
  items: [],
  isUploadActive: false,
  isCollapsed: false,
};

function uploadToastReducer(
  state: UploadToastState,
  action: UploadToastAction,
): UploadToastState {
  switch (action.type) {
    case "enqueue":
      return {
        items: action.items,
        isUploadActive: state.isUploadActive,
        isCollapsed: false,
      };
    case "reset":
      return initialUploadToastState;
    case "set-collapsed":
      return { ...state, isCollapsed: action.value };
    case "set-upload-active":
      return { ...state, isUploadActive: action.value };
    case "update-item":
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item,
        ),
      };
    case "mark-retryable-queued":
      return {
        ...state,
        items: state.items.map((item) =>
          isRetryableUploadItem(item)
            ? { ...item, status: "queued", progress: 0, error: undefined }
            : item,
        ),
      };
  }
}

export function useWorkspaceUploadToast({
  onUploadFiles,
}: {
  onUploadFiles: UploadFiles;
}) {
  const [{ items, isUploadActive, isCollapsed }, dispatch] = useReducer(
    uploadToastReducer,
    initialUploadToastState,
  );
  const activeRef = useRef(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  const updateItem = (id: string, patch: Partial<UploadQueueItem>) => {
    dispatch({ type: "update-item", id, patch });
  };

  const runUpload = async (queueItems: UploadQueueItem[]) => {
      if (queueItems.length === 0) return;

      activeRef.current = true;
      dispatch({ type: "set-upload-active", value: true });
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
      dispatch({ type: "set-upload-active", value: false });
    };

  const enqueue = (files: File[], folderId: "root" | string) => {
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
      dispatch({ type: "enqueue", items: queueItems });

      const uploadable = queueItems.filter((item) => item.status !== "failed");
      void runUpload(uploadable);
    };

  const hasItems = items.length > 0;
  const hasFailed = items.some((item) => item.status === "failed");
  const allComplete = hasItems && items.every((item) => item.status === "complete");

  useEffect(() => {
    if (!hasItems) return;

    const dismissToast = () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      dispatch({ type: "reset" });
      activeRef.current = false;
      toast.dismiss(toastId);
    };

    const retryFailedUploads = () => {
      if (activeRef.current) return;
      const failed = items.filter(isRetryableUploadItem);
      if (failed.length === 0) return;

      dispatch({ type: "mark-retryable-queued" });
      const queueItems = failed.map((item) => ({
        ...item,
        status: "queued" as const,
        progress: 0,
        error: undefined,
      }));
      const ids = queueItems.map((item) => item.id);
      activeRef.current = true;
      dispatch({ type: "set-upload-active", value: true });
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      void onUploadFiles(
        queueItems.map((item) => item.file),
        queueItems[0]?.folderId ?? "root",
        {
          onFileChange: (event) => {
            const id = ids[event.index];
            if (!id) return;
            dispatch({
              type: "update-item",
              id,
              patch: {
                status: event.status,
                progress: event.progress,
                error: event.error,
              },
            });
          },
        },
      ).finally(() => {
        activeRef.current = false;
        dispatch({ type: "set-upload-active", value: false });
      });
    };

    toast.custom(
      () => (
        <WorkspaceUploadToast
          items={items}
          isUploadActive={isUploadActive}
          isCollapsed={isCollapsed}
          onDismiss={dismissToast}
          onToggleCollapsed={() =>
            dispatch({ type: "set-collapsed", value: !isCollapsed })
          }
          onRetryFailed={retryFailedUploads}
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
  }, [hasItems, isCollapsed, isUploadActive, items, onUploadFiles]);

  useEffect(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (!allComplete || hasFailed) return;

    dismissTimerRef.current = setTimeout(() => {
      dispatch({ type: "reset" });
      activeRef.current = false;
      toast.dismiss(toastId);
    }, completeDismissDelayMs);
    return () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };
  }, [allComplete, hasFailed]);

  return {
    enqueue,
    isUploadActive,
  };
}

function createUploadItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
