// @aqsha/services — service layer framework-agnostic (route/MCP/worker callable).

// Chat Astra (Fase 6) — path BACA + CRUD untuk route api (juga via subpath
// `@aqsha/services/chat`). Logika murni di `@aqsha/chat-core`; path tulis proyeksi di
// PROSES eve (`apps/web/agent/lib/store.ts`).
export { EventService, MessageService, ThreadService, TitleService } from "./chat";

export { InterestService } from "./interest.service";
export { DEFAULT_WORKSPACE_NAME, WorkspaceService } from "./workspace.service";
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
  resolvePlanKey,
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
export { ragEntryIdFor, RagService, type ThreadDocumentMatch } from "./rag.service";
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
  EXPLORE_QUEUES,
  type ExploreQueueName,
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
export { deriveSubtopics, suggestQueries } from "./explore/suggest";
export {
  type ExploreFacets,
  type FacetGlobe,
  type FacetGlobeArc,
  type FacetGlobeNode,
  type FacetPulse,
  FacetsService,
} from "./explore/facets.service";
export {
  type AnalysisPaper,
  type ExploreAnalysisJob,
  type ExploreAnalysisResult,
  type ExploreAnalysisStatus,
  ExploreAnalysisService,
  type GapResult,
  parseAnalysis,
  type TensionClaim,
  type TensionData,
} from "./explore/analysis.service";
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
