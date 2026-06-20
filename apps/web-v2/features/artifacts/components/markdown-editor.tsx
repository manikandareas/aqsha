"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon, SaveIcon } from "@aqsha/ui/icons";

/**
 * Editor Markdown BlockNote. Di-`dynamic(ssr:false)` dari reader (BlockNote akses
 * `window`). Simpan → serialize blocks (jsonb) + markdown + plainText ke updateDocument.
 */
export default function MarkdownEditor({
  initialBlocks,
  saving,
  onSave,
}: {
  initialBlocks: PartialBlock[] | undefined;
  saving: boolean;
  onSave: (data: { blocksJson: string; markdown: string; plainText: string }) => void;
}) {
  const editor = useCreateBlockNote({
    initialContent: initialBlocks && initialBlocks.length > 0 ? initialBlocks : undefined,
  });

  async function handleSave() {
    const blocks = editor.document;
    const markdown = await editor.blocksToMarkdownLossy(blocks);
    onSave({ blocksJson: JSON.stringify(blocks), markdown, plainText: markdown });
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border bg-card py-2">
        <BlockNoteView editor={editor} />
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Simpan
        </Button>
      </div>
    </div>
  );
}
