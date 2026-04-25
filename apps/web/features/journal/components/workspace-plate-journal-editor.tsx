"use client";

import * as React from "react";
import type { Value } from "platejs";

import { PlateAiEditor } from "@/features/journal/editor/editor/plate-ai-editor";
import type { JournalRecord } from "../lib/journals";

export function WorkspacePlateJournalEditor({
  journal,
}: {
  journal: JournalRecord;
}) {
  const [title, setTitle] = React.useState(journal.title);

  const header = (
    <input
      aria-label="Journal title"
      className="w-full shrink-0 bg-transparent px-6 pt-2 text-4xl leading-tight font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 md:px-12 lg:px-24"
      onChange={(event) => {
        setTitle(event.target.value);
      }}
      placeholder="Untitled"
      spellCheck={false}
      value={title}
    />
  );

  const initialValue = (journal.contentJson ?? [
    { type: "p", children: [{ text: "" }] },
  ]) as Value;

  return (
    <div className="relative min-h-0 max-w-4xl mx-auto flex-1 pb-28 md:pb-32 lg:pb-36">
      <PlateAiEditor
        editorClassName="min-h-[420px] [&_[data-slate-editor]]:min-h-[420px]"
        editorId={journal.id}
        header={header}
        initialValue={initialValue}
        placeholder="Start writing..."
      />
    </div>
  );
}
