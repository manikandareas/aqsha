import { generateObject, type LanguageModel } from "ai";
import {
  researchDecisionSchema,
  researchPlanSchema,
  type ResearchDecision,
  type ResearchPlan,
} from "./contracts";

type DeepResearchStructuredSchema = typeof researchPlanSchema | typeof researchDecisionSchema;

type GenerateObjectFn = (
  options: GenerateObjectOptions,
) => Promise<{ object: unknown }>;

type GenerateObjectOptions = {
  model: LanguageModel;
  prompt: string;
  schema: DeepResearchStructuredSchema;
  schemaName: string;
  schemaDescription: string;
  maxRetries?: number;
};

export type GenerateResearchPlanObjectInput = {
  model: LanguageModel;
  prompt: string;
  generateObject?: GenerateObjectFn;
};

const defaultGenerateObject: GenerateObjectFn = async (options) => {
  const result = await generateObject(options);

  return { object: result.object };
};

export type GenerateResearchDecisionObjectInput = {
  model: LanguageModel;
  prompt: string;
  generateObject?: GenerateObjectFn;
};

export async function generateResearchPlanObject({
  model,
  prompt,
  generateObject: generateStructuredObject = defaultGenerateObject,
}: GenerateResearchPlanObjectInput): Promise<ResearchPlan> {
  const result = await generateStructuredObject({
    model,
    prompt,
    schema: researchPlanSchema,
    schemaName: "ResearchPlan",
    schemaDescription:
      "A minimal Deep Research plan created after scoping and before main source discovery.",
    maxRetries: 1,
  });

  return result.object as ResearchPlan;
}

export async function generateResearchDecisionObject({
  model,
  prompt,
  generateObject: generateStructuredObject = defaultGenerateObject,
}: GenerateResearchDecisionObjectInput): Promise<ResearchDecision> {
  const result = await generateStructuredObject({
    model,
    prompt,
    schema: researchDecisionSchema,
    schemaName: "ResearchDecision",
    schemaDescription:
      "A Deep Research gate that decides whether the run proceeds, refines within scope, or pivots with user confirmation.",
    maxRetries: 1,
  });

  return result.object as ResearchDecision;
}
