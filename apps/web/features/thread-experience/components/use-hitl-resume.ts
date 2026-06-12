"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@aqsha/convex/api";
import { isSdkBackend } from "@/lib/agent-backend";
import { useConvexMutationFn } from "@/lib/convex-query";
import { toWorkspaceId } from "@/lib/convex-refs";

export type HitlAnswer = {
  prompt: string;
  selectedOptionIds?: string[];
  customAnswer?: string;
  skipped?: boolean;
};

export type HitlActions = {
  onAnswer: (toolCallId: string, answers: HitlAnswer[]) => Promise<void>;
  onApprove: (approvalId: string, workspaceId?: string) => Promise<void>;
  onDeny: (approvalId: string, reason?: string) => Promise<void>;
};

// Drives native HITL resolution from the client. The record mutations only
// persist a decision and return its messageId; generation resumes once EVERY
// pending tool call on the step is resolved (so the component does not auto-deny
// siblings). We track the last resolved messageId and fire resumeHitl when the
// derived `hasPending` flips to false — mirroring the component's reference UI.
export function useHitlResume(
  threadId: string | undefined,
  hasPending: boolean,
): HitlActions {
  const answerAskUser = useConvexMutationFn(api.agent.hitl.hitlResume.answerAskUser);
  const approveTool = useConvexMutationFn(api.agent.hitl.hitlResume.approveTool);
  const denyTool = useConvexMutationFn(api.agent.hitl.hitlResume.denyTool);
  const resumeHitl = useConvexMutationFn(api.agent.hitl.hitlResume.resumeHitl);
  // SDK backend (plan §5.3): one unified respond mutation. The card callbacks
  // already carry the pendingInteractions row id as toolCallId/approvalId
  // (see uiHitlMessageFromInteraction), and the mutation forwards the resume
  // to the service when the run is interrupted — no client-side resume step.
  const respondV2 = useConvexMutationFn(api.agent.v2.interactions.respond);

  const onAnswerV2 = useCallback(
    async (toolCallId: string, answers: HitlAnswer[]) => {
      await respondV2({
        interactionId: toolCallId as never,
        response: { kind: "answers", answers },
      });
    },
    [respondV2],
  );
  const onApproveV2 = useCallback(
    async (approvalId: string, workspaceId?: string) => {
      await respondV2({
        interactionId: approvalId as never,
        response: {
          kind: "approval",
          approved: true,
          // Step-2 interim: the workspace pick rides along as a note until the
          // service consumes it as a structured field (Step 3).
          ...(workspaceId ? { note: `workspaceId:${workspaceId}` } : {}),
        },
      });
    },
    [respondV2],
  );
  const onDenyV2 = useCallback(
    async (approvalId: string, reason?: string) => {
      await respondV2({
        interactionId: approvalId as never,
        response: { kind: "approval", approved: false, ...(reason ? { note: reason } : {}) },
      });
    },
    [respondV2],
  );

  const lastMessageIdRef = useRef<string | null>(null);
  const pendingResumeRef = useRef(false);

  const record = (messageId: string | undefined) => {
    if (messageId) lastMessageIdRef.current = messageId;
    pendingResumeRef.current = true;
  };

  const onAnswer = useCallback(
    async (toolCallId: string, answers: HitlAnswer[]) => {
      if (!threadId) return;
      const result = await answerAskUser({ threadId, toolCallId, answers });
      record((result as { messageId?: string }).messageId);
    },
    [answerAskUser, threadId],
  );

  const onApprove = useCallback(
    async (approvalId: string, workspaceId?: string) => {
      if (!threadId) return;
      const result = await approveTool({
        threadId,
        approvalId,
        ...(workspaceId ? { workspaceId: toWorkspaceId(workspaceId) } : {}),
      });
      record((result as { messageId?: string }).messageId);
    },
    [approveTool, threadId],
  );

  const onDeny = useCallback(
    async (approvalId: string, reason?: string) => {
      if (!threadId) return;
      const result = await denyTool({
        threadId,
        approvalId,
        ...(reason ? { reason } : {}),
      });
      record((result as { messageId?: string }).messageId);
    },
    [denyTool, threadId],
  );

  useEffect(() => {
    if (!threadId || hasPending || !pendingResumeRef.current) return;
    const messageId = lastMessageIdRef.current;
    if (!messageId) return;
    pendingResumeRef.current = false;
    lastMessageIdRef.current = null;
    void resumeHitl({ threadId, promptMessageId: messageId });
  }, [hasPending, threadId, resumeHitl]);

  if (isSdkBackend) {
    return { onAnswer: onAnswerV2, onApprove: onApproveV2, onDeny: onDenyV2 };
  }
  return { onAnswer, onApprove, onDeny };
}
