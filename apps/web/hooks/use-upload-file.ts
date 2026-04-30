"use client";

import * as React from "react";

import { toast } from "@/lib/toast";

export type UploadedFileResult = {
  name: string;
  ufsUrl: string;
};

export type UseUploadFileProps = {
  endpoint?: string;
  onUploadComplete?: (data: UploadedFileResult | unknown) => void;
  onUploadError?: (error: Error) => void;
};

export function useUploadFile({
  endpoint: _endpoint,
  onUploadComplete,
  onUploadError,
}: UseUploadFileProps = {}) {
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [uploadingFile, setUploadingFile] = React.useState<File | null>(null);
  const [uploadedFile, setUploadedFile] =
    React.useState<UploadedFileResult | null>(null);

  const uploadFile = React.useCallback(
    async (file: File) => {
      setUploadedFile(null);
      setUploadingFile(file);
      setIsUploading(true);
      setProgress(0);

      try {
        setProgress(100);

        const ufsUrl = URL.createObjectURL(file);
        const result: UploadedFileResult = { name: file.name, ufsUrl };

        setUploadedFile(result);
        onUploadComplete?.(result);

        toast.info({
          title: "Local preview",
          description: "Using a local preview until cloud upload is available.",
        });
      } catch (error) {
        onUploadError?.(error as Error);
      } finally {
        setIsUploading(false);
        setUploadingFile(null);
        setProgress(null);
      }
    },
    [onUploadComplete, onUploadError],
  );

  return {
    uploadFile,
    isUploading,
    progress: progress ?? 0,
    uploadedFile,
    uploadingFile,
  };
}
