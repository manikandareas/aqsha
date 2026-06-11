import { createTool } from "@convex-dev/agent";
import { generateObject, type ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../limits";
import { resolveArtifactPlainText } from "../sandbox/artifactText";
import { CHAT_LITE_MODEL } from "../models";
import { chatProvider } from "../providers/providers";
import {
  type AgentToolCtx,
  isLikelyConvexId,
  requireToolThread,
  requireToolUser,
} from "../tools/toolContext";
import {
  verifyOneCitation,
  type CitationInput,
  type IntegrityStatus,
} from "./citationIntegrity";

// Tool names exposed by the chat-side citation path. Visibility is gated per
// turn via activeTools (citation-intent router), mirroring SANDBOX_TOOL_NAMES.
// verifyCitations is auto-execute (read-only).
export const CITATION_TOOL_NAMES = ["verifyCitations"] as const;

const MAX_REFERENCES = 40;
const MAX_BIBLIOGRAPHY_CHARS = 60_000;
const VERIFY_CONCURRENCY = 4;

// Discrepancy is NOT fraud — product-critical neutral framing (mirrors the
// sandbox tools' NEUTRAL_FRAMING).
const NEUTRAL_FRAMING =
  "Catatan: hasil ini bukan tuduhan. Sebuah penanda bisa berasal dari salah ketik metadata, basis data akademik yang tidak lengkap, atau gangguan sementara penyedia — bukan bukti fabrikasi. Verifikasi manual dianjurkan untuk item yang ditandai.";

const STATUS_LABEL: Record<IntegrityStatus, string> = {
  verified: "terverifikasi",
  metadata_mismatch: "metadata tidak konsisten",
  identifier_invalid: "identifier tidak valid",
  not_found: "tidak ditemukan di basis data akademik",
  unverifiable: "tidak dapat diverifikasi",
};

const referenceSchema = z.object({
  title: z.string(),
  authors: z.array(z.string()).optional(),
  year: z.number().nullable().optional(),
  venue: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
  arxivId: z.string().nullable().optional(),
});

const bibliographySchema = z.object({
  references: z.array(referenceSchema),
});

const EXTRACTION_INSTRUCTION = [
  "You extract the bibliography / reference list of a research paper for a citation-integrity check. Extract ONLY references that actually appear in the document's reference list; never invent entries.",
  "For each reference return: title (required), authors (array of names as written), year, venue (journal/conference/publisher), doi (bare DOI or doi.org URL if present), arxivId (if present).",
  "If the document has no reference list, return an empty array.",
].join("\n");

// Best-effort LLM extraction of the paper's references. On any failure it
// returns no references (the tool then reports nothing to verify) — never throws.
async function extractBibliography(text: string): Promise<CitationInput[]> {
  const trimmed = text.slice(0, MAX_BIBLIOGRAPHY_CHARS);
  try {
    const result = await generateObject({
      model: chatProvider.chat(CHAT_LITE_MODEL),
      schema: bibliographySchema,
      prompt: [EXTRACTION_INSTRUCTION, "", "Paper text:", trimmed].join("\n"),
    });
    return result.object.references
      .filter((ref) => ref.title.trim().length > 0)
      .slice(0, MAX_REFERENCES)
      .map((ref) => ({
        title: ref.title.trim(),
        authors: ref.authors?.filter((a) => a.trim().length > 0),
        year: ref.year ?? undefined,
        venue: ref.venue ?? undefined,
        doi: ref.doi ?? undefined,
        arxivId: ref.arxivId ?? undefined,
      }));
  } catch {
    return [];
  }
}

function tally(results: IntegrityStatus[]): Record<IntegrityStatus, number> {
  const counts: Record<IntegrityStatus, number> = {
    verified: 0,
    metadata_mismatch: 0,
    identifier_invalid: 0,
    not_found: 0,
    unverifiable: 0,
  };
  for (const status of results) {
    counts[status] += 1;
  }
  return counts;
}

function summaryMessage(total: number, counts: Record<IntegrityStatus, number>): string {
  const flagged =
    counts.metadata_mismatch + counts.identifier_invalid + counts.not_found;
  const parts = [
    `Memeriksa ${total} sitasi: ${counts.verified} terverifikasi`,
  ];
  if (flagged > 0) parts.push(`${flagged} perlu ditinjau`);
  if (counts.unverifiable > 0) {
    parts.push(`${counts.unverifiable} tidak dapat diverifikasi`);
  }
  return `${parts.join(", ")}. ${NEUTRAL_FRAMING}`;
}

export function buildCitationTools(): ToolSet {
  return {
    verifyCitations: createTool({
      description:
        "Verify the citations / bibliography of a workspace paper with a 4-step integrity check: existence in academic databases (OpenAlex/Crossref), cited-metadata consistency (author/year/venue), and DOI/arXiv identifier validity. Use when the user asks to verify, check, or audit the references/citations/bibliography of a specific workspace document — the peer-reviewer use case. Read-only. Report results in neutral language: a flag is NOT an accusation of fraud.",
      inputSchema: z.object({
        artifactId: z
          .string()
          .describe(
            "The id of the workspace document whose citations to verify. Use the artifact referenced in the conversation or attached to the message.",
          ),
      }),
      execute: async (ctx: AgentToolCtx, input: { artifactId: string }) => {
        const ownerUserId = requireToolUser(ctx);
        const threadId = requireToolThread(ctx);
        if (!isLikelyConvexId(input.artifactId)) {
          return {
            status: "no_paper" as const,
            message:
              "Tidak ada dokumen valid untuk diperiksa. Minta pengguna memilih atau melampirkan paper terlebih dahulu.",
          };
        }
        const text = await resolveArtifactPlainText(
          ctx,
          ownerUserId,
          input.artifactId as Id<"artifacts">,
        );
        if (!text.trim()) {
          return {
            status: "no_text" as const,
            message:
              "Teks dokumen belum dapat dibaca (mungkin masih diindeks atau tanpa teks). Verifikasi sitasi tidak dapat dijalankan.",
          };
        }
        const gate = await rateLimiter.check(ctx, "citationVerifyPerUser", {
          key: ownerUserId,
        });
        if (!gate.ok) {
          return {
            status: "rate_limited" as const,
            message:
              "Terlalu banyak permintaan verifikasi sitasi dalam waktu singkat. Coba lagi sebentar lagi.",
          };
        }
        const references = await extractBibliography(text);
        if (references.length === 0) {
          return {
            status: "no_references" as const,
            message:
              "Tidak ada daftar pustaka/sitasi yang dapat diekstrak dari dokumen ini.",
          };
        }

        const results: Array<{ title: string; status: IntegrityStatus }> = [];
        for (let i = 0; i < references.length; i += VERIFY_CONCURRENCY) {
          const chunk = references.slice(i, i + VERIFY_CONCURRENCY);
          const settled = await Promise.all(
            chunk.map(async (ref) => {
              try {
                const result = await verifyOneCitation(ctx, ownerUserId, ref);
                return { title: ref.title, status: result.status };
              } catch {
                return {
                  title: ref.title,
                  status: "unverifiable" as IntegrityStatus,
                };
              }
            }),
          );
          results.push(...settled);
        }

        await rateLimiter.limit(ctx, "citationVerifyPerUser", {
          key: ownerUserId,
        });
        await ctx.runMutation(
          internal.agent.research.citationIntegrity.recordCitationVerifyUsage,
          { ownerUserId, threadId },
        );

        const counts = tally(results.map((r) => r.status));
        const flagged = results
          .filter((r) => r.status !== "verified" && r.status !== "unverifiable")
          .map((r) => ({ title: r.title, status: STATUS_LABEL[r.status] }));
        return {
          status: "completed" as const,
          total: results.length,
          counts,
          flagged,
          message: summaryMessage(results.length, counts),
        };
      },
    }),
  };
}
