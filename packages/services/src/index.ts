// @aqsha/services — service layer framework-agnostic (route/MCP/worker callable).

// Chat Astra — CRUD thread untuk route api + proyeksi tipis `chat_threads` (agent Mastra) +
// auto-title (juga via subpath `@aqsha/services/chat`). Isi pesan = Mastra Memory.
export { ThreadService, TitleService } from "./chat";

export { InterestService } from "./interest.service";
export { DEFAULT_WORKSPACE_NAME, WorkspaceService } from "./workspace.service";
export { SECTION_TEMPLATES, type SectionTemplate } from "./workspaces/section-templates";
export { FolderService } from "./folder.service";
export { ContextService, type HydratedContext } from "./context.service";
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
export {
  type AgentPreferences,
  type AgentPreferencesPatch,
  AgentPreferencesService,
  ANSWER_LANGUAGE_IDS,
  CITATION_STYLE_IDS,
  CUSTOM_INSTRUCTION_MAX_CHARS,
  RESPONSE_STYLE_IDS,
} from "./agentPreferences.service";

// Plan catalog + pricing SSOT (Fase 5).
export {
  type BillingInterval,
  type BillingStatus,
  billingStatusAllowsUsage,
  type CreditFeature,
  currentMonthPeriod,
  estimateCredits,
  estimateProviderCostCents,
  featureForUsage,
  intervalForProductKey,
  isAdminEmail,
  isAdminOwnerUserId,
  isPlanAtLeast,
  normalizeBillingStatus,
  type PaidPlanKey,
  PLAN_CATALOG,
  PLAN_ORDER,
  type PlanDefinition,
  type PlanKey,
  planForProductKey,
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  type ProductKey,
  PUBLIC_PLAN_KEYS,
  type PublicPlanKey,
  requiredPlanForFeature,
  UNLIMITED,
} from "./plan";

// Billing service (Fase 5) — entitlement + usage write-path + Mayar surface.
export {
  BillingService,
  type BillingSnapshot,
  type ConsumeCreditsArgs,
  type CurrentBillingResponse,
  type CurrentPeriodSummary,
  type EntitlementResult,
  type EntitlementSnapshot,
  type PlanListItem,
  type SyncSubscriptionPayload,
  type UsageDay,
} from "./billing.service";
export {
  getEntitlementSnapshot,
  resolveAdminOverride,
  resolveEffectivePlanKey,
} from "./billing/snapshot";
export { evaluateGate } from "./billing/period";
export { deriveMayarMembershipEvent, MayarClient } from "./clients/mayar";

