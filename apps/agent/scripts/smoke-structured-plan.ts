/**
 * Smoke `structuredOutput` jalur rencana `/deep` (audit 2026-07-03): panggil `deepWriter.generate`
 * persis seperti step `draft-plan` (toolChoice none + PlanOutputSchema strict) lalu pastikan
 * `out.object` valid — plan prosa non-kosong, 3-6 sub-pertanyaan, domain enum. Jalankan dari
 * `apps/agent` (Bun auto-load `.env`): `bun run scripts/smoke-structured-plan.ts`.
 */
import { RequestContext } from "@mastra/core/request-context";
import { z } from "zod";
import { deepWriter } from "../src/mastra/agents/deep-writer";
import { AQSHA_AGENT_KIND_KEY } from "../src/mastra/lib/tool-context";

const PlanOutputSchema = z.object({
  plan: z.string().describe("Rencana riset lengkap sebagai prosa mengalir (bukan daftar bernomor, bukan form)."),
  subQuestions: z.array(z.string()).describe("3-6 sub-pertanyaan riset spesifik yang diturunkan dari rencana."),
  domain: z
    .enum(["medicine", "cs-ml", "education", "general"])
    .describe("Domain-pack metodologi paling cocok dengan topik."),
});

const prompt =
  "Pertanyaan riset:\nBagaimana dampak penggunaan media sosial terhadap kualitas tidur remaja Indonesia?\n\n" +
  "Susun rencana riset mendalam sebagai PROSA mengalir (bukan daftar bernomor, bukan form): jelaskan apa yang akan " +
  "diselidiki, sub-arah utama yang ditelusuri terpisah, jenis sumber yang dicari, dan cara verifikasi. " +
  "Lalu turunkan 3-6 sub-pertanyaan riset spesifik dari rencana itu.";

const out = await deepWriter.generate(prompt, {
  requestContext: new RequestContext([[AQSHA_AGENT_KIND_KEY, "lite"]]),
  toolChoice: "none",
  structuredOutput: { schema: PlanOutputSchema, errorStrategy: "strict" },
});

const obj = out.object;
const ok =
  obj &&
  typeof obj.plan === "string" &&
  obj.plan.trim().length > 100 &&
  Array.isArray(obj.subQuestions) &&
  obj.subQuestions.length >= 3 &&
  obj.subQuestions.length <= 6 &&
  ["medicine", "cs-ml", "education", "general"].includes(obj.domain);

console.log(
  JSON.stringify(
    {
      ok: Boolean(ok),
      planHead: obj?.plan?.slice(0, 140),
      planHasFence: obj?.plan?.includes("```") ?? null,
      planHasNameJunk: obj?.plan?.includes('{"name"') ?? null,
      subQuestionCount: obj?.subQuestions?.length ?? 0,
      domain: obj?.domain ?? null,
    },
    null,
    2,
  ),
);
process.exit(ok ? 0 : 1);
