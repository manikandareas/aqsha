"use client";

import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useRef, useState } from "react";
import { blockNotePlainText, parseBlockNoteJson } from "../utils/artifact-editor-model";

export type DocumentEditorContent = {
  blocksJson: string;
  markdown: string;
  plainText: string;
};

export function BlockNoteDocumentEditor({
  initialBlocksJson,
  initialMarkdown = "",
  onContentChange,
}: {
  initialBlocksJson: string;
  initialMarkdown?: string;
  onContentChange: (content: DocumentEditorContent) => void;
}) {
  const [initialContent] = useState(
    () => parseBlockNoteJson(initialBlocksJson) as PartialBlock[],
  );
  const [initialMarkdownSnapshot] = useState(initialMarkdown);
  const initialEditorOptions = (initialContent.length > 0 ? { initialContent } : undefined);
  const editor = useCreateBlockNote(initialEditorOptions, []);
  const hydratedFromMarkdown = useRef(false);

  useEffect(() => {
    if (
      hydratedFromMarkdown.current ||
      initialContent.length > 0 ||
      !initialMarkdownSnapshot.trim()
    ) {
      return;
    }
    hydratedFromMarkdown.current = true;
    const hydrate = async () => {
      const blocks = await Promise.resolve(
        editor.tryParseMarkdownToBlocks(initialMarkdownSnapshot),
      );
      if (blocks.length === 0) {
        return;
      }
      editor.replaceBlocks(editor.document, blocks);
      const document = editor.document;
      onContentChange({
        blocksJson: JSON.stringify(document),
        markdown: editor.blocksToMarkdownLossy(document),
        plainText: blockNotePlainText(document as unknown as Parameters<typeof blockNotePlainText>[0]),
      });
    };
    void hydrate();
  }, [editor, initialContent.length, initialMarkdownSnapshot, onContentChange]);

  useEditorChange(() => {
    const document = editor.document;
    onContentChange({
      blocksJson: JSON.stringify(document),
      markdown: editor.blocksToMarkdownLossy(document),
      plainText: blockNotePlainText(document as unknown as Parameters<typeof blockNotePlainText>[0]),
    });
  }, editor);

  return (
    <div className="min-h-[60svh] px-1 py-3">
      <BlockNoteView editor={editor} className="aqsha-blocknote" />
    </div>
  );
}
