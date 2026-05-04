import { z } from "zod";

import {
  artifactManifestSchema,
  evidenceLedgerSchema,
  researchDecisionSchema,
  researchPlanSchema,
  visualSpecSchema,
  type ArtifactManifest,
  type EvidenceLedger,
  type ResearchDecision,
  type ResearchPlan,
  type VisualSpec,
} from "./contracts";
import {
  evaluateDeepResearchDelivery,
  type DeepResearchDeliveryResult,
} from "./delivery";
import {
  compactPhaseOutputSchema,
  runDeepResearchPhase,
  type CompactPhaseOutput,
  type CompactPhaseOutputInput,
  type DeepResearchPhaseName,
  type GenerateCompactPhaseOutput,
  type ResearchPersona,
} from "./phases";
import type { RenderAndPublishVisualArtifactsResult } from "./visual-delivery";

export { functionalDeepResearchPhasePath } from "./phases";

const visualSpecsSchema = z.array(visualSpecSchema);
const finalMarkdownReportSchema = z
  .object({
    finalReportMarkdown: z.string().min(1),
  })
  .strict();

type StructuredSchemaName =
  | "ResearchPlan"
  | "EvidenceLedger"
  | "ResearchDecision"
  | "VisualSpecs"
  | "FinalMarkdownReport";

export type FunctionalDeepResearchEvent = {
  type: string;
  scope: "run" | "step" | "tool" | "error";
  status: "running" | "completed" | "failed";
  title: string;
  summary?: string | null;
  agentName?: string | null;
  toolName?: string | null;
  parentEventId?: string | null;
  payload?: unknown;
};

export type FunctionalDeepResearchEventWriter = (
  event: FunctionalDeepResearchEvent,
) => Promise<void> | void;

export type GenerateFunctionalStructuredOutputInput = {
  model: unknown;
  phase: DeepResearchPhaseName;
  prompt: string;
  schema: z.ZodType<unknown>;
  schemaName: StructuredSchemaName;
  schemaDescription: string;
};

export type GenerateFunctionalStructuredOutput = (
  input: GenerateFunctionalStructuredOutputInput,
) => Promise<unknown>;

export type RunFunctionalDeepResearchInput = {
  model: unknown;
  researchQuestion: string;
  context: string;
  deepResearchSkillContent: string;
  primaryDeliverable?: "report" | "visual";
  generateStructuredOutput: GenerateFunctionalStructuredOutput;
  generateCompactOutput: GenerateCompactPhaseOutput;
  renderAndPublishVisualArtifacts: (input: {
    evidenceLedger: EvidenceLedger;
    visualSpecs: VisualSpec[];
  }) => Promise<RenderAndPublishVisualArtifactsResult>;
};

export type FunctionalDeepResearchCompletedResult = {
  status: "completed";
  runStatus: "completed";
  finalReportMarkdown: string;
  researchPlan: ResearchPlan;
  evidenceLedger: EvidenceLedger;
  researchDecision: ResearchDecision;
  visualSpecs: VisualSpec[];
  artifactManifest: ArtifactManifest;
  compactPhaseOutputs: CompactPhaseOutput[];
};

export type FunctionalDeepResearchFailedResult = {
  status: "failed";
  runStatus: "failed";
  assistantMessage: string;
  researchPlan?: ResearchPlan;
  evidenceLedger?: EvidenceLedger;
  researchDecision?: ResearchDecision;
  visualSpecs?: VisualSpec[];
  artifactManifest?: ArtifactManifest;
  compactPhaseOutputs: CompactPhaseOutput[];
};

export type FunctionalDeepResearchResult =
  | FunctionalDeepResearchCompletedResult
  | FunctionalDeepResearchFailedResult;

