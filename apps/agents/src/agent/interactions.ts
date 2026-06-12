import type {
  AskUserQuestion,
  InteractionResponse,
  PendingInteraction,
} from "@aqsha/agent-contracts";
import type { AgentStore } from "../store/types";
import {
  APPROVAL_GATED_TOOL_NAME_SET,
  logicalToolName,
} from "./toolPolicy";

// HITL interaction broker (plan §5.3). Implements the hybrid hold-window:
// canUseTool creates a pendingInteractions row and waits up to ~45s for the
// user; a fast response resolves in place (allow/deny, no interrupt), a slow
// one flags the run for interrupt and the response later resumes the session.

export type ApprovalOutcome =
  | { outcome: "allow"; interaction: PendingInteraction }
  | { outcome: "deny"; interaction: PendingInteraction; message: string }
  | { outcome: "timeout"; interaction: PendingInteraction };

export type RunInterruptState = {
  /** Set when a hold-window expired or askUser fired; the run loop interrupts. */
  pendingInteractionId?: string;
  reason?: "ask_user" | "approval_timeout";
};

export class InteractionBroker {
  private interruptStates = new Map<string, RunInterruptState>();
  private interruptRequests = new Map<string, () => void>();

  constructor(
    private readonly store: AgentStore,
    private readonly holdWindowMs: number,
  ) {}

  /** Register the interrupt trigger for an executing run (called by runManager). */
  registerRun(runId: string, interrupt: () => void): void {
    this.interruptRequests.set(runId, interrupt);
  }

  unregisterRun(runId: string): void {
    this.interruptRequests.delete(runId);
    this.interruptStates.delete(runId);
  }

  interruptState(runId: string): RunInterruptState | undefined {
    return this.interruptStates.get(runId);
  }

  private flagInterrupt(runId: string, state: RunInterruptState): void {
    this.interruptStates.set(runId, state);
    this.interruptRequests.get(runId)?.();
  }

  /**
   * tool_approval flow for a gated tool. Creates the pending row, waits the
   * hold window; timeout interrupts the run and reports `timeout`.
   */
  async requestApproval(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    toolName: string;
    toolUseId?: string;
    payload: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<ApprovalOutcome> {
    const interaction = await this.store.createInteraction({
      ownerUserId: input.ownerUserId,
      threadId: input.threadId,
      runId: input.runId,
      type: "tool_approval",
      toolName: input.toolName,
      toolUseId: input.toolUseId,
      payload: input.payload,
    });
    await this.store.appendRunEvent({
      runId: input.runId,
      type: "interaction_pending",
      payload: { interactionId: interaction.id, toolName: input.toolName },
    });

    const responded = await this.store.waitForResponse(
      interaction.id,
      this.holdWindowMs,
      input.signal,
    );

    if (!responded) {
      this.flagInterrupt(input.runId, {
        pendingInteractionId: interaction.id,
        reason: "approval_timeout",
      });
      return { outcome: "timeout", interaction };
    }

    await this.store.appendRunEvent({
      runId: input.runId,
      type: "interaction_resolved",
      payload: { interactionId: interaction.id, toolName: input.toolName },
    });

    if (responded.response?.kind === "approval" && responded.response.approved) {
      return { outcome: "allow", interaction: responded };
    }
    const note =
      responded.response?.kind === "approval" ? responded.response.note : undefined;
    return {
      outcome: "deny",
      interaction: responded,
      message: note
        ? `The user declined this action: ${note}`
        : "The user declined this action.",
    };
  }

  /**
   * ask_user flow: persist the question card and interrupt the run; the answer
   * arrives later via interactions.respond → resume.
   */
  async requestAskUser(input: {
    runId: string;
    threadId: string;
    ownerUserId: string;
    toolUseId?: string;
    questions: AskUserQuestion[];
  }): Promise<PendingInteraction> {
    const interaction = await this.store.createInteraction({
      ownerUserId: input.ownerUserId,
      threadId: input.threadId,
      runId: input.runId,
      type: "ask_user",
      toolName: "askUser",
      toolUseId: input.toolUseId,
      payload: { questions: input.questions },
    });
    await this.store.appendRunEvent({
      runId: input.runId,
      type: "interaction_pending",
      payload: { interactionId: interaction.id, toolName: "askUser" },
    });
    this.flagInterrupt(input.runId, {
      pendingInteractionId: interaction.id,
      reason: "ask_user",
    });
    return interaction;
  }
}

export type CanUseToolResult =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> }
  | { behavior: "deny"; message?: string };

/**
 * Build the SDK canUseTool callback for one run: gated aqsha tools go through
 * the approval hold-window; everything else inside the allow-list passes.
 */
export function buildCanUseTool(input: {
  broker: InteractionBroker;
  runId: string;
  threadId: string;
  ownerUserId: string;
}) {
  return async (
    toolName: string,
    toolInput: Record<string, unknown>,
    options?: { signal?: AbortSignal; toolUseID?: string },
  ): Promise<CanUseToolResult> => {
    const logical = logicalToolName(toolName);
    if (!APPROVAL_GATED_TOOL_NAME_SET.has(logical)) {
      return { behavior: "allow", updatedInput: toolInput };
    }
    const result = await input.broker.requestApproval({
      runId: input.runId,
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      toolName: logical,
      toolUseId: options?.toolUseID,
      payload: toolInput,
      signal: options?.signal,
    });
    if (result.outcome === "allow") {
      return { behavior: "allow", updatedInput: toolInput };
    }
    if (result.outcome === "deny") {
      return { behavior: "deny", message: result.message };
    }
    // Hold window elapsed: the run is being interrupted; deny so the SDK does
    // not execute while we tear down. The approval survives in the store and
    // the action re-runs on resume.
    return {
      behavior: "deny",
      message:
        "Approval is still pending. The turn is paused; it will resume when the user responds.",
    };
  };
}

/** Build the prompt text used to resume a session after an interaction. */
export function resumePromptForInteraction(interaction: PendingInteraction): string {
  const response: InteractionResponse | undefined = interaction.response;
  if (!response) {
    return "The user has not responded yet.";
  }
  if (response.kind === "answers") {
    const lines = response.answers.map((answer) => {
      if (answer.skipped) {
        return `- "${answer.prompt}": (skipped)`;
      }
      const parts = [
        answer.selectedOptionIds?.length
          ? `selected: ${answer.selectedOptionIds.join(", ")}`
          : null,
        answer.customAnswer ? `answer: ${answer.customAnswer}` : null,
      ].filter(Boolean);
      return `- "${answer.prompt}": ${parts.join("; ") || "(no answer)"}`;
    });
    return `The user answered your questions:\n${lines.join("\n")}\nContinue the task using these answers.`;
  }
  if (response.approved) {
    return `The user approved your pending ${interaction.toolName} request${
      response.note ? ` with note: ${response.note}` : ""
    }. Proceed with the approved action now.`;
  }
  return `The user declined your pending ${interaction.toolName} request${
    response.note ? `: ${response.note}` : ""
  }. Do not retry it; acknowledge briefly and adjust.`;
}
