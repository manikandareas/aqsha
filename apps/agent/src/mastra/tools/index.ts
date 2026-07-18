import { askQuestions } from "./ask-questions";
import { createWorkspace } from "./create-workspace";
import { deleteArtifact } from "./delete-artifact";
import { exportAnalysisResults } from "./export-analysis-results";
import { formatReferences } from "./format-references";
import { getArtifact } from "./get-artifact";
import { getRenderPayload } from "./get-render-payload";
import { getSectionSource } from "./get-section-source";
import { getWorkspaceCitation } from "./get-workspace-citation";
import { linkToWorkspace } from "./link-to-workspace";
import { listAnalyses } from "./list-analyses";
import { listArtifacts } from "./list-artifacts";
import { listWorkspaces } from "./list-workspaces";
import { lookupDoi } from "./lookup-doi";
import { profileDataset } from "./profile-dataset";
import { runAnalysis } from "./run-analysis";
import { runPythonAnalysis } from "./run-python-analysis";
import { proposeArtifact } from "./propose-artifact";
import { proposeSectionEdit } from "./propose-section-edit";
import { readUrl } from "./read-url";
import { renameWorkspace } from "./rename-workspace";
import { requestDocumentEdit } from "./request-document-edit";
import { saveUrl } from "./save-url";
import { searchArxiv } from "./search-arxiv";
import { searchPapers } from "./search-papers";
import { searchThreadDocuments } from "./search-thread-documents";
import { searchWorkspaceCitations } from "./search-workspace-citations";
import { searchWeb } from "./search-web";
import { updatePreferences } from "./update-preferences";
import { verifyCitations } from "./verify-citations";
import { verifyIdentifiers } from "./verify-identifiers";

/** Tool baca data app (tanpa approval, tanpa debit). */
export const readTools = {
  get_artifact: getArtifact,
  list_artifacts: listArtifacts,
  list_workspaces: listWorkspaces,
  get_render_payload: getRenderPayload,
  search_thread_documents: searchThreadDocuments,
  // Citation Library workspace (Fase 4) — read-only; menyisipkan sitasi tetap aksi pengguna.
  search_workspace_citations: searchWorkspaceCitations,
  get_workspace_citation: getWorkspaceCitation,
  // Sinyal picu AI editor native (Fase 3.5) — TANPA write DB; penyuntingan + billing dijaga route.
  request_document_edit: requestDocumentEdit,
  // Baca sumber LaTeX bab + anotasi terbuka; wajib sebelum propose_section_edit.
  get_section_source: getSectionSource,
};

/** Tool mutasi data app. `delete_artifact` = approval-card; sisanya konfirmasi percakapan. */
export const writeTools = {
  propose_artifact: proposeArtifact,
  // Usulkan suntingan LaTeX bab (gated dry-run compile); user Terima/Tolak di halaman bab.
  propose_section_edit: proposeSectionEdit,
  create_workspace: createWorkspace,
  rename_workspace: renameWorkspace,
  link_to_workspace: linkToWorkspace,
  save_url: saveUrl,
  delete_artifact: deleteArtifact,
  // Preferensi stabil user → profil app (IMP-2); konfirmasi percakapan seperti write lain.
  update_preferences: updatePreferences,
};

/** Tool riset eksternal (debit `external_search`) + verifikasi sitasi (`citation_verify`=0). */
export const researchTools = {
  search_papers: searchPapers,
  search_arxiv: searchArxiv,
  lookup_doi: lookupDoi,
  search_web: searchWeb,
  read_url: readUrl,
  verify_citations: verifyCitations,
  verify_identifiers: verifyIdentifiers,
  format_references: formatReferences,
};

/**
 * Tool analisis statistik (sandbox Daytona per-thread). Template-first:
 * `list_analyses` (katalog, gratis) → `run_analysis` (debit `sandbox_compute`
 * on-success); `profile_dataset` gratis (onboarding). Chat-only — /deep = riset
 * literatur, tak butuh sandbox data.
 */
export const analysisTools = {
  profile_dataset: profileDataset,
  list_analyses: listAnalyses,
  run_analysis: runAnalysis,
  // Fallback codegen ber-guardrail (fase 4) — hanya saat katalog tak memuat uji yang diminta.
  run_python_analysis: runPythonAnalysis,
  // Ekspor deliverable (fase 5): docx/xlsx/sav → artifact pustaka.
  export_analysis_results: exportAnalysisResults,
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

/** Seluruh tool root agent Astra Lite (chat) = tool /deep + analisis data + HITL interaksi. */
export const astraTools = {
  ...deepWriterTools,
  ...analysisTools,
  ...interactionTools,
};