export async function runFunctionalDeepResearch(
  input: RunFunctionalDeepResearchInput,
  writeEvent?: FunctionalDeepResearchEventWriter,
): Promise<FunctionalDeepResearchResult> {
  const compactPhaseOutputs: CompactPhaseOutput[] = [];

  const write = async (event: FunctionalDeepResearchEvent) => {
    if (writeEvent) {
      await writeEvent(event);
    }
  };

  const researchPlan = await runStructuredPhase({
    input,
    phase: "research_plan",
    persona: "Astra",
    schemaName: "ResearchPlan",
    schemaDescription:
      "A Functional Deep Research plan created after scoping and before source discovery.",
    schema: researchPlanSchema,
    context: buildBaseContext(input),
    outputKind: "research_plan",
    summarize: (plan) => ({
      summary: `Research Plan recorded for: ${plan.researchQuestion}`,
      sourceIds: [],
      claimIds: [],
      artifactIds: [],
      recommendation: "proceed",
    }),
    write,
  });
  compactPhaseOutputs.push(researchPlan.compactOutput);

  const sourceDiscovery = await runDeepResearchPhase(
    {
      model: input.model,
      phase: "source_discovery_screening",
      task: "Discover and screen sources for the approved Research Plan. Return stable Ledger Source IDs only.",
      context: buildFunctionalContext(input, compactPhaseOutputs, {
        researchPlan: researchPlan.output,
      }),
      generateCompactOutput: input.generateCompactOutput,
    },
    write,
  );
  compactPhaseOutputs.push(sourceDiscovery);

  const evidenceLedger = await runStructuredPhase({
    input,
    phase: "evidence_ledger",
    persona: "Prism",
    schemaName: "EvidenceLedger",
    schemaDescription:
      "An explicit Evidence Ledger with verified sources, important claims, and visual-ready metrics.",
    schema: evidenceLedgerSchema,
    context: buildFunctionalContext(input, compactPhaseOutputs, {
      researchPlan: researchPlan.output,
    }),
    outputKind: "evidence_ledger",
    summarize: (ledger) => ({
      summary: `Evidence Ledger recorded with ${ledger.sources.length} source(s), ${ledger.claims.length} claim(s), and ${ledger.visualMetrics.length} visual metric(s).`,
      sourceIds: ledger.sources.map((source) => source.sourceId),
      claimIds: ledger.claims.map((claim) => claim.claimId),
      artifactIds: [],
      recommendation: "proceed",
    }),
    write,
  });
  compactPhaseOutputs.push(evidenceLedger.compactOutput);

  const synthesisSupport = await runDeepResearchPhase(
    {
      model: input.model,
      phase: "synthesis_support",
      task: "Draft compact synthesis support from the Evidence Ledger only. Do not write the final user-facing report.",
      context: buildFunctionalContext(input, compactPhaseOutputs, {
        researchPlan: researchPlan.output,
        evidenceLedger: evidenceLedger.output,
      }),
      sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
      claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
      generateCompactOutput: input.generateCompactOutput,
    },
    write,
  );
  compactPhaseOutputs.push(synthesisSupport);

  const researchDecision = await runStructuredPhase({
    input,
    phase: "research_decision",
    persona: "Astra",
    schemaName: "ResearchDecision",
    schemaDescription:
      "A Functional Deep Research decision gate that proceeds, refines in scope, or asks for a pivot.",
    schema: researchDecisionSchema,
    context: buildFunctionalContext(input, compactPhaseOutputs, {
      researchPlan: researchPlan.output,
      evidenceLedger: evidenceLedger.output,
    }),
    outputKind: "research_decision",
    summarize: (decision) => ({
      summary: `Research Decision recorded: ${decision.decision}. ${decision.rationaleSummary}`,
      sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
      claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
      artifactIds: [],
      recommendation: decision.decision,
      userConfirmationRequired: decision.userConfirmationRequired,
      failureSummary:
        decision.userConfirmationRequired || decision.decision === "pivot"
          ? decision.nextAction
          : undefined,
    }),
    write,
  });
  compactPhaseOutputs.push(researchDecision.compactOutput);

  if (
    researchDecision.output.userConfirmationRequired ||
    researchDecision.output.decision === "pivot"
  ) {
    return {
      status: "failed",
      runStatus: "failed",
      assistantMessage: [
        "Deep Research needs user confirmation before final delivery.",
        "",
        researchDecision.output.nextAction,
      ].join("\n"),
      researchPlan: researchPlan.output,
      evidenceLedger: evidenceLedger.output,
      researchDecision: researchDecision.output,
      compactPhaseOutputs,
    };
  }

  const visualSpecs = await runStructuredPhase({
    input,
    phase: "visual_specification",
    persona: "Prism",
    schemaName: "VisualSpecs",
    schemaDescription:
      "Visual Specs that only reference verified Evidence Ledger data and safe final-report visual intents.",
    schema: visualSpecsSchema,
    context: buildFunctionalContext(input, compactPhaseOutputs, {
      evidenceLedger: evidenceLedger.output,
    }),
    outputKind: "visual_specification",
    summarize: (specs) => ({
      summary:
        specs.length > 0
          ? `Visual Spec recorded for ${specs.length} candidate visual artifact(s).`
          : "No Visual Spec recorded because the Evidence Ledger did not have safe visual-ready data.",
      sourceIds: uniqueFlatMap(specs, "sourceIds"),
      claimIds: uniqueFlatMap(specs, "claimIds"),
      artifactIds: [],
      recommendation: "proceed",
    }),
    write,
  });
  compactPhaseOutputs.push(visualSpecs.compactOutput);

  const citationAudit = await runDeepResearchPhase(
    {
      model: input.model,
      phase: "citation_audit",
      task: "Audit important claims, Ledger Source IDs, and Visual Spec provenance before delivery.",
      context: buildFunctionalContext(input, compactPhaseOutputs, {
        evidenceLedger: evidenceLedger.output,
        visualSpecs: visualSpecs.output,
      }),
      sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
      claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
      generateCompactOutput: input.generateCompactOutput,
    },
    write,
  );
  compactPhaseOutputs.push(citationAudit);

  let visualDeliveryResult: RenderAndPublishVisualArtifactsResult = {
    status: "completed",
    manifest: artifactManifestSchema.parse({ artifacts: [] }),
    markdown: "",
    events: [],
  };

  const visualDelivery = await runDeepResearchPhase(
    {
      model: input.model,
      phase: "visual_delivery",
      task: "Render and publish audited final visual artifacts or record Visual Omission for the final gate.",
      context: buildFunctionalContext(input, compactPhaseOutputs, {
        evidenceLedger: evidenceLedger.output,
        visualSpecs: visualSpecs.output,
      }),
      sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
      claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
      generateCompactOutput: async ({ phase, persona }) => {
        if (visualSpecs.output.length > 0) {
          visualDeliveryResult = await input.renderAndPublishVisualArtifacts({
            evidenceLedger: evidenceLedger.output,
            visualSpecs: visualSpecs.output,
          });

          for (const event of visualDeliveryResult.events) {
            await write(event);
          }
        }

        return {
          phaseId: phase,
          phase,
          persona,
          status:
            visualDeliveryResult.status === "failed" && input.primaryDeliverable === "visual"
              ? "failed"
              : "completed",
          summary:
            visualDeliveryResult.status === "completed"
              ? "Visual delivery completed for the Artifact Manifest."
              : "Visual delivery produced an omitted artifact for final gate evaluation.",
          sourceIds: uniqueFlatMap(visualSpecs.output, "sourceIds"),
          claimIds: uniqueFlatMap(visualSpecs.output, "claimIds"),
          artifactIds: visualDeliveryResult.manifest.artifacts.map(
            (artifact) => artifact.artifactId,
          ),
          recommendation:
            visualDeliveryResult.status === "failed" && input.primaryDeliverable === "visual"
              ? "refine"
              : "proceed",
          failureSummary:
            visualDeliveryResult.status === "failed"
              ? "Visual artifact delivery failed and was sent to the final gate."
              : undefined,
        } satisfies CompactPhaseOutputInput;
      },
    },
    write,
  );
  compactPhaseOutputs.push(visualDelivery);

  const deliveryResultRef: { current: DeepResearchDeliveryResult | null } = {
    current: null,
  };
  let finalReportMarkdown = "";

  const finalDelivery = await runDeepResearchPhase(
    {
      model: input.model,
      phase: "final_delivery_gate",
      task: "Generate candidate final Markdown and commit final delivery through deterministic evidence and artifact gates.",
      context: buildFunctionalContext(input, compactPhaseOutputs, {
        evidenceLedger: evidenceLedger.output,
        artifactManifest: visualDeliveryResult.manifest,
      }),
      sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
      claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
      artifactIds: visualDeliveryResult.manifest.artifacts.map(
        (artifact) => artifact.artifactId,
      ),
      generateCompactOutput: async ({ prompt, phase, persona }) => {
        const rawFinalReport = await input.generateStructuredOutput({
          model: input.model,
          phase,
          prompt: buildStructuredPrompt(input, prompt),
          schema: finalMarkdownReportSchema,
          schemaName: "FinalMarkdownReport",
          schemaDescription:
            "A clean user-facing Final Markdown Report with inline Ledger Source ID citations and no omitted-visual note.",
        });
        const finalReport = finalMarkdownReportSchema.parse(rawFinalReport);
        await write(
          createStructuredOutputEvent({
            phase,
            persona,
            outputKind: "final_delivery_gate",
            output: finalReport,
          }),
        );

        finalReportMarkdown = appendFinalVisualMarkdown(
          finalReport.finalReportMarkdown,
          visualDeliveryResult.markdown,
        );
        deliveryResultRef.current = evaluateDeepResearchDelivery({
          finalReportMarkdown,
          evidenceLedger: evidenceLedger.output,
          primaryDeliverable: input.primaryDeliverable ?? "report",
          artifacts: visualDeliveryResult.manifest.artifacts.map((artifact) => ({
            status: artifact.status,
            title: artifact.title,
            failureSummary:
              artifact.status === "passed" ? null : artifact.reason,
            developerDetail: artifact.metadata ?? null,
          })),
        });

        for (const event of deliveryResultRef.current.events) {
          await write(event);
        }

        if (deliveryResultRef.current.status === "failed") {
          return {
            phaseId: phase,
            phase,
            persona,
            status: "blocked",
            summary: "Final Delivery Gate blocked the Functional Deep Research Run.",
            sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
            claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
            artifactIds: visualDeliveryResult.manifest.artifacts.map(
              (artifact) => artifact.artifactId,
            ),
            recommendation: "refine",
            failureSummary: deliveryResultRef.current.assistantMessage,
          } satisfies CompactPhaseOutputInput;
        }

        return {
          phaseId: phase,
          phase,
          persona,
          status: "completed",
          summary: "Final Delivery Gate accepted the final Markdown report.",
          sourceIds: evidenceLedger.output.sources.map((source) => source.sourceId),
          claimIds: evidenceLedger.output.claims.map((claim) => claim.claimId),
          artifactIds: visualDeliveryResult.manifest.artifacts.map(
            (artifact) => artifact.artifactId,
          ),
          recommendation: "proceed",
        } satisfies CompactPhaseOutputInput;
      },
    },
    write,
  );
  compactPhaseOutputs.push(finalDelivery);

  const deliveryResult = deliveryResultRef.current;

  if (!deliveryResult) {
    throw new Error("Final Delivery Gate did not produce a delivery result.");
  }

  if (deliveryResult.status === "failed") {
    return {
      status: "failed",
      runStatus: "failed",
      assistantMessage: deliveryResult.assistantMessage,
      researchPlan: researchPlan.output,
      evidenceLedger: evidenceLedger.output,
      researchDecision: researchDecision.output,
      visualSpecs: visualSpecs.output,
      artifactManifest: visualDeliveryResult.manifest,
      compactPhaseOutputs,
    };
  }

  return {
    status: "completed",
    runStatus: "completed",
    finalReportMarkdown: deliveryResult.finalReportMarkdown,
    researchPlan: researchPlan.output,
    evidenceLedger: evidenceLedger.output,
    researchDecision: researchDecision.output,
    visualSpecs: visualSpecs.output,
    artifactManifest: visualDeliveryResult.manifest,
    compactPhaseOutputs,
  };
}

