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

// HITL interaction broker. Every HITL request (askUser AND tool approvals)
// interrupts the run immediately: the question/approval becomes the turn's
// final response and the run stops at `waiting_hitl`. The user's reply arrives
// later via interactions.respond → resume (which re-primes a gated tool so it
// executes on retry). There is no hold-window — HITL is always conversational.

export type ApprovalOutcome =
  | { outcome: "allow"; interaction: PendingInteraction }
  | { outcome: "deny"; interaction: PendingInteraction; message: string }
  | { outcome: "interrupt"; interaction: PendingInteraction };

export type RunInterruptState = {
  /** Set when askUser or an approval fired; the run loop interrupts. */
  pendingInteractionId?: string;
  reason?: "ask_user" | "approval" | "plan_review";
};

export class InteractionBroker {
  private interruptStates = new Map<string, RunInterruptState>();
  private interruptRequests = new Map<string, () => void>();
  /** One-shot approvals carried into a resume turn (timeout → respond → resume). */
  private primedApprovals = new Map<string, PendingInteraction>();

  constructor(private readonly store: AgentStore) {}

  /**
   * Carry a responded tool_approval into the resume turn: when the model
   * retries the same gated tool, the prior response resolves it immediately
   * instead of opening a fresh hold-window (which would loop the timeout).
   * One-shot: consumed by the first matching canUseTool call.
   */
  primeResolvedApproval(runId: string, interaction: PendingInteraction): void {
    // Only prime a real approve/deny. A `plan_decision` (proposeResearchPlan
    // gate) is NOT an approval the model retries — it is handled by runManager
    // Branch B — so priming it would let takePrimedApproval consume it and
    // silently no-op (plan §4.4 mis-fire fix).
    if (
      interaction.type === "tool_approval" &&
      interaction.response?.kind === "approval"
    ) {
      this.primedApprovals.set(runId, interaction);
    }
  }

  /** Consume a primed approval for this run+tool, if any. */
  private takePrimedApproval(
    runId: string,
    toolName: string,
  ): PendingInteraction | undefined {
    const primed = this.primedApprovals.get(runId);
    if (primed && primed.toolName === toolName) {
      this.primedApprovals.delete(runId);
      return primed;
    }
    return undefined;
  }

  /** Register the interrupt trigger for an executing run (called by runManager). */
  registerRun(runId: string, interrupt: () => void): void {
    this.interruptRequests.set(runId, interrupt);
  }

  unregisterRun(runId: string): void {
    this.interruptRequests.delete(runId);
    this.interruptStates.delete(runId);
    this.primedApprovals.delete(runId);
  }

  interruptState(runId: string): RunInterruptState | undefined {
    return this.interruptStates.get(runId);
  }

  private flagInterrupt(runId: string, state: RunInterruptState): void {
    this.interruptStates.set(runId, state);
    this.interruptRequests.get(runId)?.();
  }

  /**
   * tool_approval flow for a gated tool. On the first pass it creates the
   * pending row and interrupts the run immediately (the approval becomes the
   * turn's response). When the model retries the gated tool on resume, a primed
   * response resolves it in place (allow/deny) without a new interruption.
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
    const primed = this.takePrimedApproval(input.runId, input.toolName);
    if (primed?.response?.kind === "approval") {
      // Resume retry: the original interaction_pending was emitted on the first
      // pass but never paired with an interaction_resolved (the run interrupted).
      // Emit it now (keyed by the SAME interaction id) so the timeline's approval
      // node closes instead of hanging on "waiting_approval".
      await this.store.appendRunEvent({
        runId: input.runId,
        type: "interaction_resolved",
        payload: { interactionId: primed.id, toolName: input.toolName },
      });
      if (primed.response.approved) {
        return { outcome: "allow", interaction: primed };
      }
      return {
        outcome: "deny",
        interaction: primed,
        message: primed.response.note
          ? `The user declined this action: ${primed.response.note}`
          : "The user declined this action.",
      };
    }
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
    // No hold-window: stop the run now and wait for the user's reply, which
    // arrives via interactions.respond → resume. The plan gate uses a distinct
    // reason so the run_status event carries `plan_review` (plan §4.4). Note
    // input.toolName is the LOGICAL name (canUseTool passes it unqualified).
    this.flagInterrupt(input.runId, {
      pendingInteractionId: interaction.id,
      reason:
        input.toolName === "proposeResearchPlan" ? "plan_review" : "approval",
    });
    return { outcome: "interrupt", interaction };
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
      // The approval card may carry a structured workspace pick (Step 3); the
      // user's choice overrides whatever workspace the model proposed.
      const approvedWorkspaceId =
        result.interaction.response?.kind === "approval"
          ? result.interaction.response.workspaceId
          : undefined;
      return {
        behavior: "allow",
        updatedInput: approvedWorkspaceId
          ? { ...toolInput, workspaceId: approvedWorkspaceId }
          : toolInput,
      };
    }
    if (result.outcome === "deny") {
      return { behavior: "deny", message: result.message };
    }
    // outcome === "interrupt": the run is being torn down to wait for the user;
    // deny so the SDK does not execute. The approval survives in the store and
    // the action re-runs on resume.
    return {
      behavior: "deny",
      message:
        "Approval is pending. The turn is paused; it will resume when the user responds.",
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
  // Deep-research plan gate (plan §4.4). A plan_decision must be handled BEFORE
  // the `response.approved` access below — plan_decision has no `approved` field.
  // Only `revise` re-enters the plan phase via this prompt; `start`/`reject` are
  // short-circuited in runManager Branch B and never reach here, so they get
  // safe explicit text rather than falling through to the "declined" template.
  if (response.kind === "plan_decision") {
    if (response.decision === "revise") {
      const instruction = response.revisionInstruction?.trim();
      return `The user reviewed your research plan and requested revisions${
        instruction ? `: ${instruction}` : "."
      }. Revise the sub-questions accordingly, then call proposeResearchPlan again with the updated plan. Do not perform searches.`;
    }
    return response.decision === "start"
      ? "The user approved the research plan. Proceed with the research."
      : "The user rejected the research plan.";
  }
  if (response.approved) {
    const extras = [
      response.workspaceId
        ? `Target workspace id: ${response.workspaceId} (use this workspaceId).`
        : null,
      response.note ? `Note from the user: ${response.note}` : null,
    ].filter(Boolean);
    return `The user approved your pending ${interaction.toolName} request. ${
      extras.length ? `${extras.join(" ")} ` : ""
    }Proceed with the approved action now.`;
  }
  return `The user declined your pending ${interaction.toolName} request${
    response.note ? `: ${response.note}` : ""
  }. Do not retry it; acknowledge briefly and adjust.`;
}
