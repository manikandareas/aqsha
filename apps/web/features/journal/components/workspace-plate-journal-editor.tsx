"use client";

import { ImageIcon, MessageSquareIcon } from "lucide-react";
import type { Value } from "platejs";
import * as React from "react";

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

  const [showCoverHint, setShowCoverHint] = React.useState(false);

  const header = (
    <div className="shrink-0 w-full">
      {/* Page emoji / icon area */}
      <div
        className="group px-6 pt-10 pb-1 md:px-12"
        onMouseEnter={() => setShowCoverHint(true)}
        onMouseLeave={() => setShowCoverHint(false)}
      >
        {/* Journal emoji icon */}
        <div className="mb-4 text-5xl select-none leading-none" aria-hidden>
          📓
        </div>

        {/* Ghost action buttons — visible on hover */}
        <div
          className={`flex items-center gap-3 mb-4 transition-opacity duration-150 ${
            showCoverHint ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={!showCoverHint}
        >
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0" />
            Add cover
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageSquareIcon className="h-3.5 w-3.5 shrink-0" />
            Add comment
          </button>
        </div>
      </div>

      {/* Title input */}
      <div className="relative px-6 md:px-12">
        <input
          aria-label="Journal title"
          className="w-full bg-transparent text-[2.25rem] leading-[1.2] font-bold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/40 md:text-[2.5rem]"
          onChange={(event) => {
            handleTitleChange(event.target.value);
          }}
          placeholder="Untitled"
          spellCheck={false}
          value={title}
        />
      </div>
    </div>
  );

  const initialValue = (contentValue ?? [
    { type: "p", children: [{ text: "" }] },
  ]) as Value;

  return (
    <div className="relative min-h-0 max-w-4xl mx-auto flex-1 pb-28 md:pb-32 lg:pb-36">
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
