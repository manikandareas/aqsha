import { describe, expect, it } from "vitest";
import {
  commandDescriptorSchema,
  interactionResponseSchema,
  isActiveRunStatus,
  isApproved,
  parseResearchPlanPayload,
  pendingInteractionSchema,
  renderResearchPlanMarkdown,
  researchPlanPayloadSchema,
  runRequestSchema,
  sourceCandidateSchema,
} from "../src/index";

describe("runRequestSchema", () => {
  it("applies defaults for mode and contextRefs", () => {
    const parsed = runRequestSchema.parse({
      runId: "run_1",
      threadId: "thr_1",
      ownerUserId: "user_1",
      agentKind: "lite",
      prompt: "Halo Astra",
    });
    expect(parsed.mode).toBe("normal");
    expect(parsed.contextRefs).toEqual({ artifactIds: [], workspaceIds: [] });
  });

  it("rejects an empty prompt and unknown agent kind", () => {
    expect(() =>
      runRequestSchema.parse({
        runId: "r",
        threadId: "t",
        ownerUserId: "u",
        agentKind: "mega",
        prompt: "x",
      }),
    ).toThrow();
    expect(() =>
      runRequestSchema.parse({
        runId: "r",
        threadId: "t",
        ownerUserId: "u",
        agentKind: "lite",
        prompt: "",
      }),
    ).toThrow();
  });
});

describe("run status", () => {
  it("classifies active statuses", () => {
    expect(isActiveRunStatus("queued")).toBe(true);
    expect(isActiveRunStatus("waiting_hitl")).toBe(true);
    expect(isActiveRunStatus("completed")).toBe(false);
    expect(isActiveRunStatus("canceled")).toBe(false);
  });
});

describe("interactions", () => {
  const base = {
    id: "int_1",
    ownerUserId: "user_1",
    threadId: "thr_1",
    runId: "run_1",
    type: "tool_approval" as const,
    toolName: "proposeArtifact",
    payload: {},
    status: "responded" as const,
    createdAt: 1,
  };

  it("accepts an approval response and detects approval", () => {
    const interaction = pendingInteractionSchema.parse({
      ...base,
      response: { kind: "approval", approved: true },
    });
    expect(isApproved(interaction)).toBe(true);
  });

  it("a denial or pending row is not approved", () => {
    const denied = pendingInteractionSchema.parse({
      ...base,
      response: { kind: "approval", approved: false },
    });
    expect(isApproved(denied)).toBe(false);
    const pending = pendingInteractionSchema.parse({
      ...base,
      status: "pending",
    });
    expect(isApproved(pending)).toBe(false);
  });

  it("validates ask_user answers", () => {
    const response = interactionResponseSchema.parse({
      kind: "answers",
      answers: [{ prompt: "Pilih fokus", selectedOptionIds: ["a"] }],
    });
    expect(response.kind).toBe("answers");
    expect(() =>
      interactionResponseSchema.parse({ kind: "answers", answers: [] }),
    ).toThrow();
  });

  it("accepts the three plan_decision variants", () => {
    for (const decision of ["start", "revise", "reject"] as const) {
      const response = interactionResponseSchema.parse({
        kind: "plan_decision",
        decision,
      });
      expect(response.kind).toBe("plan_decision");
      if (response.kind === "plan_decision") {
        expect(response.decision).toBe(decision);
      }
    }
    const start = interactionResponseSchema.parse({
      kind: "plan_decision",
      decision: "start",
      editedPlan: "## Rencana\n\n1. a",
    });
    expect(start.kind === "plan_decision" && start.editedPlan).toBeTruthy();
    const revise = interactionResponseSchema.parse({
      kind: "plan_decision",
      decision: "revise",
      revisionInstruction: "fokuskan ke 2023",
    });
    expect(
      revise.kind === "plan_decision" && revise.revisionInstruction,
    ).toBeTruthy();
  });

  it("rejects an unknown plan_decision decision", () => {
    expect(() =>
      interactionResponseSchema.parse({ kind: "plan_decision", decision: "go" }),
    ).toThrow();
  });
});

describe("researchPlanPayloadSchema", () => {
  const validPlan = {
    title: "Dampak AI pada pendidikan",
    summary: "Tinjauan lintas studi.",
    questions: ["Apa bukti utama?", "Apa keterbatasannya?", "Bagaimana konteksnya?"],
  };

  it("parses a well-formed plan and bounds questions to 1–8", () => {
    expect(researchPlanPayloadSchema.parse(validPlan).questions).toHaveLength(3);
    expect(() =>
      researchPlanPayloadSchema.parse({ ...validPlan, questions: [] }),
    ).toThrow();
    expect(() =>
      researchPlanPayloadSchema.parse({
        ...validPlan,
        questions: Array.from({ length: 9 }, (_, i) => `q${i}`),
      }),
    ).toThrow();
  });

  it("parseResearchPlanPayload falls back gracefully on garbage", () => {
    expect(parseResearchPlanPayload(validPlan)).toEqual(validPlan);
    expect(parseResearchPlanPayload(null)).toEqual({
      title: "Rencana riset",
      questions: [],
    });
    expect(parseResearchPlanPayload({ title: "", questions: ["x"] })).toEqual({
      title: "Rencana riset",
      questions: [],
    });
  });

  it("renderResearchPlanMarkdown emits a stable, parseable shape", () => {
    const md = renderResearchPlanMarkdown(validPlan);
    expect(md).toBe(
      "## Dampak AI pada pendidikan\n\nTinjauan lintas studi.\n\n1. Apa bukti utama?\n2. Apa keterbatasannya?\n3. Bagaimana konteksnya?",
    );
    // summary is optional — omitting it drops the block, not the structure.
    expect(
      renderResearchPlanMarkdown({ title: "T", questions: ["a"] }),
    ).toBe("## T\n\n1. a");
  });
});

describe("commandDescriptorSchema", () => {
  it("accepts kebab-case names and defaults interceptedByService", () => {
    const parsed = commandDescriptorSchema.parse({
      name: "verify-citations",
      description: "Verify a document bibliography",
      scope: "skill",
    });
    expect(parsed.interceptedByService).toBe(false);
  });

  it("rejects names with slashes or uppercase", () => {
    expect(() =>
      commandDescriptorSchema.parse({
        name: "/deep",
        description: "x",
        scope: "service",
      }),
    ).toThrow();
    expect(() =>
      commandDescriptorSchema.parse({
        name: "Deep",
        description: "x",
        scope: "service",
      }),
    ).toThrow();
  });
});

describe("sourceCandidateSchema", () => {
  it("parses a minimal web candidate", () => {
    const parsed = sourceCandidateSchema.parse({
      citationNumber: 1,
      origin: "web",
      evidenceStrength: "medium",
      title: "A result",
      locator: "https://example.com",
      snippet: "snippet",
    });
    expect(parsed.origin).toBe("web");
  });
});
