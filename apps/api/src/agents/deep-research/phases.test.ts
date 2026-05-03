import { describe, expect, test } from "bun:test";

import {
  compactPhaseOutputSchema,
  createDeepResearchPhaseEvents,
  minimalDeepResearchPhasePath,
  recordDeepResearchPhaseOutput,
  runDeepResearchPhase,
  runMinimalDeepResearchPhasePath,
} from "./phases";

describe("Deep Research phased orchestration", () => {
  test("defines the issue #21 minimal path as five linear named-persona phases", () => {
    expect(minimalDeepResearchPhasePath).toEqual([
      { phase: "scoping", persona: "Astra" },
      { phase: "source_discovery_screening", persona: "Vektor" },
      { phase: "evidence_extraction", persona: "Prism" },
      { phase: "synthesis_support", persona: "Quill" },
      { phase: "citation_audit_delivery_gate", persona: "Sanctum" },
    ]);
  });

  test("accepts compact phase output while rejecting raw transcript handoff", () => {
    const output = compactPhaseOutputSchema.parse({
      phaseId: "source_discovery_screening",
      phase: "source_discovery_screening",
      persona: "Vektor",
      status: "completed",
      summary: "Screened 12 sources, kept 5 credible sources, rejected 7 weak sources.",
      sourceIds: ["S1", "S2"],
      claimIds: [],
      artifactIds: [],
      recommendation: "proceed",
      userConfirmationRequired: false,
    });

    expect(output.sourceIds).toEqual(["S1", "S2"]);

    expect(() =>
      compactPhaseOutputSchema.parse({
        ...output,
        rawTranscript: "hidden sub-agent transcript must not enter parent context",
      }),
    ).toThrow();

    expect(() =>
      compactPhaseOutputSchema.parse({
        ...output,
        persona: "Prism",
      }),
    ).toThrow();

    expect(() =>
      compactPhaseOutputSchema.parse({
        ...output,
        phaseId: "vektor-custom-id",
      }),
    ).toThrow();
  });

  test("creates persisted Research Trail events from compact phase output", () => {
    const events = createDeepResearchPhaseEvents({
      phaseId: "citation_audit_delivery_gate",
      phase: "citation_audit_delivery_gate",
      persona: "Sanctum",
      status: "blocked",
      summary: "Blocked delivery because claim C2 lacks verified evidence.",
      sourceIds: ["S2"],
      claimIds: ["C2"],
      artifactIds: [],
      recommendation: "refine",
      userConfirmationRequired: false,
      failureSummary: "Claim C2 needs stronger evidence before final delivery.",
    });

    expect(events[0]).toMatchObject({
      type: "deep_research_phase_started",
      scope: "step",
      status: "running",
      title: "Sanctum started citation audit and delivery gate",
      agentName: "Sanctum",
    });
    expect(events[1]).toMatchObject({
      type: "deep_research_phase_blocked",
      scope: "error",
      status: "failed",
      title: "Sanctum blocked citation audit and delivery gate",
      summary: "Blocked delivery because claim C2 lacks verified evidence.",
      agentName: "Sanctum",
    });
    expect(events[1]?.payload.compactOutput).toMatchObject({
      phaseId: "citation_audit_delivery_gate",
      claimIds: ["C2"],
      failureSummary: "Claim C2 needs stronger evidence before final delivery.",
    });

    expect(JSON.stringify(events)).not.toContain("rawTranscript");
  });

  test("records phase events and returns compact output for Astra parent context", async () => {
    const persisted: unknown[] = [];

    const output = await recordDeepResearchPhaseOutput(
      {
        phaseId: "synthesis_support",
        phase: "synthesis_support",
        persona: "Quill",
        status: "completed",
        summary: "Drafted synthesis from claims C1 and C2 without writing final answer.",
        sourceIds: ["S1", "S2"],
        claimIds: ["C1", "C2"],
        artifactIds: [],
        recommendation: "proceed",
      },
      async (event) => {
        persisted.push(event);
      },
    );

    expect(output).toEqual({
      phaseId: "synthesis_support",
      phase: "synthesis_support",
      persona: "Quill",
      status: "completed",
      summary: "Drafted synthesis from claims C1 and C2 without writing final answer.",
      sourceIds: ["S1", "S2"],
      claimIds: ["C1", "C2"],
      artifactIds: [],
      recommendation: "proceed",
      userConfirmationRequired: false,
    });
    expect(persisted).toHaveLength(2);
    expect(JSON.stringify(persisted)).not.toContain("full transcript");
  });

  test("runs a phase through a fresh delegate call before persisting compact events", async () => {
    const persisted: unknown[] = [];
    const delegatePrompts: string[] = [];
    const persistedCountBeforeDelegate: number[] = [];

    const output = await runDeepResearchPhase(
      {
        model: "fake-model",
        phase: "evidence_extraction",
        task: "Extract supported claims from screened source summaries.",
        context: "S1: peer-reviewed study. S2: product documentation.",
        sourceIds: ["S1", "S2"],
        claimIds: [],
        artifactIds: [],
        generateCompactOutput: async ({ prompt }) => {
          delegatePrompts.push(prompt);
          persistedCountBeforeDelegate.push(persisted.length);

          return {
            phaseId: "evidence_extraction",
            phase: "evidence_extraction",
            persona: "Prism",
            status: "completed",
            summary: "Extracted claims C1 and C2 from S1 and S2.",
            sourceIds: ["S1", "S2"],
            claimIds: ["C1", "C2"],
            artifactIds: [],
            recommendation: "proceed",
          };
        },
      },
      async (event) => {
        persisted.push(event);
      },
    );

    expect(output).toMatchObject({
      phase: "evidence_extraction",
      persona: "Prism",
      claimIds: ["C1", "C2"],
    });
    expect(delegatePrompts).toHaveLength(1);
    expect(delegatePrompts[0]).toContain("You are Prism");
    expect(delegatePrompts[0]).toContain("Do not return raw transcript");
    expect(persistedCountBeforeDelegate).toEqual([1]);
    expect(persisted).toHaveLength(2);
    expect(persisted[0]).toMatchObject({
      type: "deep_research_phase_started",
    });
  });

  test("executes the full issue #21 minimal path linearly with compact handoff only", async () => {
    const persisted: unknown[] = [];
    const prompts: string[] = [];
    const phases: string[] = [];

    const outputs = await runMinimalDeepResearchPhasePath(
      {
        model: "fake-model",
        researchQuestion: "How should students use evidence-aware AI for thesis writing?",
        context: "Initial user request and scoped constraints.",
        generateCompactOutput: async ({ prompt, phase, persona }) => {
          prompts.push(prompt);
          phases.push(phase);

          return {
            phaseId: phase,
            phase,
            persona,
            status: "completed",
            summary: `${persona} completed ${phase}.`,
            sourceIds: phase === "scoping" ? [] : ["S1"],
            claimIds: phase === "evidence_extraction" ? ["C1"] : [],
            artifactIds: [],
            recommendation: "proceed",
          };
        },
      },
      async (event) => {
        persisted.push(event);
      },
    );

    expect(phases).toEqual([
      "scoping",
      "source_discovery_screening",
      "evidence_extraction",
      "synthesis_support",
      "citation_audit_delivery_gate",
    ]);
    expect(outputs).toHaveLength(5);
    expect(persisted).toHaveLength(10);
    expect(prompts[1]).toContain("Previous compact phase outputs");
    expect(JSON.stringify(prompts)).not.toContain("rawTranscript");
  });
});
