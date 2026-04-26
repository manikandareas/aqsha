"use client";

import * as React from "react";
import type { Value } from "platejs";

import { PlateAiEditor } from "@/features/journal/editor/editor/plate-ai-editor";
import type { JournalRecord } from "../lib/journals";
import { useJournalAutosave } from "./use-journal-autosave";

export function WorkspacePlateJournalEditor({
  journal,
}: {
  journal: JournalRecord;
}) {
  const {
    contentValue,
    handleContentChange,
    handleTitleChange,
    saveStatus,
    saveStatusLabel,
    title,
  } = useJournalAutosave({ journal });

  const header = (
    <div className="shrink-0 pt-6">
      <div className="mb-3 flex justify-end px-6 md:px-12">
        <span
          className="rounded-full border border-border/60 bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground"
          data-status={saveStatus}
        >
          {saveStatusLabel}
        </span>
      </div>
      <input
        aria-label="Journal title"
        className="w-full bg-transparent px-6 text-4xl leading-tight font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/50 md:px-12"
        onChange={(event) => {
          handleTitleChange(event.target.value);
        }}
        placeholder="Untitled"
        spellCheck={false}
        value={title}
      />
    </div>
  );

  const initialValue = (contentValue ?? [
    { type: "p", children: [{ text: "" }] },
  ]) as Value;

  return (
    <div className="relative min-h-0 max-w-4xl mx-auto flex-1 pb-28 md:pb-32 lg:pb-36 py-6 md:py-12">
      <PlateAiEditor
        editorClassName="min-h-[420px] [&_[data-slate-editor]]:min-h-[420px]"
        editorId={journal.id}
        header={header}
        initialValue={initialValue}
        onValueChange={({ value }) => {
          handleContentChange(value as JournalRecord["contentJson"]);
        }}
        placeholder="Start writing..."
      />
    </div>
  );
}
