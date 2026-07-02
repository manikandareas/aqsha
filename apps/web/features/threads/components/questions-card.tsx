"use client";

import type { AskQuestion, AskQuestionAnswer, AskQuestionsResumeData } from "@aqsha/chat-core";
import { Button } from "@aqsha/ui";
import { CheckIcon, ChevronRightIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Kartu HITL klarifikasi (`ask_questions`) — sejajar plan-gate, tapi interaktif: pilih-satu (radio)
 * + "Lainnya…" freeform, pilih-banyak (checkbox), atau teks bebas. Dipakai DUA tempat dengan
 * komponen form yang sama: inline di atas composer (`QuestionsCard`) dan panel kanan
 * (`QuestionsDetailPanel`). Jawaban → `AskQuestionsResumeData` dikirim balik lewat `resolveAsk`.
 */

/** Draft jawaban satu pertanyaan (UI-only; dipetakan ke `AskQuestionAnswer` saat submit). */
type Draft = { selected: string[]; otherActive: boolean; other: string };

const emptyDraft = (): Draft => ({ selected: [], otherActive: false, other: "" });

function initDrafts(questions: AskQuestion[]): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const q of questions) out[q.id] = emptyDraft();
  return out;
}

/** Label keycap opsi (A, B, C, …). */
function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Petakan draft → `AskQuestionAnswer[]` (freeform / "Lainnya…" yang terisi jadi `other`). */
function buildAnswers(questions: AskQuestion[], drafts: Record<string, Draft>): AskQuestionAnswer[] {
  return questions.map((q) => {
    const d = drafts[q.id] ?? emptyDraft();
    const otherText = d.other.trim();
    const includeOther = (q.options.length === 0 || d.otherActive) && otherText.length > 0;
    return includeOther ? { id: q.id, selected: d.selected, other: otherText } : { id: q.id, selected: d.selected };
  });
}

