"use client";

import { CornerDownLeftIcon, Loader2Icon, PlusIcon, XIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Deep-research plan-gate review card (plan §7.1). Prose, no card chrome —
 * consistent with HitlPlanReviewCard and the conversational HITL direction. The
 * user can EDIT the sub-questions in place, then [Mulai] (start with the edited
 * plan), [Minta revisi] (open an in-card textarea → send an instruction), or
 * [Tolak] (cancel the run). The composer stays locked through all three.
 *
 * Edit-ownership invariant: the question/draft state is initialized ONCE from
 * props and owned by the card until submit — do NOT sync `questions` back into
 * state via useEffect. The card key upstream is the stable interaction id, so the
 * initializer runs once and a re-render can never clobber in-progress edits.
 */
export function ResearchPlanReviewCard({
  title,
  summary,
  questions,
  disabled,
  submitting,
  onStart,
  onRevise,
  onReject,
}: {
  title: string;
  summary?: string;
  questions: string[];
  /** Non-interactive (a submit is in flight OR the run is terminal). */
  disabled?: boolean;
  /** A response submit is actually in flight — drives the button spinner only. */
  submitting?: boolean;
  onStart: (editedQuestions: string[]) => void;
  onRevise: (instruction: string) => void;
  onReject: () => void;
}) {
  const [edited, setEdited] = useState<string[]>(questions);
  const [mode, setMode] = useState<"review" | "revising">("review");
  const [revisionDraft, setRevisionDraft] = useState("");

  const updateQuestion = (index: number, value: string) =>
    setEdited((prev) => prev.map((question, i) => (i === index ? value : question)));
  const removeQuestion = (index: number) =>
    setEdited((prev) => prev.filter((_, i) => i !== index));
  const addQuestion = () => setEdited((prev) => [...prev, ""]);

  const cleaned = edited.map((question) => question.trim()).filter(Boolean);
  const canStart = cleaned.length > 0;
  const revisionReady = revisionDraft.trim().length > 0;

  return (
    <div
      data-hitl-tool="proposeResearchPlan"
      className="flex w-full min-w-0 flex-col text-[13px] leading-[1.55]"
    >
      <p className="text-[13px] font-medium leading-snug text-foreground">{title}</p>
      {summary ? (
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
          {summary}
        </p>
      ) : null}

      <ul className="mt-2 flex flex-col gap-1">
        {edited.map((question, index) => (
          <li key={index} className="flex items-start gap-1.5">
            <span
              aria-hidden
              className="mt-2.5 size-1 shrink-0 rounded-full bg-muted-foreground/45"
            />
            <textarea
              value={question}
              disabled={disabled}
              rows={1}
              onChange={(event) => updateQuestion(index, event.target.value)}
              placeholder="Sub-pertanyaan riset…"
              // field-sizing-content grows the textarea to fit its content (rows=1
              // is just the min), so a long sub-question stays fully readable.
              className="min-w-0 flex-1 resize-none field-sizing-content rounded-md border border-transparent bg-muted/40 px-2 py-1 text-[12px] leading-snug text-foreground/90 outline-none focus:border-border focus:bg-background"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Hapus sub-pertanyaan"
              className="shrink-0 text-muted-foreground"
              disabled={disabled || edited.length <= 1}
              onClick={() => removeQuestion(index)}
            >
              <XIcon className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-1 w-fit gap-1 text-[11px] text-muted-foreground"
        disabled={disabled}
        onClick={addQuestion}
      >
        <PlusIcon className="size-3" />
        Tambah pertanyaan
      </Button>

      {mode === "revising" ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <textarea
            value={revisionDraft}
            disabled={disabled}
            rows={2}
            autoFocus
            onChange={(event) => setRevisionDraft(event.target.value)}
            placeholder="Apa yang ingin diubah dari rencana ini?"
            className="w-full resize-none field-sizing-content rounded-md border border-border bg-background px-2 py-1.5 text-[12px] leading-snug text-foreground outline-none focus:border-ring"
          />
          <div className="flex flex-row items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[11px] text-muted-foreground"
              disabled={disabled}
              onClick={() => {
                setMode("review");
                setRevisionDraft("");
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              size="sm"
              className="shrink-0 gap-0.5 text-[11px] font-medium"
              disabled={disabled || !revisionReady}
              onClick={() => onRevise(revisionDraft.trim())}
            >
              {submitting ? <Loader2Icon className="size-3 animate-spin" /> : null}
              Kirim revisi
              <CornerDownLeftIcon className="size-2.5 opacity-60" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-row items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[11px] text-muted-foreground"
            disabled={disabled}
            onClick={onReject}
          >
            Tolak
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[11px] text-muted-foreground"
            disabled={disabled}
            onClick={() => setMode("revising")}
          >
            Minta revisi
          </Button>
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-0.5 text-[11px] font-medium"
            disabled={disabled || !canStart}
            onClick={() => onStart(cleaned)}
          >
            {submitting ? <Loader2Icon className="size-3 animate-spin" /> : null}
            Mulai
            <CornerDownLeftIcon className="size-2.5 opacity-60" />
          </Button>
        </div>
      )}
    </div>
  );
}
