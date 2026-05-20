"use client";

import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { blockNotePlainText, parseBlockNoteJson } from "../utils/artifact-editor-model";

export type DocumentEditorContent = {
  blocksJson: string;
  markdown: string;
  plainText: string;
};

export function BlockNoteDocumentEditor({
  initialBlocksJson,
  onContentChange,
}: {
  initialBlocksJson: string;
  onContentChange: (content: DocumentEditorContent) => void;
}) {
  const initialContent = parseBlockNoteJson(initialBlocksJson) as PartialBlock[];
  const editor = useCreateBlockNote(
    initialContent.length > 0 ? { initialContent } : undefined,
    [initialBlocksJson],
  );

  useEditorChange(() => {
    const document = editor.document;
    onContentChange({
      blocksJson: JSON.stringify(document),
      markdown: editor.blocksToMarkdownLossy(document),
      plainText: blockNotePlainText(document as unknown as Parameters<typeof blockNotePlainText>[0]),
    });
  }, editor);

  return (
    <div className="min-h-[60svh] rounded-[8px] border border-border bg-background px-1 py-3">
      <BlockNoteView editor={editor} className="aqsha-blocknote" />
    </div>
  );
}