// Artifacts (P3) — pure helpers + konstanta + capacity gate + storage/RAG/extract.
export * from "./artifacts/model";
export { assertLibraryCapacity } from "./artifacts/capacity";
export { type ExtractedDocument, extractStoredDocument } from "./artifacts/extract";
export { StorageService } from "./storage.service";
export {
  assertEmbeddingEnabled,
  ragEntryIdFor,
  RagService,
  type ThreadDocumentMatch,
} from "./rag.service";
export {
  type EvidenceStrength,
  type ResearchCandidate,
  type ResearchOrigin,
  ResearchService,
  type ResearchSourceItem,
} from "./research";
export {
  ArtifactService,
  type ArtifactListItem,
  type ArtifactRenderPayload,
} from "./artifact.service";
// Analisis statistik (sandbox Daytona per-thread) — juga via subpath `@aqsha/services/analysis`.
export {
  ANALYSIS_CATALOG,
  ANALYSIS_IDS,
  type AnalysisArgSpec,
  type AnalysisCatalogEntry,
  analysisCatalogEntry,
  type AnalysisChart,
  type AnalysisExportFile,
  type AnalysisExportFormat,
  type AnalysisExportResult,
  type AnalysisId,
  type AnalysisRunResult,
  AnalysisService,
} from "./analysis";
// Helper murni route AI native BlockNote (`apps/api` /blocknote-ai/chat) — TANPA import `ai`.
export { DocAiService, INDO_BRAND_PROMPT } from "./doc-ai.service";
// Konfigurasi gateway Astra (env + default model) — SSOT bersama route doc-AI & `model.ts` agent.
export {
  ASTRA_LITE_MODEL_FALLBACK,
  type AstraGatewayConfig,
  resolveAstraGateway,
} from "./astra-gateway";
export { syncArtifactWorkspaceMove } from "./artifacts/move";
export { PaperMetadataService, type PaperMetadataInput } from "./paper-metadata.service";
export {
  BlockedUrlError,
  classifyPaperText,
  classifyUrl,
  type ClassifiedUrl,
  downloadOaPdf,
  followRedirectsSafely,
  isAcademicIdentifier,
  isBlockedHost,
  pdfFileName,
  resolvePaper,
  type ResolvedPaper,
  scrapeUrlFirecrawl,
  type UrlReadResult,
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

// Feed/Discovery (P4) — pure model + topic taxonomy. Service classes ditambah tiap slice.
export {
  buildFeedItemRow,
  deriveOrderAt,
  deriveSearchText,
  type FeedClaim,
  type FeedItemInput,
  type FeedItemResponse,
  type FeedItemRow,
  type FeedKind,
  type FeedProvider,
  type FeedRetractionStatus,
  paperToFeedInput,
  shapeFeedItem,
} from "./feed/model";
export {
  DISCOVERY_TOPIC_CATEGORIES,
  DISCOVERY_TOPIC_CATEGORY_LABELS,
  type DiscoveryTopicCategory,
  isDiscoveryTopicCategory,
  matchesTopicCategory,
} from "./feed/topicCategories";
export { upsertFeedItems } from "./feed/write";
export { FeedService, type FeedMode } from "./feed.service";
export {
  FEED_HYDRATION_LANES,
  type FeedHydrationLane,
  FeedHydrationService,
  type RefreshResult,
} from "./feed-hydration.service";
export { PaperCacheService, type PapersByKeysItem } from "./paper-cache.service";
export { ExploreService } from "./explore.service";
export { suggestQueries } from "./explore/suggest";
export {
  type DiscoveryItemRef,
  type DiscoveryResolvedRef,
  FeedInteractionService,
  type InteractionKind,
} from "./feed-interaction.service";
export {
  ACCOUNT_QUEUES,
  type AccountQueueName,
  CHAT_QUEUES,
  type ChatQueueName,
  FEED_QUEUES,
  type FeedQueueName,
  INTEGRATION_QUEUES,
  type IntegrationQueueName,
  type QueueName,
  registerRepeatable,
} from "./clients/queue";
export { AccountDeletionService } from "./account-deletion.service";

// Explore paper cache model (P4) — key kanonik + cache helpers (dipakai route papers/explore P4.4).
export {
  canonicalPaperKey,
  dedupeExplorePapers,
  deriveKeyProbe,
  exploreCacheKey,
  type ExploreMode,
  type ExplorePaperDetail,
  type ExplorePaperInput,
  type ExploreProvider,
  type ExploreProviderStatus,
  type ExploreSearchResponse,
} from "./explore/model";

// Citation Manager (Fase 1) — Citation Library workspace-scoped + import .bib/.ris +
// render CSL multi-style (lihat docs/features/citations/csl-engine-adr.md).
export {
  CITATION_EXPORT_FORMATS,
  CITATION_STYLES,
  type CitationDetail,
  type CitationExportFormat,
  CitationImportService,
  type CitationListItem,
  CitationService,
  type CitationSettingsView,
  formatAuthorDisplay,
  type ImportCommitResult,
  type ImportDuplicatePolicy,
  type ImportPreviewResult,
  MAX_IMPORT_FILE_BYTES,
  type ManualCitationInput,
} from "./citations";

// Citation Manager (Fase 5) — integrasi provider referensi (Mendeley OAuth / Zotero).
// Koneksi account-level terenkripsi; penarikan data per-workspace via CitationSyncService.
export {
  CitationSyncService,
  type IntegrationAdapter,
  IntegrationService,
  type IntegrationStatusView,
  isIntegrationCryptoConfigured,
  KNOWN_PROVIDERS,
  type ProviderFolder,
} from "./integrations";

// Waitlist publik — double opt-in via Resend (marketing site → API).
export {
  createWaitlistVerificationToken,
  hashWaitlistVerificationToken,
  normalizeWaitlistEmail,
  normalizeWaitlistJoinInput,
  type NormalizedWaitlistJoinInput,
  type WaitlistJoinInput,
  WAITLIST_COMPANY_MAX_CHARS,
  WAITLIST_TOKEN_TTL_MS,
} from "./waitlist/model";
export {
  renderedVerificationEmail,
  sendWaitlistVerificationEmail,
  type WaitlistEmailSender,
} from "./clients/resend";
export {
  type WaitlistJoinResult,
  type WaitlistServiceConfig,
  WaitlistService,
  type WaitlistVerificationConfig,
} from "./waitlist.service";
