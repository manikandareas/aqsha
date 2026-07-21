import { ChatThreadRepo } from "@aqsha/db";
import { WorkspaceDocumentService } from "@aqsha/services";
import { WorkspaceService } from "@aqsha/services/workspace";
import type { ProcessInputArgs } from "@mastra/core/processors";
import { getServiceDb } from "../lib/db";
import { resolveOwnerThread } from "../lib/owner-thread";

/** Menyuntik scope proyek tepercaya dari thread aktif tanpa memasukkan isi dokumen ke prompt. */
export const workspaceProjectManifestProcessor = {
  id: "workspace-project-manifest" as const,
  async processInput({ requestContext, messages, systemMessages }: ProcessInputArgs) {
    const { ownerUserId, threadId } = resolveOwnerThread(requestContext, messages);
    if (!ownerUserId || !threadId) return messages;

    try {
      const db = getServiceDb();
      const thread = await ChatThreadRepo.findById(db, threadId);
      if (!thread || thread.ownerUserId !== ownerUserId || !thread.workspaceId) return messages;

      const [workspace, document] = await Promise.all([
        WorkspaceService.get(db, ownerUserId, thread.workspaceId),
        WorkspaceDocumentService.getDocument(db, { ownerUserId, workspaceId: thread.workspaceId }),
      ]);
      if (!workspace) return messages;

      systemMessages.push({
        role: "system",
        content: [
          "<system-reminder>",
          `Proyek aktif: "${workspace.name}" (workspaceId: ${workspace.id}).`,
          `Dokumen Typst aktif: ${document ? `tersedia, contentVersion ${document.contentVersion}` : "belum ditulis"}.`,
          "Gunakan proyek ini sebagai scope default tanpa meminta @mention. Untuk pertanyaan isi proyek, cari artifact relevan dengan `search_thread_documents` tanpa workspaceId; untuk edit Typst selalu baca `get_document_source` terlebih dahulu.",
          "Dokumen/proyek yang disebut lewat @mention adalah context baca prioritas. Jangan mengubahnya kecuali itu dokumen aktif dari thread ini.",
          "</system-reminder>",
        ].join("\n"),
      });
      return { messages, systemMessages };
    } catch (err) {
      console.error("[workspace-project-manifest] failed", err);
      return messages;
    }
  },
};
