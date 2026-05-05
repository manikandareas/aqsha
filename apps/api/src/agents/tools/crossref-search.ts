import { tool } from "ai";
import { z } from "zod";
import { searchCrossref } from "../external/crossref";
import { failureResult, stripRaw } from "./arxiv-search";

const inputSchema = z.object({
  query: z.string().min(2).max(300),
  rows: z.number().int().min(1).max(20).default(10),
  fromDate: z
    .string()
    .regex(/^\d{4}(-\d{2}){0,2}$/, "Use YYYY, YYYY-MM, or YYYY-MM-DD")
    .optional(),
  untilDate: z
    .string()
    .regex(/^\d{4}(-\d{2}){0,2}$/, "Use YYYY, YYYY-MM, or YYYY-MM-DD")
    .optional(),
  type: z
    .enum([
      "journal-article",
      "book-chapter",
      "proceedings-article",
      "report",
      "review",
      "dissertation",
    ])
    .optional()
    .describe("CrossRef work type filter."),
});

export function createCrossrefSearchTool() {
  return tool({
    description:
      "Search CrossRef for cross-disciplinary academic publications by title, author, DOI, or "
      + "topic. Returns up to 20 candidates with DOI, title, abstract, authors, and "
      + "publication date. Best when you have an author/year, a DOI, or need broad academic "
      + "coverage outside the niches handled by arXiv (physics/CS) or PubMed (biomedical).",
    inputSchema,
    execute: async ({ query, rows, fromDate, untilDate, type }, { abortSignal }) => {
      try {
        const candidates = await searchCrossref(query, {
          rows,
          fromDate,
          untilDate,
          type,
          signal: abortSignal,
        });
        return { provider: "crossref" as const, candidates: stripRaw(candidates) };
      } catch (error) {
        return failureResult("crossref", error);
      }
    },
  });
}
