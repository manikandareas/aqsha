"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentEditorContent, EditorSelection } from "./blocknote-document-editor";

const ClientBlockNoteDocumentEditor = dynamic(
  () =>
    import("./blocknote-document-editor").then((module) => module.BlockNoteDocumentEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[60svh] rounded-[8px]" />,
  },
);

export function BlockNoteEditorLoader({
  artifactId,
  workspaceId,
  initialBlocksJson,
  initialMarkdown,
  onContentChange,
  onAskAstraAboutSelection,
}: {
  artifactId: string;
  workspaceId: string;
  initialBlocksJson: string;
  initialMarkdown?: string;
  onContentChange: (content: DocumentEditorContent) => void;
  onAskAstraAboutSelection?: (selection: EditorSelection) => void;
}) {
  return (
    <ClientBlockNoteDocumentEditor
      artifactId={artifactId}
      workspaceId={workspaceId}
      initialBlocksJson={initialBlocksJson}
      initialMarkdown={initialMarkdown}
      onContentChange={onContentChange}
      onAskAstraAboutSelection={onAskAstraAboutSelection}
    />
  );
}
