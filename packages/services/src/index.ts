// @aqsha/services — service layer framework-agnostic (route/MCP/worker callable).
export { InterestService } from "./interest.service";
export { DEFAULT_WORKSPACE_NAME, WorkspaceService } from "./workspace.service";
export { FolderService } from "./folder.service";
export {
  type CurrentUserIdentity,
  ensureUserWithin,
  UserService,
  type UserProfile,
} from "./user.service";
export {
  type CompleteOnboardingInput,
  OnboardingService,
} from "./onboarding.service";

// Plan catalog + resolver (stub P2; billing penuh P5).
export {
  PLAN_CATALOG,
  type PlanDefinition,
  type PlanKey,
  type PublicPlanKey,
  resolvePlanKey,
  UNLIMITED,
} from "./plan";

// Artifacts (P3) — pure helpers + konstanta + capacity gate + storage/RAG/extract.
export * from "./artifacts/model";
export { assertLibraryCapacity } from "./artifacts/capacity";
export { type ExtractedDocument, extractStoredDocument } from "./artifacts/extract";
export { StorageService } from "./storage.service";
export { ragEntryIdFor, RagService } from "./rag.service";
export {
  ArtifactService,
  type ArtifactListItem,
  type ArtifactRenderPayload,
} from "./artifact.service";
export { syncArtifactWorkspaceMove } from "./artifacts/move";
export { PaperMetadataService, type PaperMetadataInput } from "./paper-metadata.service";
export {
  classifyPaperText,
  classifyUrl,
  type ClassifiedUrl,
  downloadOaPdf,
  isAcademicIdentifier,
  pdfFileName,
  readWithJinaReader,
  resolvePaper,
  type ResolvedPaper,
} from "./papers";
export {
  ARTIFACT_QUEUES,
  type ArtifactQueueName,
  enqueue,
  getQueueConnection,
} from "./clients/queue";

// Reference data + pure helpers (juga dipakai frontend lewat re-export bila perlu).
export * from "./onboarding/options";
export {
  INTEREST_FIELD_TOPICS,
  isInterestFieldId,
  normalizeInterestTopic,
  topicsForInterestFields,
} from "./feed/interestKeywords";
