import type { Db } from "@aqsha/db";
import { StorageService } from "../storage.service";
import { WorkspaceService } from "../workspace.service";
import { assembleWorkspaceDocument } from "./build.service";
import { convertLatexToDocx } from "./docx-convert";

export const WorkspaceDocxService = {
  /**
   * Ekspor best-effort dokumen penuh → .docx. Assembly & bib sama dengan compile penuh;
   * konversi via pandoc. Blob disimpan sebagai objek ekspor (signed URL sementara).
   */
  async export(
    db: Db,
    input: { ownerUserId: string; workspaceId: string },
  ): Promise<{ url: string }> {
    await WorkspaceService.assertWorkspaceOwner(db, input.ownerUserId, input.workspaceId);
    const { assembled, bib } = await assembleWorkspaceDocument(db, input);
    const docx = await convertLatexToDocx({
      mainTex: assembled.mainTex,
      extraFiles: assembled.extraFiles,
      bib,
    });
    const key = await StorageService.storeBytes(
      input.ownerUserId,
      input.workspaceId,
      "docx-export",
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    return { url: await StorageService.getSignedReadUrl(key) };
  },
};
