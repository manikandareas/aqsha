"use client";

import {
  parseResearchPlanPayload,
  renderResearchPlanMarkdown,
} from "@aqsha/agent-contracts";
import { useState } from "react";
import { toast } from "sonner";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import type { ChatMessage } from "../types";
import { messageHitlParts, type HitlToolPart } from "../utils/hitl-parts";
import { HitlConfirmCard } from "./hitl-confirm-card";
import { HitlPlanReviewCard } from "./hitl-plan-review-card";
import { HitlQuestionCard } from "./hitl-question-card";
import { ResearchPlanReviewCard } from "./research-plan-review-card";
import type {
  HitlActions,
  HitlAnswer,
  HitlPlanDecision,
} from "./use-hitl-resume";

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items : undefined;
}

type RawQuestion = {
  prompt?: unknown;
  options?: unknown;
  allowCustom?: unknown;
};

/** Renders the native HITL tool parts of an assistant message inline in-thread. */
export function MessageHitlParts({
  message,
  actions,
  disabled,
  runTerminal,
}: {
  message: ChatMessage;
  actions: HitlActions;
  disabled?: boolean;
  /** The run reached a terminal state — render cards non-interactive (no zombie). */
  runTerminal?: boolean;
}) {
  const parts = messageHitlParts(message);
  const pending = parts.filter(
    (part) =>
      part.state === "approval-requested" ||
      (part.toolName === "askUser" && part.state === "input-available"),
  );
  const denied = parts.filter((part) => part.state === "output-denied");

  if (pending.length === 0 && denied.length === 0) return null;

  return (
    <div className="mt-2 flex w-full min-w-0 flex-col gap-2">
      {pending.map((part) => (
        <HitlPartCard
          key={part.toolCallId || part.approvalId}
          part={part}
          actions={actions}
          disabled={disabled}
          runTerminal={runTerminal}
        />
      ))}
      {denied.map((part) => (
        <span
          key={`denied-${part.toolCallId || part.approvalId}`}
          className="text-[11px] text-muted-foreground"
        >
          Dibatalkan
        </span>
      ))}
    </div>
  );
}

function HitlPartCard({
  part,
  actions,
  disabled,
  runTerminal,
}: {
  part: HitlToolPart;
  actions: HitlActions;
  disabled?: boolean;
  runTerminal?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  // A terminal run can no longer accept a response — gate the card so a still
  // pending interaction never renders an interactive zombie card (plan §7.3).
  const busy = Boolean(disabled) || submitting || Boolean(runTerminal);
  const input = part.input;

  if (part.toolName === "askUser") {
    const questions = Array.isArray(input.questions)
      ? (input.questions as RawQuestion[])
      : [];
    return (
      <AskUserCard
        questions={questions}
        disabled={busy}
        onAnswer={async (answers) => {
          setSubmitting(true);
          try {
            await actions.onAnswer(part.toolCallId, answers);
          } catch (error) {
            setSubmitting(false);
            toast.error(readableConvexErrorMessage(error, "Gagal mengirim jawaban."));
          }
        }}
      />
    );
  }

  const approvalId = part.approvalId;
  if (!approvalId) return null;

  const approve = async (workspaceId?: string) => {
    setSubmitting(true);
    try {
      await actions.onApprove(approvalId, workspaceId);
    } catch (error) {
      setSubmitting(false);
      toast.error(readableConvexErrorMessage(error, "Gagal menyetujui tindakan."));
    }
  };
  const deny = async () => {
    setSubmitting(true);
    try {
      await actions.onDeny(approvalId);
    } catch (error) {
      setSubmitting(false);
      toast.error(readableConvexErrorMessage(error, "Gagal membatalkan tindakan."));
    }
  };
  const planDecision = async (payload: HitlPlanDecision) => {
    setSubmitting(true);
    try {
      await actions.onPlanDecision(approvalId, payload);
    } catch (error) {
      setSubmitting(false);
      toast.error(
        readableConvexErrorMessage(error, "Gagal mengirim keputusan rencana."),
      );
    }
  };

  if (part.toolName === "deleteArtifact") {
    return (
      <HitlConfirmCard
        title={asString(input.title) ?? "Hapus artifact?"}
        message={asString(input.message) ?? "Tindakan ini tidak dapat dibatalkan."}
        destructive
        confirmLabel="Hapus"
        cancelLabel="Batal"
        disabled={busy}
        submitting={submitting}
        onConfirm={() => void approve()}
        onReject={() => void deny()}
      />
    );
  }

  if (part.toolName === "proposeResearchPlan") {
    const plan = parseResearchPlanPayload(input);
    return (
      <ResearchPlanReviewCard
        title={plan.title}
        summary={plan.summary}
        questions={plan.questions}
        disabled={busy}
        submitting={submitting}
        onStart={(edited) =>
          void planDecision({
            decision: "start",
            // renderResearchPlanMarkdown is the single source of truth for the
            // plan format the backend re-reads (plan §6.1) — render the EDITED
            // questions through it so the executed plan matches the card.
            editedPlan: renderResearchPlanMarkdown({ ...plan, questions: edited }),
          })
        }
        onRevise={(instruction) =>
          void planDecision({ decision: "revise", revisionInstruction: instruction })
        }
        onReject={() => void planDecision({ decision: "reject" })}
      />
    );
  }

  // proposeArtifact / createWorkspace / renameWorkspace → Review Plan card.
  return (
    <HitlPlanReviewCard
      title={asString(input.title) ?? asString(input.name) ?? "Rencana"}
      summary={asString(input.summary)}
      planBullets={asStringArray(input.planBullets)}
      disabled={busy}
      submitting={submitting}
      onBuild={(workspaceId) => void approve(workspaceId)}
      onReject={() => void deny()}
    />
  );
}

/** Steps through the questions of a single askUser tool call, then submits all. */
function AskUserCard({
  questions,
  disabled,
  onAnswer,
}: {
  questions: RawQuestion[];
  disabled?: boolean;
  onAnswer: (answers: HitlAnswer[]) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<HitlAnswer[]>([]);

  if (questions.length === 0) return null;
  const question = questions[Math.min(index, questions.length - 1)];
  const prompt = asString(question.prompt) ?? "";
  const options = Array.isArray(question.options)
    ? question.options
        .map((option) => {
          const record = option as { id?: unknown; label?: unknown };
          const id = asString(record.id);
          const label = asString(record.label);
          return id && label ? { id, label } : null;
        })
        .filter((option): option is { id: string; label: string } => option !== null)
    : [];

  const advance = (answer: HitlAnswer) => {
    const next = [...answers, answer];
    if (index + 1 >= questions.length) {
      void onAnswer(next);
      return;
    }
    setAnswers(next);
    setIndex(prev => prev + 1);
  };

  return (
    <HitlQuestionCard
      key={prompt}
      prompt={prompt}
      options={options}
      allowCustom={question.allowCustom !== false}
      disabled={disabled}
      questionIndex={index + 1}
      questionTotal={questions.length}
      onContinue={({ selectedOptionIds, customAnswer }) =>
        advance({ prompt, selectedOptionIds, customAnswer })
      }
      onSkip={() => advance({ prompt, skipped: true })}
      onBack={
        index > 0
          ? () => {
              setAnswers(answers.slice(0, -1));
              setIndex(prev => prev - 1);
            }
          : undefined
      }
    />
  );
}