async function runStructuredPhase<Output>({
  input,
  phase,
  persona,
  schemaName,
  schemaDescription,
  schema,
  context,
  outputKind,
  summarize,
  write,
}: {
  input: RunFunctionalDeepResearchInput;
  phase: DeepResearchPhaseName;
  persona: ResearchPersona;
  schemaName: StructuredSchemaName;
  schemaDescription: string;
  schema: z.ZodType<Output>;
  context: string;
  outputKind: string;
  summarize: (output: Output) => Omit<
    CompactPhaseOutputInput,
    "phaseId" | "phase" | "persona" | "status"
  >;
  write: FunctionalDeepResearchEventWriter;
}): Promise<{ output: Output; compactOutput: CompactPhaseOutput }> {
  let structuredOutput: Output | null = null;

  const compactOutput = await runDeepResearchPhase(
    {
      model: input.model,
      phase,
      task: schemaDescription,
      context,
      generateCompactOutput: async ({ prompt }) => {
        const rawOutput = await input.generateStructuredOutput({
          model: input.model,
          phase,
          prompt: buildStructuredPrompt(input, prompt),
          schema,
          schemaName,
          schemaDescription,
        });

        structuredOutput = schema.parse(rawOutput);
        await write(
          createStructuredOutputEvent({
            phase,
            persona,
            outputKind,
            output: structuredOutput,
          }),
        );

        return compactPhaseOutputSchema.parse({
          phaseId: phase,
          phase,
          persona,
          status: "completed",
          ...summarize(structuredOutput),
        });
      },
    },
    write,
  );

  if (!structuredOutput) {
    throw new Error(`Structured output was not generated for phase: ${phase}`);
  }

  return {
    output: structuredOutput,
    compactOutput,
  };
}

