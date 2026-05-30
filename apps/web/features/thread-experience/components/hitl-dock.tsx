"use client";

import { api } from "@aqsha/convex/api";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { type WorkspaceId, toWorkspaceId } from "@/lib/convex-refs";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexMutationFn } from "@/lib/convex-query";
import { HitlConfirmCard } from "./hitl-confirm-card";
import { HitlPlanReviewCard } from "./hitl-plan-review-card";
import { HitlQuestionCard } from "./hitl-question-card";

export type HitlSession = NonNullable<
  FunctionReturnType<typeof api.hitlSessions.getActiveForThread>
>;

const CARD_TOOL_BY_KIND = {
  question: "askHuman",
  plan_review: "presentPlan",
  confirmation: "confirmAction",
} as const;

/**
 * Renders active HITL session cards above the composer.
 * Each card kind maps 1:1 to an agent tool (askHuman → question, presentPlan → plan_review, confirmAction → confirmation).
 */
export function HitlDock({
  session,
  threadWorkspaceId,
}: {
  session: HitlSession;
  threadWorkspaceId?: WorkspaceId;
}) {
  const answerQuestion = useConvexMutationFn(api.hitlSessions.answerQuestion);
  const goBackToPreviousQuestion = useConvexMutationFn(api.hitlSessions.goBackToPreviousQuestion);
  const approveCard = useConvexMutationFn(api.hitlSessions.approveCard);
  const rejectSession = useConvexMutationFn(api.hitlSessions.rejectSession);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeCard = session.activeCardId
    ? session.cards.find((card) => card._id === session.activeCardId)
    : undefined;

  const runMutation = async (action: () => Promise<unknown>, fallbackMessage: string) => {
      setError(null);
      setIsSubmitting(true);
      try {
        await action();
        setIsSubmitting(false);
      } catch (mutationError) {
        setError(readableConvexErrorMessage(mutationError, fallbackMessage));
        setIsSubmitting(false);
      }
    };

  if (!activeCard) {
    return null;
  }

  const questionCards = session.cards
    .filter((card) => card.kind === "question")
    .sort((a, b) => a.order - b.order);
  const activeQuestionOrdinal =
    questionCards.length > 1
      ? questionCards.findIndex((card) => card._id === activeCard._id) + 1
      : 0;
  const toolName = CARD_TOOL_BY_KIND[activeCard.kind];

  const handleBuild = async (workspaceId?: WorkspaceId) => {
    const resolvedWorkspaceId =
      workspaceId ?? (threadWorkspaceId && !workspaceId ? threadWorkspaceId : undefined);
    await runMutation(
      () =>
        approveCard({
          cardId: activeCard._id,
          ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
        }),
      "Gagal mengeksekusi rencana.",
    );
  };

  return (
    <div className="mb-2 space-y-1.5" data-hitl-session={session._id} data-hitl-tool={toolName}>
      {activeCard.kind === "question" ? (
        <HitlQuestionCard
          key={activeCard._id}
          prompt={activeCard.prompt ?? ""}
          options={activeCard.options ?? []}
          allowCustom={activeCard.allowCustom}
          disabled={isSubmitting}
          questionIndex={questionCards.length > 1 ? activeQuestionOrdinal : undefined}
          questionTotal={questionCards.length > 1 ? questionCards.length : undefined}
          onBack={
            questionCards.length > 1 && activeQuestionOrdinal > 1
              ? () =>
                  void runMutation(
                    () => goBackToPreviousQuestion({ cardId: activeCard._id }),
                    "Gagal kembali.",
                  )
              : undefined
          }
          onSkip={() =>
            void runMutation(
              () =>
                answerQuestion({
                  cardId: activeCard._id,
                  selectedOptionIds: [],
                  skip: true,
                }),
              "Gagal menyimpan jawaban.",
            )
          }
          onContinue={(args) =>
            void runMutation(
              () =>
                answerQuestion({
                  cardId: activeCard._id,
                  selectedOptionIds: args.selectedOptionIds,
                  customAnswer: args.customAnswer,
                }),
              "Gagal menyimpan jawaban.",
            )
          }
        />
      ) : null}
      {activeCard.kind === "plan_review" ? (
        <HitlPlanReviewCard
          key={activeCard._id}
          title={activeCard.title ?? "Plan"}
          summary={activeCard.summary}
          planBullets={activeCard.planBullets}
          requiresWorkspacePick={activeCard.requiresWorkspacePick && !threadWorkspaceId}
          workspaceName={activeCard.workspaceName}
          disabled={isSubmitting}
          onReject={() =>
            void runMutation(() => rejectSession({ sessionId: session._id }), "Gagal membatalkan.")
          }
          onBuild={(workspaceId) => void handleBuild(workspaceId ? toWorkspaceId(workspaceId) : undefined)}
        />
      ) : null}
      {activeCard.kind === "confirmation" ? (
        <HitlConfirmCard
          key={activeCard._id}
          title={activeCard.title ?? "Confirm"}
          message={activeCard.message ?? ""}
          destructive={activeCard.destructive ?? true}
          confirmLabel={activeCard.destructive === false ? "Confirm" : "Hapus"}
          disabled={isSubmitting}
          onReject={() =>
            void runMutation(() => rejectSession({ sessionId: session._id }), "Gagal membatalkan.")
          }
          onConfirm={() => void handleBuild()}
        />
      ) : null}
      {error ? <p className="text-[10px] font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
