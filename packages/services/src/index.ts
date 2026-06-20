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

// Reference data + pure helpers (juga dipakai frontend lewat re-export bila perlu).
export * from "./onboarding/options";
export {
  INTEREST_FIELD_TOPICS,
  isInterestFieldId,
  normalizeInterestTopic,
  topicsForInterestFields,
} from "./feed/interestKeywords";
