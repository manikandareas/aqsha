import { z } from "zod";

// Durable deep-research orchestration (plan §5.5, §9.4 Step 4). A /deep run is
// executed as a sequence of isolated query() phases; each phase persists its
// output to the store before the next starts, so a service restart (or a
// failed-run retry) replays only the missing phases.

export const DEEP_PHASES = [
  "plan",
  "literature",
  "counter_evidence",
  "citation_verify",
  "write",
] as const;

export const deepPhaseSchema = z.enum(DEEP_PHASES);
export type DeepPhase = z.infer<typeof deepPhaseSchema>;

export const researchPhaseStatusSchema = z.enum(["running", "done", "failed"]);
export type ResearchPhaseStatus = z.infer<typeof researchPhaseStatusSchema>;

export const researchPhaseStateSchema = z.object({
  runId: z.string().min(1),
  phase: deepPhaseSchema,
  status: researchPhaseStatusSchema,
  /** Final text the phase produced (the next phase's input context). */
  output: z.string().optional(),
  /** Per-phase SDK session id — used to resume a phase interrupted by HITL. */
  sdkSessionId: z.string().optional(),
  /** Cost of this phase's query() calls, summed into the run on finalize. */
  costUsd: z.number().nonnegative().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ResearchPhaseState = z.infer<typeof researchPhaseStateSchema>;
