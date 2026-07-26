import { ProjectFactsService, renderProjectManifest } from "@aqsha/services/typst";
import type { ProcessInputArgs } from "@mastra/core/processors";
import { getServiceDb } from "../lib/db";
import { resolveOwnerThread } from "../lib/owner-thread";

/**
 * Menyuntik peta proyek tepercaya dari thread aktif: identitas, kerangka bab beserta panjangnya,
 * cacat sitasi, anotasi terbuka, dan status proposal — tanpa memasukkan isi dokumen ke prompt.
 * Peta ini menggantikan satu ronde tool call yang dulu terpakai hanya untuk orientasi.
 */
export const workspaceProjectManifestProcessor = {
  id: "workspace-project-manifest" as const,
  async processInput({ requestContext, messages, systemMessages }: ProcessInputArgs) {
    const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
    if (!ownerUserId || !threadId) return messages;

    try {
      const db = getServiceDb();
      const workspaceId = await ProjectFactsService.workspaceIdForThread(db, {
        ownerUserId,
        threadId,
      });
      if (!workspaceId) return messages;
      const facts = await ProjectFactsService.get(db, { ownerUserId, workspaceId });
      if (!facts) return messages;

      systemMessages.push({ role: "system", content: renderProjectManifest(facts) });
      return { messages, systemMessages };
    } catch (err) {
      console.error("[workspace-project-manifest] failed", err);
      return messages;
    }
  },
};
