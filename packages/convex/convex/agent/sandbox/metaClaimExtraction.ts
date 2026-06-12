// LLM extraction of study-level effect-size data for meta-analysis. Like the
// GRIM/power extraction, the numbers live scattered in the paper's tables/prose;
// a cheap model pulls them out and pure normalizers sanitize the result so
// malformed values never reach metaanalysis.R. Effect-size data arriving IN the
// artifact (not via download) is why meta-analysis needs NO sandbox egress.
// Extraction is best-effort: on any failure it returns no studies and the run
// surfaces `insufficient_studies`.

import { generateObject } from "ai";
import { z } from "zod";
import { CHAT_LITE_MODEL } from "../models";
import { chatProvider } from "../providers/providers";

const MAX_EXTRACTION_CHARS = 60_000;
const MAX_STUDIES = 100;

// One study row. Effect size is supplied one of three ways (priority order in the
// R script): pre-computed (yi + vi|sei), two-group means (SMD), or two-group
// binary counts (log OR). All numeric fields optional — the R script computes yi
// from whatever is present and drops rows it cannot compute.
export interface MetaStudy {
  label: string;
  yi?: number;
  vi?: number;
  sei?: number;
  mean1?: number;
  sd1?: number;
  n1?: number;
  mean2?: number;
  sd2?: number;
  n2?: number;
  events1?: number;
  events2?: number;
}

const studySchema = z.object({
  label: z.string(),
  yi: z.number().nullable().optional(),
  vi: z.number().nullable().optional(),
  sei: z.number().nullable().optional(),
  mean1: z.number().nullable().optional(),
  sd1: z.number().nullable().optional(),
  n1: z.number().nullable().optional(),
  mean2: z.number().nullable().optional(),
  sd2: z.number().nullable().optional(),
  n2: z.number().nullable().optional(),
  events1: z.number().nullable().optional(),
  events2: z.number().nullable().optional(),
});

const extractionSchema = z.object({ studies: z.array(studySchema) });

export type RawMetaExtraction = z.infer<typeof extractionSchema>;

function finite(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positive(value: number | null | undefined): number | undefined {
  const n = finite(value);
  return n != null && n > 0 ? n : undefined;
}

// A study is usable when at least one effect-size form is fully present.
function hasComputableEffect(study: MetaStudy): boolean {
  const precomputed =
    study.yi != null && (study.vi != null || study.sei != null);
  const smd =
    study.mean1 != null &&
    study.sd1 != null &&
    study.n1 != null &&
    study.mean2 != null &&
    study.sd2 != null &&
    study.n2 != null;
  const binary =
    study.events1 != null &&
    study.n1 != null &&
    study.events2 != null &&
    study.n2 != null;
  return precomputed || smd || binary;
}

export function normalizeMetaStudies(raw: RawMetaExtraction): MetaStudy[] {
  const studies: MetaStudy[] = [];
  for (const item of raw.studies) {
    const study: MetaStudy = {
      label: item.label.trim() || "(unlabeled)",
      yi: finite(item.yi),
      vi: positive(item.vi),
      sei: positive(item.sei),
      mean1: finite(item.mean1),
      sd1: positive(item.sd1),
      n1: positive(item.n1),
      mean2: finite(item.mean2),
      sd2: positive(item.sd2),
      n2: positive(item.n2),
      events1: finite(item.events1),
      events2: finite(item.events2),
    };
    if (!hasComputableEffect(study)) continue;
    studies.push(study);
    if (studies.length >= MAX_STUDIES) break;
  }
  return studies;
}

const EXTRACTION_INSTRUCTION = [
  "You extract study-level effect-size data from a research paper / systematic review for a meta-analysis. Extract ONLY values explicitly reported; never invent or infer numbers. If the paper does not report per-study quantitative results suitable for pooling, return an empty array.",
  "",
  "For each included study, provide a short label and ITS effect-size data in ONE of these forms (prefer the first that is fully reported):",
  "  1. Pre-computed: yi (the effect size, e.g. Hedges' g / log OR) AND vi (sampling variance) OR sei (standard error).",
  "  2. Two-group continuous: mean1, sd1, n1 (group 1) and mean2, sd2, n2 (group 2).",
  "  3. Two-group binary: events1, n1 (group 1) and events2, n2 (group 2).",
  "Only include a study when one of these forms is COMPLETE. Omit partial rows.",
].join("\n");

export async function extractMetaStudies(text: string): Promise<MetaStudy[]> {
  const trimmed = text.slice(0, MAX_EXTRACTION_CHARS);
  try {
    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      schema: extractionSchema,
      prompt: [EXTRACTION_INSTRUCTION, "", "Paper text:", trimmed].join("\n"),
    });
    return normalizeMetaStudies(result.object);
  } catch {
    return [];
  }
}
