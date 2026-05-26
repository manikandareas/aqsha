"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentEditorContent } from "./blocknote-document-editor";

const ClientBlockNoteDocumentEditor = dynamic(
  () =>
    import("./blocknote-document-editor").then((module) => module.BlockNoteDocumentEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[60svh] rounded-[8px]" />,
  },
);

export function BlockNoteEditorLoader({
  initialBlocksJson,
  initialMarkdown,
  onContentChange,
}: {
  initialBlocksJson: string;
  initialMarkdown?: string;
  onContentChange: (content: DocumentEditorContent) => void;
}) {
  return (
    <ClientBlockNoteDocumentEditor
      initialBlocksJson={initialBlocksJson}
      initialMarkdown={initialMarkdown}
      onContentChange={onContentChange}
    />
  );
}
