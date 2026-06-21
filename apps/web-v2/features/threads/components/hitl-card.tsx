"use client";

import { Button } from "@aqsha/ui/components/button";
import { CheckIcon, CornerDownLeftIcon, XIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { HitlCardModel } from "../lib/eve-timeline";

/** Respons HITL native eve (`agent.send({ inputResponses: [...] })`). */
export type HitlResponse = { requestId: string; optionId?: string; text?: string };

/**
 * Kartu HITL terpadu (Slice 6.5) untuk SEMUA input-request eve — branch by `display`.
 * Pengganti 3 kartu V1 (confirm/question/plan) yang ter-couple Convex: kontrak
 * `EveMessageInputRequest` seragam, jadi satu komponen cukup. Jawaban native eve:
 * approval → `optionId: 'approve'|'deny'`; select/text → `optionId`/`text`. Composer tetap
 * terbuka (parent); kartu jadi read-only setelah `responded`.
 */
export function HitlCard({
  model,
  disabled,
  onRespond,
}: {
  model: HitlCardModel;
  /** Turn sedang in-flight (resume berjalan) → matikan interaksi. */
  disabled?: boolean;
  onRespond: (response: HitlResponse) => void;
}) {
  if (model.responded) return <RespondedCard model={model} />;
  if (model.display === "confirmation") {
    return <ConfirmCard model={model} disabled={disabled} onRespond={onRespond} />;
  }
  return <QuestionCard model={model} disabled={disabled} onRespond={onRespond} />;
}

const cardClass =
  "flex w-full min-w-0 flex-col rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-[13px] leading-[1.55]";

// ── confirmation (approval / delete-confirm / propose_artifact) ──────────────────

function ConfirmCard({
  model,
  disabled,
  onRespond,
}: {
  model: HitlCardModel;
  disabled?: boolean;
  onRespond: (response: HitlResponse) => void;
}) {
  const approveId = model.options.find((o) => o.id === "approve")?.id ?? "approve";
  const denyId = model.options.find((o) => o.id === "deny")?.id ?? "deny";
  const destructive = model.toolName === "delete_artifact";
  const preview = model.toolName === "propose_artifact" ? proposePreview(model.input) : null;

  return (
    <div className={cardClass} data-hitl-tool={model.toolName}>
      <p className="font-medium text-foreground">{model.prompt}</p>
      {preview ? (
        <div className="mt-1.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-2">
          {preview.title ? (
            <p className="truncate font-medium text-[12px] text-foreground">{preview.title}</p>
          ) : null}
          {preview.body ? (
            <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[12px] text-muted-foreground">
              {preview.body}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-[12px]"
          disabled={disabled}
          onClick={() => onRespond({ requestId: model.requestId, optionId: denyId })}
        >
          {denyLabel(model, denyId)}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          size="sm"
          className="h-7 px-3 text-[12px]"
          disabled={disabled}
          onClick={() => onRespond({ requestId: model.requestId, optionId: approveId })}
        >
          {approveLabel(model, approveId)}
        </Button>
      </div>
    </div>
  );
}

// ── select / text (ask_question) ────────────────────────────────────────────────

function QuestionCard({
  model,
  disabled,
  onRespond,
}: {
  model: HitlCardModel;
  disabled?: boolean;
  onRespond: (response: HitlResponse) => void;
}) {
  const [text, setText] = useState("");
  const showText = model.display === "text" || model.allowFreeform;
  const trimmed = text.trim();
  const submitText = () => {
    if (!trimmed) return;
    onRespond({ requestId: model.requestId, text: trimmed });
  };

  return (
    <div className={cardClass} data-hitl-tool={model.toolName}>
      <p className="font-medium text-foreground">{model.prompt}</p>
      {model.options.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {model.options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRespond({ requestId: model.requestId, optionId: o.id })}
                className={cn(
                  "-mx-1 flex w-[calc(100%+0.5rem)] items-center rounded-md px-1.5 py-1 text-left text-[12px] text-foreground/90 transition-colors",
                  disabled ? "opacity-50" : "hover:bg-muted/40",
                )}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showText ? (
        <div className="mt-2 flex items-center gap-1">
          <input
            type="text"
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitText();
            }}
            placeholder="Tulis jawaban…"
            aria-label="Jawaban"
            className="min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[12px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="sm"
            className="h-7 gap-0.5 px-2.5 text-[12px]"
            disabled={disabled || !trimmed}
            onClick={submitText}
          >
            Kirim
            <CornerDownLeftIcon className="size-2.5 opacity-60" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── responded (read-only) ───────────────────────────────────────────────────────

function RespondedCard({ model }: { model: HitlCardModel }) {
  let summary: string;
  if (model.display === "confirmation") {
    summary = model.approved ? "Disetujui" : "Ditolak";
  } else if (model.answeredText) {
    summary = model.answeredText;
  } else {
    const opt = model.options.find((o) => o.id === model.answeredOptionId);
    summary = opt?.label ?? "Dijawab";
  }
  const denied = model.display === "confirmation" && model.approved === false;
  return (
    <div className={cn(cardClass, "opacity-80")} data-hitl-tool={model.toolName}>
      <p className="text-muted-foreground">{model.prompt}</p>
      <p className="mt-1 inline-flex items-center gap-1 font-medium text-[12px] text-foreground">
        {denied ? (
          <XIcon className="size-3.5 text-muted-foreground" />
        ) : (
          <CheckIcon className="size-3.5 text-muted-foreground" />
        )}
        {summary}
      </p>
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────────

function approveLabel(model: HitlCardModel, approveId: string): string {
  if (model.toolName === "delete_artifact") return "Hapus";
  return model.options.find((o) => o.id === approveId)?.label ?? "Setujui";
}

function denyLabel(model: HitlCardModel, denyId: string): string {
  return model.options.find((o) => o.id === denyId)?.label ?? "Tolak";
}

/** Ekstrak preview judul+isi dari input `propose_artifact` (default-deny non-scalar). */
function proposePreview(input: unknown): { title?: string; body?: string } | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : undefined;
  const body = typeof o.markdown === "string" ? o.markdown.slice(0, 400) : undefined;
  if (!title && !body) return null;
  return { title, body };
}