function OptionChip({
  letter,
  label,
  description,
  selected,
  multi,
  onClick,
}: {
  letter: string;
  label: string;
  description?: string;
  selected: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-foreground/30 bg-foreground/[0.05] text-foreground"
          : "border-border bg-card text-foreground hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-px inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-mono text-[10px] font-semibold leading-none",
          selected
            ? "border-foreground/30 bg-foreground/[0.08] text-foreground"
            : "border-border/70 bg-background text-muted-foreground",
        )}
      >
        {multi && selected ? <CheckIcon className="size-3" /> : letter}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] leading-5">{label}</span>
        {description ? (
          <span className="block text-[11px] leading-4 text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
}

function QuestionBlock({
  question,
  index,
  draft,
  onChange,
}: {
  question: AskQuestion;
  index: number;
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const isFreeform = question.options.length === 0;
  const isMulti = question.kind === "multi";

  const selectSingle = (label: string) => onChange({ ...draft, selected: [label], otherActive: false });
  const toggleMulti = (label: string) => {
    const has = draft.selected.includes(label);
    onChange({
      ...draft,
      selected: has ? draft.selected.filter((l) => l !== label) : [...draft.selected, label],
    });
  };
  const toggleOther = () =>
    onChange(
      isMulti
        ? { ...draft, otherActive: !draft.otherActive }
        : { ...draft, selected: [], otherActive: true },
    );
  const setOther = (other: string) => onChange({ ...draft, other, otherActive: true });

  return (
    <div className="grid gap-2">
      <div className="flex gap-2 text-[13px] font-medium leading-5 text-foreground">
        <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
        <span className="min-w-0">{question.prompt}</span>
      </div>

      {isFreeform ? (
        <textarea
          value={draft.other}
          onChange={(e) => setOther(e.target.value)}
          rows={2}
          placeholder="Tulis jawaban…"
          className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {question.options.map((opt, i) => (
              <OptionChip
                key={opt.label}
                letter={optionLetter(i)}
                label={opt.label}
                description={opt.description}
                multi={isMulti}
                selected={draft.selected.includes(opt.label)}
                onClick={() => (isMulti ? toggleMulti(opt.label) : selectSingle(opt.label))}
              />
            ))}
            {question.allowOther ? (
              <OptionChip
                letter={optionLetter(question.options.length)}
                label="Lainnya…"
                multi={isMulti}
                selected={draft.otherActive}
                onClick={toggleOther}
              />
            ) : null}
          </div>
          {question.allowOther && draft.otherActive ? (
            <input
              value={draft.other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tulis jawaban lain…"
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Form interaktif (pertanyaan + footer Lewati/Kirim). Dipakai kartu inline & panel kanan.
 * `scrollable` (inline) membatasi tinggi daftar pertanyaan dengan ScrollArea supaya kartu tetap
 * ringkas di atas composer (sejajar tinggi kartu plan); panel memakai scroll-nya sendiri.
 */
export function QuestionsForm({
  questions,
  findings,
  onSubmit,
  onSkip,
  scrollable = false,
}: {
  questions: AskQuestion[];
  /** Temuan parsial pra-klarifikasi dari agent — tampil di atas pertanyaan agar riset tak terbuang. */
  findings?: string;
  onSubmit: (resume: AskQuestionsResumeData) => void;
  onSkip: () => void;
  scrollable?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => initDrafts(questions));

  const handleSubmit = () => onSubmit({ action: "answered", answers: buildAnswers(questions, drafts) });

  const fields = (
    <div className={cn("grid gap-4", scrollable && "pr-3")}>
      {findings ? (
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-muted/40 px-2.5 py-2 text-[13px] leading-5 text-muted-foreground">
          {findings}
        </p>
      ) : null}
      {questions.map((q, i) => (
        <QuestionBlock
          key={q.id}
          question={q}
          index={i}
          draft={drafts[q.id] ?? emptyDraft()}
          onChange={(next) => setDrafts((d) => ({ ...d, [q.id]: next }))}
        />
      ))}
    </div>
  );

  // Baris aksi disamakan dengan kartu plan/approval: rata-kiri `flex gap-2`, aksi utama dulu
  // (`size="sm"`) lalu ghost — hanya labelnya disesuaikan (Kirim/Lewati).
  return (
    <div className="grid gap-3">
      {scrollable ? <ScrollArea viewportClassName="max-h-60">{fields}</ScrollArea> : fields}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSubmit}>
          Kirim
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onSkip}>
          Lewati
        </Button>
      </div>
    </div>
  );
}

/**
 * Kartu inline (di atas composer). Header + aksi buka-panel DISAMAKAN dengan kartu plan-gate: baris
 * header yang bisa diklik (judul + jumlah + chevron) membuka panel Questions; form berada di bawahnya.
 */
export function QuestionsCard({
  questions,
  findings,
  onSubmit,
  onSkip,
  onOpenPanel,
}: {
  questions: AskQuestion[];
  findings?: string;
  onSubmit: (resume: AskQuestionsResumeData) => void;
  onSkip: () => void;
  onOpenPanel?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {onOpenPanel ? (
        <button
          type="button"
          onClick={onOpenPanel}
          className="group -m-1 flex w-full items-start justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="grid min-w-0 gap-1">
            <span className="text-sm font-semibold text-foreground">Klarifikasi</span>
            <span className="text-[13px] text-muted-foreground">
              {`${questions.length} pertanyaan · ketuk untuk lihat detail`}
            </span>
          </div>
          <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
        </button>
      ) : (
        <div className="grid gap-1">
          <span className="text-sm font-semibold text-foreground">Klarifikasi</span>
          <span className="text-[13px] text-muted-foreground">{`${questions.length} pertanyaan`}</span>
        </div>
      )}
      <div className="mt-3">
        <QuestionsForm
          questions={questions}
          findings={findings}
          onSubmit={onSubmit}
          onSkip={onSkip}
          scrollable
        />
      </div>
    </div>
  );
}
