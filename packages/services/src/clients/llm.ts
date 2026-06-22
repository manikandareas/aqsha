import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText, jsonSchema } from "ai";

/**
 * LLM teks-pendek untuk utilitas non-stream (Slice 6.8: auto-title thread). Provider
 * OpenAI DISAMAKAN dgn agent (`apps/web-v2/agent/agent.ts`): OpenAI langsung
 * (`OPENAI_API_KEY`) ATAU gateway OpenAI-compatible (`OPENAI_BASE_URL`). Model
 * di-override `AQSHA_TITLE_MODEL` (default `gpt-4o-mini` — judul = tugas murah,
 * tak perlu model utama). `generateText` (bukan `generateObject`): output = satu
 * string pendek, schema/zod overkill.
 */
let provider: ReturnType<typeof createOpenAI> | null = null;

function getProvider() {
  if (provider) return provider;
  provider = createOpenAI(
    process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {},
  );
  return provider;
}

const TITLE_MODEL = process.env.AQSHA_TITLE_MODEL ?? "gpt-4o-mini";
const IDEAS_MODEL = process.env.AQSHA_IDEAS_MODEL ?? TITLE_MODEL;

/** Judul ringkas (3–6 kata) Bahasa Indonesia dari pesan pertama. Throw bila model gagal. */
export async function generateThreadTitle(firstMessage: string): Promise<string> {
  const { text } = await generateText({
    model: getProvider().chat(TITLE_MODEL),
    prompt:
      "Buat judul percakapan yang ringkas (3–6 kata) dalam Bahasa Indonesia untuk pesan berikut. " +
      "Balas HANYA judulnya, tanpa tanda kutip, tanpa tanda baca akhir.\n\n" +
      `Pesan:\n${firstMessage}`,
  });
  return text;
}

const ideasSchema = jsonSchema<{ ideas: string[] }>({
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
  },
});

/**
 * 1–3 pertanyaan riset (FINER) dari sebuah prompt. `jsonSchema` ai@6 (tanpa zod).
 * Throw bila model gagal → pemanggil fallback ke canned cold-start.
 */
export async function generateResearchIdeas(prompt: string): Promise<string[]> {
  const { object } = await generateObject({
    model: getProvider().chat(IDEAS_MODEL),
    schema: ideasSchema,
    prompt,
  });
  return object.ideas.slice(0, 3);
}
