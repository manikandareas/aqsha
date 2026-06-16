"use client";

import { api } from "@aqsha/convex/api";
import { useConvexMutationFn } from "@/lib/convex-query";

export type HitlAnswer = {
  prompt: string;
  selectedOptionIds?: string[];
  customAnswer?: string;
  skipped?: boolean;
};

export type HitlPlanDecision = {
  decision: "start" | "revise" | "reject";
  editedPlan?: string;
  revisionInstruction?: string;
};

export type HitlActions = {
  onAnswer: (toolCallId: string, answers: HitlAnswer[]) => Promise<void>;
  onApprove: (approvalId: string, workspaceId?: string) => Promise<void>;
  onDeny: (approvalId: string, reason?: string) => Promise<void>;
  /** Deep-research plan gate (plan §7.4): start / revise / reject the plan card. */
  onPlanDecision: (
    interactionId: string,
    payload: HitlPlanDecision,
  ) => Promise<void>;
};

// Native in-thread HITL (plan §5.3): one unified respond mutation. The card
// callbacks carry the pendingInteractions row id as toolCallId/approvalId (see
// uiHitlMessageFromInteraction); the mutation records the response and forwards
// the resume to the agent service when the run is interrupted — no client-side
// resume step.
export function useHitlResume(): HitlActions {
  const respond = useConvexMutationFn(api.agent.interactions.respond);

  const onAnswer = async (toolCallId: string, answers: HitlAnswer[]) => {
    await respond({
      interactionId: toolCallId as never,
      response: { kind: "answers", answers },
    });
  };
  const onApprove = async (approvalId: string, workspaceId?: string) => {
    await respond({
      interactionId: approvalId as never,
      response: {
        kind: "approval",
        approved: true,
        ...(workspaceId ? { workspaceId } : {}),
      },
    });
  };
  const onDeny = async (approvalId: string, reason?: string) => {
    await respond({
      interactionId: approvalId as never,
      response: { kind: "approval", approved: false, ...(reason ? { note: reason } : {}) },
    });
  };
  const onPlanDecision = async (
    interactionId: string,
    payload: HitlPlanDecision,
  ) => {
    await respond({
      interactionId: interactionId as never,
      response: { kind: "plan_decision", ...payload },
    });
  };

  return { onAnswer, onApprove, onDeny, onPlanDecision };
}