function createStructuredOutputEvent({
  phase,
  persona,
  outputKind,
  output,
}: {
  phase: DeepResearchPhaseName;
  persona: ResearchPersona;
  outputKind: string;
  output: unknown;
}): FunctionalDeepResearchEvent {
  return {
    type: "structured_research_output_recorded",
    scope: "step",
    status: "completed",
    title: `${titleize(outputKind)} recorded`,
    summary: `${titleize(outputKind)} recorded for Functional Deep Research.`,
    agentName: persona,
    payload: {
      outputKind,
      phase,
      output,
    },
  };
}

function buildStructuredPrompt(
  input: RunFunctionalDeepResearchInput,
  phasePrompt: string,
): string {
  return [
    phasePrompt,
    "Deep Research Skill playbook:",
    input.deepResearchSkillContent,
    "Return only data that satisfies the requested structured schema.",
  ].join("\n\n");
}

function buildBaseContext(input: RunFunctionalDeepResearchInput): string {
  return [
    `Research question: ${input.researchQuestion}`,
    `Primary deliverable: ${input.primaryDeliverable ?? "report"}`,
    "Initial context:",
    input.context,
  ].join("\n\n");
}

function buildFunctionalContext(
  input: RunFunctionalDeepResearchInput,
  compactPhaseOutputs: CompactPhaseOutput[],
  structuredContext: Record<string, unknown>,
): string {
  return [
    buildBaseContext(input),
    "Previous Compact Phase Outputs:",
    compactPhaseOutputs.length > 0
      ? JSON.stringify(compactPhaseOutputs, null, 2)
      : "none",
    "Structured Research Output available to this phase:",
    JSON.stringify(structuredContext, null, 2),
  ].join("\n\n");
}

function appendFinalVisualMarkdown(
  finalReportMarkdown: string,
  visualMarkdown: string,
): string {
  const report = finalReportMarkdown.trim();
  const visual = visualMarkdown.trim();

  if (!visual || report.includes(visual)) {
    return report;
  }

  return `${report}\n\n${visual}`;
}

function uniqueFlatMap<T extends Record<string, unknown>>(
  values: T[],
  key: keyof T,
): string[] {
  return [
    ...new Set(
      values.flatMap((value) => {
        const field = value[key];

        return Array.isArray(field)
          ? field.filter((item): item is string => typeof item === "string")
          : [];
      }),
    ),
  ];
}

function titleize(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
