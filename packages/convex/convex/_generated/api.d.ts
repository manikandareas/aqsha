/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountCleanup from "../accountCleanup.js";
import type * as accountCleanup_agent from "../accountCleanup/agent.js";
import type * as accountCleanup_artifacts from "../accountCleanup/artifacts.js";
import type * as accountCleanup_billing from "../accountCleanup/billing.js";
import type * as accountCleanup_shared from "../accountCleanup/shared.js";
import type * as accountCleanup_workspaces from "../accountCleanup/workspaces.js";
import type * as agent_artifactCommandInference from "../agent/artifactCommandInference.js";
import type * as agent_artifacts from "../agent/artifacts.js";
import type * as agent_astra from "../agent/astra.js";
import type * as agent_deepResearch from "../agent/deepResearch.js";
import type * as agent_domainReliability from "../agent/domainReliability.js";
import type * as agent_externalProviders from "../agent/externalProviders.js";
import type * as agent_factCheckProvider from "../agent/factCheckProvider.js";
import type * as agent_gdeltProvider from "../agent/gdeltProvider.js";
import type * as agent_hitlProvenance from "../agent/hitlProvenance.js";
import type * as agent_hitlResume from "../agent/hitlResume.js";
import type * as agent_hitlTools from "../agent/hitlTools.js";
import type * as agent_messages from "../agent/messages.js";
import type * as agent_models from "../agent/models.js";
import type * as agent_newsProvider from "../agent/newsProvider.js";
import type * as agent_openalexProvider from "../agent/openalexProvider.js";
import type * as agent_promptCommandParsing from "../agent/promptCommandParsing.js";
import type * as agent_promptCommands from "../agent/promptCommands.js";
import type * as agent_promptPayload from "../agent/promptPayload.js";
import type * as agent_promptRouting from "../agent/promptRouting.js";
import type * as agent_providerCache from "../agent/providerCache.js";
import type * as agent_providers from "../agent/providers.js";
import type * as agent_rag from "../agent/rag.js";
import type * as agent_ragContext from "../agent/ragContext.js";
import type * as agent_rateLimits from "../agent/rateLimits.js";
import type * as agent_researchTools from "../agent/researchTools.js";
import type * as agent_runLifecycle from "../agent/runLifecycle.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_sourceCandidates from "../agent/sourceCandidates.js";
import type * as agent_sourceQuality from "../agent/sourceQuality.js";
import type * as agent_sources from "../agent/sources.js";
import type * as agent_threadContext from "../agent/threadContext.js";
import type * as agent_threadTitles from "../agent/threadTitles.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_workflow from "../agent/workflow.js";
import type * as agent_workspaceCommandInference from "../agent/workspaceCommandInference.js";
import type * as articlePreview from "../articlePreview.js";
import type * as artifactModel from "../artifactModel.js";
import type * as artifactUploadLimits from "../artifactUploadLimits.js";
import type * as artifactUploadPolicy from "../artifactUploadPolicy.js";
import type * as artifactUploads from "../artifactUploads.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as auth_accountDeletion from "../auth/accountDeletion.js";
import type * as auth_profile from "../auth/profile.js";
import type * as auth_types from "../auth/types.js";
import type * as auth_userRepository from "../auth/userRepository.js";
import type * as auth_webhooks from "../auth/webhooks.js";
import type * as billing_admin from "../billing/admin.js";
import type * as billing_catalog from "../billing/catalog.js";
import type * as billing_checkout from "../billing/checkout.js";
import type * as billing_current from "../billing/current.js";
import type * as billing_entitlements from "../billing/entitlements.js";
import type * as billing_polar from "../billing/polar.js";
import type * as billing_portal from "../billing/portal.js";
import type * as billing_products from "../billing/products.js";
import type * as billing_subscription from "../billing/subscription.js";
import type * as billing_usage from "../billing/usage.js";
import type * as billing_validators from "../billing/validators.js";
import type * as crons from "../crons.js";
import type * as explore from "../explore.js";
import type * as exploreModel from "../exploreModel.js";
import type * as exploreValidators from "../exploreValidators.js";
import type * as feed from "../feed.js";
import type * as feedAi from "../feedAi.js";
import type * as feedBahasa from "../feedBahasa.js";
import type * as feedClaims from "../feedClaims.js";
import type * as feedConsensus from "../feedConsensus.js";
import type * as feedIdeas from "../feedIdeas.js";
import type * as feedInterests from "../feedInterests.js";
import type * as feedModel from "../feedModel.js";
import type * as feedOpenAlex from "../feedOpenAlex.js";
import type * as feedSources from "../feedSources.js";
import type * as feedValidators from "../feedValidators.js";
import type * as hitlWorkspace from "../hitlWorkspace.js";
import type * as http from "../http.js";
import type * as lib_appError from "../lib/appError.js";
import type * as lib_userImage from "../lib/userImage.js";
import type * as limits from "../limits.js";
import type * as onboarding from "../onboarding.js";
import type * as paperExtraction_grobidClient from "../paperExtraction/grobidClient.js";
import type * as paperExtraction_teiParser from "../paperExtraction/teiParser.js";
import type * as paperExtractions from "../paperExtractions.js";
import type * as paperIngest_download from "../paperIngest/download.js";
import type * as paperIngest_http from "../paperIngest/http.js";
import type * as paperIngest_identifiers from "../paperIngest/identifiers.js";
import type * as paperIngest_ingest from "../paperIngest/ingest.js";
import type * as paperIngest_model from "../paperIngest/model.js";
import type * as paperIngest_providers from "../paperIngest/providers.js";
import type * as paperIngest_resolve from "../paperIngest/resolve.js";
import type * as workspaceAccess from "../workspaceAccess.js";
import type * as workspaceDefaults from "../workspaceDefaults.js";
import type * as workspaceEmoji from "../workspaceEmoji.js";
import type * as workspaceFolders from "../workspaceFolders.js";
import type * as workspaceMoveModel from "../workspaceMoveModel.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountCleanup: typeof accountCleanup;
  "accountCleanup/agent": typeof accountCleanup_agent;
  "accountCleanup/artifacts": typeof accountCleanup_artifacts;
  "accountCleanup/billing": typeof accountCleanup_billing;
  "accountCleanup/shared": typeof accountCleanup_shared;
  "accountCleanup/workspaces": typeof accountCleanup_workspaces;
  "agent/artifactCommandInference": typeof agent_artifactCommandInference;
  "agent/artifacts": typeof agent_artifacts;
  "agent/astra": typeof agent_astra;
  "agent/deepResearch": typeof agent_deepResearch;
  "agent/domainReliability": typeof agent_domainReliability;
  "agent/externalProviders": typeof agent_externalProviders;
  "agent/factCheckProvider": typeof agent_factCheckProvider;
  "agent/gdeltProvider": typeof agent_gdeltProvider;
  "agent/hitlProvenance": typeof agent_hitlProvenance;
  "agent/hitlResume": typeof agent_hitlResume;
  "agent/hitlTools": typeof agent_hitlTools;
  "agent/messages": typeof agent_messages;
  "agent/models": typeof agent_models;
  "agent/newsProvider": typeof agent_newsProvider;
  "agent/openalexProvider": typeof agent_openalexProvider;
  "agent/promptCommandParsing": typeof agent_promptCommandParsing;
  "agent/promptCommands": typeof agent_promptCommands;
  "agent/promptPayload": typeof agent_promptPayload;
  "agent/promptRouting": typeof agent_promptRouting;
  "agent/providerCache": typeof agent_providerCache;
  "agent/providers": typeof agent_providers;
  "agent/rag": typeof agent_rag;
  "agent/ragContext": typeof agent_ragContext;
  "agent/rateLimits": typeof agent_rateLimits;
  "agent/researchTools": typeof agent_researchTools;
  "agent/runLifecycle": typeof agent_runLifecycle;
  "agent/runtime": typeof agent_runtime;
  "agent/sourceCandidates": typeof agent_sourceCandidates;
  "agent/sourceQuality": typeof agent_sourceQuality;
  "agent/sources": typeof agent_sources;
  "agent/threadContext": typeof agent_threadContext;
  "agent/threadTitles": typeof agent_threadTitles;
  "agent/threads": typeof agent_threads;
  "agent/workflow": typeof agent_workflow;
  "agent/workspaceCommandInference": typeof agent_workspaceCommandInference;
  articlePreview: typeof articlePreview;
  artifactModel: typeof artifactModel;
  artifactUploadLimits: typeof artifactUploadLimits;
  artifactUploadPolicy: typeof artifactUploadPolicy;
  artifactUploads: typeof artifactUploads;
  artifacts: typeof artifacts;
  auth: typeof auth;
  "auth/accountDeletion": typeof auth_accountDeletion;
  "auth/profile": typeof auth_profile;
  "auth/types": typeof auth_types;
  "auth/userRepository": typeof auth_userRepository;
  "auth/webhooks": typeof auth_webhooks;
  "billing/admin": typeof billing_admin;
  "billing/catalog": typeof billing_catalog;
  "billing/checkout": typeof billing_checkout;
  "billing/current": typeof billing_current;
  "billing/entitlements": typeof billing_entitlements;
  "billing/polar": typeof billing_polar;
  "billing/portal": typeof billing_portal;
  "billing/products": typeof billing_products;
  "billing/subscription": typeof billing_subscription;
  "billing/usage": typeof billing_usage;
  "billing/validators": typeof billing_validators;
  crons: typeof crons;
  explore: typeof explore;
  exploreModel: typeof exploreModel;
  exploreValidators: typeof exploreValidators;
  feed: typeof feed;
  feedAi: typeof feedAi;
  feedBahasa: typeof feedBahasa;
  feedClaims: typeof feedClaims;
  feedConsensus: typeof feedConsensus;
  feedIdeas: typeof feedIdeas;
  feedInterests: typeof feedInterests;
  feedModel: typeof feedModel;
  feedOpenAlex: typeof feedOpenAlex;
  feedSources: typeof feedSources;
  feedValidators: typeof feedValidators;
  hitlWorkspace: typeof hitlWorkspace;
  http: typeof http;
  "lib/appError": typeof lib_appError;
  "lib/userImage": typeof lib_userImage;
  limits: typeof limits;
  onboarding: typeof onboarding;
  "paperExtraction/grobidClient": typeof paperExtraction_grobidClient;
  "paperExtraction/teiParser": typeof paperExtraction_teiParser;
  paperExtractions: typeof paperExtractions;
  "paperIngest/download": typeof paperIngest_download;
  "paperIngest/http": typeof paperIngest_http;
  "paperIngest/identifiers": typeof paperIngest_identifiers;
  "paperIngest/ingest": typeof paperIngest_ingest;
  "paperIngest/model": typeof paperIngest_model;
  "paperIngest/providers": typeof paperIngest_providers;
  "paperIngest/resolve": typeof paperIngest_resolve;
  workspaceAccess: typeof workspaceAccess;
  workspaceDefaults: typeof workspaceDefaults;
  workspaceEmoji: typeof workspaceEmoji;
  workspaceFolders: typeof workspaceFolders;
  workspaceMoveModel: typeof workspaceMoveModel;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
