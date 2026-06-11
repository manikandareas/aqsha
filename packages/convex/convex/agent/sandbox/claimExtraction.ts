// LLM claim-extraction for the GRIM/GRIMMER and power checks. statcheck runs on
// raw text (no extraction needed), but GRIM needs structured (mean, SD, N,
// items) and power needs (test, N, effect size) — values scattered in prose and
// tables. This module asks a cheap model to extract them, then sanitizes the
// output through pure, unit-tested normalizers so malformed LLM values never
// reach the R scripts. Extraction is best-effort: on any failure it returns no
// claims and the GRIM/power checks are simply skipped (statcheck still runs).

import { generateObject } from "ai";
import { z } from "zod";
import { CHAT_LITE_MODEL } from "../models";
import { chatProvider } from "../providers/providers";
import type { GrimClaim } from "./grimClassify";
import type { PowerClaim, PowerTest } from "./powerClassify";

// Cap the text handed to the extraction model (statcheck still sees the full
// text in the sandbox). Generous enough to cover a typical results section.
const MAX_EXTRACTION_CHARS = 60_000;
const MAX_GRIM_CLAIMS = 40;
const MAX_POWER_CLAIMS = 20;

const POWER_TESTS: PowerTest[] = [
  "t",
  "anova",
  "correlation",
  "proportion",
  "chisq",
];

// Lenient schemas — the model output is sanitized in the normalizers below
// rather than rejected at the generateObject layer (so one bad value does not
// fail the whole extraction).
const grimClaimSchema = z.object({
  label: z.string(),
  mean: z.number(),
  sd: z.number().nullable().optional(),
  n: z.number(),
  items: z.number().nullable().optional(),
});

const powerClaimSchema = z.object({
  label: z.string(),
  test: z.string(),
  n: z.number(),
  effectSize: z.number(),
  alpha: z.number().nullable().optional(),
  tails: z.number().nullable().optional(),
});

const extractionSchema = z.object({
  grimClaims: z.array(grimClaimSchema),
  powerClaims: z.array(powerClaimSchema),
});

export type RawExtraction = z.infer<typeof extractionSchema>;

export interface VerificationClaims {
  grimClaims: GrimClaim[];
  powerClaims: PowerClaim[];
}

function isPositiveInt(value: number): boolean {
  return Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

export function normalizeGrimClaims(
  raw: RawExtraction["grimClaims"],
): GrimClaim[] {
  const claims: GrimClaim[] = [];
  for (const item of raw) {
    const n = Math.round(item.n);
    if (!isPositiveInt(n) || !Number.isFinite(item.mean)) continue;
    const label = item.label.trim() || "(unlabeled)";
    const itemsRaw = item.items == null ? 1 : Math.round(item.items);
    const items = isPositiveInt(itemsRaw) ? itemsRaw : 1;
    const sd =
      item.sd != null && Number.isFinite(item.sd) && item.sd >= 0
        ? item.sd
        : null;
    claims.push({ label, mean: item.mean, sd, n, items });
    if (claims.length >= MAX_GRIM_CLAIMS) break;
  }
  return claims;
}

export function normalizePowerClaims(
  raw: RawExtraction["powerClaims"],
): PowerClaim[] {
  const claims: PowerClaim[] = [];
  for (const item of raw) {
    const n = Math.round(item.n);
    const test = item.test.trim().toLowerCase();
    if (!isPositiveInt(n) || !Number.isFinite(item.effectSize)) continue;
    if (!POWER_TESTS.includes(test as PowerTest)) continue;
    const label = item.label.trim() || "(unlabeled)";
    const alpha =
      item.alpha != null && item.alpha > 0 && item.alpha < 0.5
        ? item.alpha
        : 0.05;
    const tails: 1 | 2 = item.tails === 1 ? 1 : 2;
    claims.push({
      label,
      test: test as PowerTest,
      n,
      effectSize: item.effectSize,
      alpha,
      tails,
    });
    if (claims.length >= MAX_POWER_CLAIMS) break;
  }
  return claims;
}

export function normalizeExtractedClaims(
  raw: RawExtraction,
): VerificationClaims {
  return {
    grimClaims: normalizeGrimClaims(raw.grimClaims),
    powerClaims: normalizePowerClaims(raw.powerClaims),
  };
}

const EXTRACTION_INSTRUCTION = [
  "You extract structured statistics from a research paper for reproducibility checks. Extract ONLY values explicitly reported in the text; never invent or infer numbers. If nothing qualifies, return empty arrays.",
  "",
  "grimClaims: each reported group/cell MEAN of a bounded numeric scale, with its sample size N and the number of scale items averaged (items, default 1). Include the standard deviation (sd) when reported. Use a short label identifying the measure/group.",
  "",
  "powerClaims: prospective power-analysis inputs only — the statistical test (one of: t, anova, correlation, proportion, chisq), the sample size N, and the PRE-SPECIFIED effect size the study aimed to detect (e.g. Cohen's d, r, h). Do NOT compute observed/post-hoc power. alpha defaults to 0.05; tails is 1 or 2 for t-tests.",
].join("\n");

export async function extractVerificationClaims(
  text: string,
): Promise<VerificationClaims> {
  const trimmed = text.slice(0, MAX_EXTRACTION_CHARS);
  try {
    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      schema: extractionSchema,
      prompt: [EXTRACTION_INSTRUCTION, "", "Paper text:", trimmed].join("\n"),
    });
    return normalizeExtractedClaims(result.object);
  } catch {
    return { grimClaims: [], powerClaims: [] };
  }
}
