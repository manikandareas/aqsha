import { askQuestions } from "./ask-questions";
import { createWorkspace } from "./create-workspace";
import { deleteArtifact } from "./delete-artifact";
import { getArtifact } from "./get-artifact";
import { getRenderPayload } from "./get-render-payload";
import { linkToWorkspace } from "./link-to-workspace";
import { listArtifacts } from "./list-artifacts";
import { listWorkspaces } from "./list-workspaces";
import { lookupDoi } from "./lookup-doi";
import { proposeArtifact } from "./propose-artifact";
import { renameWorkspace } from "./rename-workspace";
import { requestDocumentEdit } from "./request-document-edit";
import { saveUrl } from "./save-url";
import { searchArxiv } from "./search-arxiv";
import { searchPapers } from "./search-papers";
import { searchThreadDocuments } from "./search-thread-documents";
import { searchWeb } from "./search-web";
import { verifyCitations } from "./verify-citations";
import { verifyIdentifiers } from "./verify-identifiers";

/** Tool baca data app (tanpa approval, tanpa debit). */
export const readTools = {
  get_artifact: getArtifact,
  list_artifacts: listArtifacts,
  list_workspaces: listWorkspaces,
  get_render_payload: getRenderPayload,
  search_thread_documents: searchThreadDocuments,
  // Sinyal picu AI editor native (Fase 3.5) — TANPA write DB; penyuntingan + billing dijaga route.
  request_document_edit: requestDocumentEdit,
};

/** Tool mutasi data app. `delete_artifact` = approval-card; sisanya konfirmasi percakapan. */
export const writeTools = {
  propose_artifact: proposeArtifact,
  create_workspace: createWorkspace,
  rename_workspace: renameWorkspace,
  link_to_workspace: linkToWorkspace,
  save_url: saveUrl,
  delete_artifact: deleteArtifact,
};

/** Tool riset eksternal (debit `external_search`) + verifikasi sitasi (`citation_verify`=0). */
export const researchTools = {
  search_papers: searchPapers,
  search_arxiv: searchArxiv,
  lookup_doi: lookupDoi,
  search_web: searchWeb,
  verify_citations: verifyCitations,
  verify_identifiers: verifyIdentifiers,
};

/**
 * Tool interaksi HITL (tanpa write DB / debit). `ask_questions` = tool-suspend native: pause turn
 * → kartu pertanyaan FE → resume dengan jawaban user.
 */
export const interactionTools = {
  ask_questions: askQuestions,
};

/**
 * Tool agent Workflow `/deep` (`deepWriter`): sama seperti chat TAPI TANPA `interactionTools`.
 * `ask_questions` men-suspend turn — di /deep, klarifikasi punya gerbang terdedikasi
 * (step `draft-clarify`/`clarify`), jadi tool suspend chat tak boleh callable di tengah
 * `draft-plan`/`synthesize` (generate tanpa handler suspend → plan/laporan rusak).
 */
export const deepWriterTools = {
  ...readTools,
  ...writeTools,
  ...researchTools,
};

/** Seluruh tool root agent Astra Lite (chat) = tool /deep + HITL interaksi. */
export const astraTools = {
  ...deepWriterTools,
  ...interactionTools,
};
