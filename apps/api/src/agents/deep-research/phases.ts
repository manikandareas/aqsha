import { z } from "zod";

export const deepResearchPhaseNames = [
  "scoping",
  "source_discovery_screening",
  "evidence_extraction",
  "synthesis_support",
  "citation_audit_delivery_gate",
] as const;

export const researchPersonas = [
  "Astra",
  "Vektor",
  "Prism",
  "Quill",
  "Sanctum",
] as const;

export type DeepResearchPhaseName = (typeof deepResearchPhaseNames)[number];
export type ResearchPersona = (typeof researchPersonas)[number];

export type DeepResearchPhaseStep = {
  phase: DeepResearchPhaseName;
  persona: ResearchPersona;
};

export const minimalDeepResearchPhasePath = [
  { phase: "scoping", persona: "Astra" },
  { phase: "source_discovery_screening", persona: "Vektor" },
  { phase: "evidence_extraction", persona: "Prism" },
  { phase: "synthesis_support", persona: "Quill" },
  { phase: "citation_audit_delivery_gate", persona: "Sanctum" },
] as const satisfies readonly DeepResearchPhaseStep[];

const phasePersona = new Map<DeepResearchPhaseName, ResearchPersona>(
  minimalDeepResearchPhasePath.map((step) => [step.phase, step.persona]),
);

const stableIdArraySchema = z.array(z.string().min(1)).default([]);

export const compactPhaseOutputSchema = z
  .object({
    phaseId: z.string().min(1),
    phase: z.enum(deepResearchPhaseNames),
    persona: z.enum(researchPersonas),
    status: z.enum(["completed", "failed", "blocked"]),
    summary: z.string().min(1),
    sourceIds: stableIdArraySchema,
    claimIds: stableIdArraySchema,
    artifactIds: stableIdArraySchema,
    recommendation: z.enum(["proceed", "refine", "pivot"]).optional(),
    userConfirmationRequired: z.boolean().default(false),
    failureSummary: z.string().min(1).optional(),
  })
  .strict()
  .refine((output) => phasePersona.get(output.phase) === output.persona, {
    message: "persona must match phase owner",
    path: ["persona"],
  })
  .refine((output) => output.phaseId === output.phase, {
    message: "phaseId must match phase for v1",
    path: ["phaseId"],
  });

export type CompactPhaseOutput = z.infer<typeof compactPhaseOutputSchema>;
export type CompactPhaseOutputInput = z.input<typeof compactPhaseOutputSchema>;

export type DeepResearchPhaseEvent = {
  type: string;
  scope: "step" | "error";
  status: "running" | "completed" | "failed";
  title: string;
  summary: string;
  agentName: ResearchPersona;
  payload: {
    phaseId: string;
    phase: DeepResearchPhaseName;
    persona: ResearchPersona;
    compactOutput?: CompactPhaseOutput;
  };
};

export type DeepResearchPhaseEventWriter = (
  event: DeepResearchPhaseEvent,
) => Promise<void> | void;

const phaseDisplayNames: Record<DeepResearchPhaseName, string> = {
  scoping: "scoping",
  source_discovery_screening: "source discovery and screening",
  evidence_extraction: "evidence extraction",
  synthesis_support: "synthesis support",
  citation_audit_delivery_gate: "citation audit and delivery gate",
};

export function createDeepResearchPhaseEvents(
  rawOutput: CompactPhaseOutputInput,
): [DeepResearchPhaseEvent, DeepResearchPhaseEvent] {
  const output = compactPhaseOutputSchema.parse(rawOutput);

  return [
    createDeepResearchPhaseStartEvent(output),
    createDeepResearchPhaseEndEvent(output),
  ];
}

export async function recordDeepResearchPhaseOutput(
  rawOutput: CompactPhaseOutputInput,
  writeEvent?: DeepResearchPhaseEventWriter,
): Promise<CompactPhaseOutput> {
  const output = compactPhaseOutputSchema.parse(rawOutput);

  if (writeEvent) {
    for (const event of createDeepResearchPhaseEvents(output)) {
      await writeEvent(event);
    }
  }

  return output;
}

type GenerateCompactPhaseOutputInput = {
  model: unknown;
  prompt: string;
  schema: typeof compactPhaseOutputSchema;
  phase: DeepResearchPhaseName;
  persona: ResearchPersona;
};

type GenerateCompactPhaseOutput = (
  input: GenerateCompactPhaseOutputInput,
) => Promise<CompactPhaseOutputInput>;

export type RunDeepResearchPhaseInput = {
  model: unknown;
  phase: DeepResearchPhaseName;
  task: string;
  context: string;
  sourceIds?: string[];
  claimIds?: string[];
  artifactIds?: string[];
  generateCompactOutput: GenerateCompactPhaseOutput;
};

export type RunMinimalDeepResearchPhasePathInput = {
  model: unknown;
  researchQuestion: string;
  context: string;
  generateCompactOutput: GenerateCompactPhaseOutput;
};

