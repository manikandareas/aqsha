import { tool } from "ai";
import { z } from "zod";
import type { MemoryService } from "../../modules/memory/service";

export type VerifyCitationExistsDeps = {
  memoryService: MemoryService;
  ownerUserId: string;
};

export function createVerifyCitationExistsTool(deps: VerifyCitationExistsDeps) {
  return tool({
    description:
      "Check whether a citation in the draft report is backed by a stored evidence card. Returns exists=true if any card matches the source URL for this user; matchedClaim=true if the optional claimText also matches an existing card. Use BEFORE concluding the report is faithful.",
    inputSchema: z.object({
      sourceUrl: z.string().min(1),
      claimText: z
        .string()
        .min(1)
        .optional()
        .describe(
          "If provided, also check whether this exact claim text appears among the evidence cards for the given source URL.",
        ),
    }),
    execute: async ({ sourceUrl, claimText }) => {
      const cards = await deps.memoryService.findEvidenceCardsByUrl(
        deps.ownerUserId,
        sourceUrl,
      );

      const exists = cards.length > 0;
      const cardIds = cards.map((card) => card.cardId);
      let matchedClaim = false;
      if (claimText && cards.length > 0) {
        const normalizedQuery = normalizeForCompare(claimText);
        matchedClaim = cards.some(
          (card) => normalizeForCompare(card.claimText) === normalizedQuery,
        );
      }

      return {
        exists,
        cardIds,
        matchedClaim,
        count: cards.length,
      };
    },
  });
}

function normalizeForCompare(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