export async function runDeepResearchPhase(
  input: RunDeepResearchPhaseInput,
  writeEvent?: DeepResearchPhaseEventWriter,
): Promise<CompactPhaseOutput> {
  const persona = phasePersona.get(input.phase);

  if (!persona) {
    throw new Error(`Unknown Deep Research phase: ${input.phase}`);
  }

  const phaseId = input.phase;
  if (writeEvent) {
    await writeEvent(createDeepResearchPhaseStartEvent({
      phaseId,
      phase: input.phase,
      persona,
    }));
  }

  const output = await input.generateCompactOutput({
    model: input.model,
    prompt: buildDelegatePrompt(input, persona),
    schema: compactPhaseOutputSchema,
    phase: input.phase,
    persona,
  });

  const compactOutput = compactPhaseOutputSchema.parse(output);
  if (writeEvent) {
    await writeEvent(createDeepResearchPhaseEndEvent(compactOutput));
  }

  return compactOutput;
}

function buildDelegatePrompt(
  input: RunDeepResearchPhaseInput,
  persona: ResearchPersona,
): string {
  return [
    `You are ${persona}, a named Research Sub-agent inside Astra's Deep Research Run.`,
    "Run only your assigned Deep Research Phase with your own compact context window.",
    "Return Compact Phase Output only.",
    "Do not return raw transcript, chain-of-thought, prompt details, or verbose tool logs.",
    `Phase: ${input.phase}`,
    `Task: ${input.task}`,
    `Known source IDs: ${(input.sourceIds ?? []).join(", ") || "none"}`,
    `Known claim IDs: ${(input.claimIds ?? []).join(", ") || "none"}`,
    `Known artifact IDs: ${(input.artifactIds ?? []).join(", ") || "none"}`,
    "Context:",
    input.context,
  ].join("\n\n");
}

export async function runMinimalDeepResearchPhasePath(
  input: RunMinimalDeepResearchPhasePathInput,
  writeEvent?: DeepResearchPhaseEventWriter,
): Promise<CompactPhaseOutput[]> {
  const outputs: CompactPhaseOutput[] = [];

  for (const step of minimalDeepResearchPhasePath) {
    const output = await runDeepResearchPhase(
      {
        model: input.model,
        phase: step.phase,
        task: phaseTasks[step.phase],
        context: buildMinimalPathPhaseContext(input, outputs),
        sourceIds: uniqueFlatMap(outputs, "sourceIds"),
        claimIds: uniqueFlatMap(outputs, "claimIds"),
        artifactIds: uniqueFlatMap(outputs, "artifactIds"),
        generateCompactOutput: input.generateCompactOutput,
      },
      writeEvent,
    );

    outputs.push(output);
  }

  return outputs;
}

const phaseTasks: Record<DeepResearchPhaseName, string> = {
  scoping:
    "Scope the Deep Research Run, clarify the research question, and decide whether the request can proceed.",
  source_discovery_screening:
    "Discover and screen candidate sources. Return kept/rejected source summary and stable Ledger Source IDs.",
  evidence_extraction:
    "Extract evidence, important claims, and contradictions from screened sources.",
  synthesis_support:
    "Draft synthesis support from compact evidence only. Do not write the final user-facing answer.",
  citation_audit_delivery_gate:
    "Audit important claims and decide whether delivery should proceed, refine, or pivot.",
};

function buildMinimalPathPhaseContext(
  input: RunMinimalDeepResearchPhasePathInput,
  previousOutputs: CompactPhaseOutput[],
): string {
  return [
    `Research question: ${input.researchQuestion}`,
    "Initial context:",
    input.context,
    "Previous compact phase outputs:",
    previousOutputs.length > 0
      ? JSON.stringify(previousOutputs, null, 2)
      : "none",
  ].join("\n\n");
}

function uniqueFlatMap(
  outputs: CompactPhaseOutput[],
  key: "sourceIds" | "claimIds" | "artifactIds",
): string[] {
  return [...new Set(outputs.flatMap((output) => output[key]))];
}

function createDeepResearchPhaseStartEvent({
  phaseId,
  phase,
  persona,
}: {
  phaseId: string;
  phase: DeepResearchPhaseName;
  persona: ResearchPersona;
}): DeepResearchPhaseEvent {
  const displayName = phaseDisplayNames[phase];

  return {
    type: "deep_research_phase_started",
    scope: "step",
    status: "running",
    title: `${persona} started ${displayName}`,
    summary: `${persona} started ${displayName}.`,
    agentName: persona,
    payload: {
      phaseId,
      phase,
      persona,
    },
  };
}

function createDeepResearchPhaseEndEvent(
  output: CompactPhaseOutput,
): DeepResearchPhaseEvent {
  const displayName = phaseDisplayNames[output.phase];
  const statusType =
    output.status === "completed"
      ? "completed"
      : output.status === "blocked"
        ? "blocked"
        : "failed";
  const eventStatus = output.status === "completed" ? "completed" : "failed";
  const eventScope = output.status === "completed" ? "step" : "error";

  return {
    type: `deep_research_phase_${statusType}`,
    scope: eventScope,
    status: eventStatus,
    title: `${output.persona} ${statusType} ${displayName}`,
    summary: output.summary,
    agentName: output.persona,
    payload: {
      phaseId: output.phaseId,
      phase: output.phase,
      persona: output.persona,
      compactOutput: output,
    },
  };
}
