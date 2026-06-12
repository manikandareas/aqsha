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
import type * as agent_astra from "../agent/astra.js";
import type * as agent_context_contextBudget from "../agent/context/contextBudget.js";
import type * as agent_context_mentionMarkers from "../agent/context/mentionMarkers.js";
import type * as agent_context_rag from "../agent/context/rag.js";
import type * as agent_context_ragContext from "../agent/context/ragContext.js";
import type * as agent_context_resumeContext from "../agent/context/resumeContext.js";
import type * as agent_context_threadContext from "../agent/context/threadContext.js";
import type * as agent_context_threadContextWorkspaces from "../agent/context/threadContextWorkspaces.js";
import type * as agent_evals_devHarness from "../agent/evals/devHarness.js";
import type * as agent_evals_goldenSets from "../agent/evals/goldenSets.js";
import type * as agent_evals_scoring from "../agent/evals/scoring.js";
import type * as agent_evals_skillTriggerSurrogate from "../agent/evals/skillTriggerSurrogate.js";
import type * as agent_hitl_executeArtifactGate from "../agent/hitl/executeArtifactGate.js";
import type * as agent_hitl_hitlProvenance from "../agent/hitl/hitlProvenance.js";
import type * as agent_hitl_hitlResume from "../agent/hitl/hitlResume.js";
import type * as agent_hitl_hitlToolNames from "../agent/hitl/hitlToolNames.js";
import type * as agent_hitl_hitlTools from "../agent/hitl/hitlTools.js";
import type * as agent_hitl_hitlWorkspace from "../agent/hitl/hitlWorkspace.js";
import type * as agent_messages from "../agent/messages.js";
import type * as agent_models from "../agent/models.js";
import type * as agent_prompt_promptCommandParsing from "../agent/prompt/promptCommandParsing.js";
import type * as agent_prompt_promptCommands from "../agent/prompt/promptCommands.js";
import type * as agent_prompt_promptPayload from "../agent/prompt/promptPayload.js";
import type * as agent_prompt_promptRouting from "../agent/prompt/promptRouting.js";
import type * as agent_providers_domainReliability from "../agent/providers/domainReliability.js";
import type * as agent_providers_exaClient from "../agent/providers/exaClient.js";
import type * as agent_providers_externalProviders from "../agent/providers/externalProviders.js";
import type * as agent_providers_openalexProvider from "../agent/providers/openalexProvider.js";
import type * as agent_providers_providerCache from "../agent/providers/providerCache.js";
import type * as agent_providers_providers from "../agent/providers/providers.js";
import type * as agent_providers_userAgent from "../agent/providers/userAgent.js";
import type * as agent_rateLimits from "../agent/rateLimits.js";
import type * as agent_research_citationIntegrity from "../agent/research/citationIntegrity.js";
import type * as agent_research_citationRouter from "../agent/research/citationRouter.js";
import type * as agent_research_citationTools from "../agent/research/citationTools.js";
import type * as agent_research_claimEvidence from "../agent/research/claimEvidence.js";
import type * as agent_research_deepResearch from "../agent/research/deepResearch.js";
import type * as agent_research_deepResearchContract from "../agent/research/deepResearchContract.js";
import type * as agent_research_researchTools from "../agent/research/researchTools.js";
import type * as agent_research_sourceCandidates from "../agent/research/sourceCandidates.js";
import type * as agent_research_sourceQuality from "../agent/research/sourceQuality.js";
import type * as agent_research_sources from "../agent/research/sources.js";
import type * as agent_research_subagents_citationAgent from "../agent/research/subagents/citationAgent.js";
import type * as agent_research_subagents_contracts from "../agent/research/subagents/contracts.js";
import type * as agent_research_subagents_counterEvidenceAgent from "../agent/research/subagents/counterEvidenceAgent.js";
import type * as agent_research_subagents_literatureRoundAgent from "../agent/research/subagents/literatureRoundAgent.js";
import type * as agent_research_subagents_loopState from "../agent/research/subagents/loopState.js";
import type * as agent_research_subagents_runState from "../agent/research/subagents/runState.js";
import type * as agent_research_subagents_skillDelegation from "../agent/research/subagents/skillDelegation.js";
import type * as agent_research_subagents_writerAgent from "../agent/research/subagents/writerAgent.js";
import type * as agent_runLifecycle from "../agent/runLifecycle.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_sandbox_artifactText from "../agent/sandbox/artifactText.js";
import type * as agent_sandbox_claimExtraction from "../agent/sandbox/claimExtraction.js";
import type * as agent_sandbox_computationOutcome from "../agent/sandbox/computationOutcome.js";
import type * as agent_sandbox_computationRouting from "../agent/sandbox/computationRouting.js";
import type * as agent_sandbox_computationWorkflow from "../agent/sandbox/computationWorkflow.js";
import type * as agent_sandbox_computeRouter from "../agent/sandbox/computeRouter.js";
import type * as agent_sandbox_grimClassify from "../agent/sandbox/grimClassify.js";
import type * as agent_sandbox_metaAnalysisClassify from "../agent/sandbox/metaAnalysisClassify.js";
import type * as agent_sandbox_metaClaimExtraction from "../agent/sandbox/metaClaimExtraction.js";
import type * as agent_sandbox_powerClassify from "../agent/sandbox/powerClassify.js";
import type * as agent_sandbox_records from "../agent/sandbox/records.js";
import type * as agent_sandbox_sandboxRunner from "../agent/sandbox/sandboxRunner.js";
import type * as agent_sandbox_sandboxTools from "../agent/sandbox/sandboxTools.js";
import type * as agent_sandbox_sandboxVendor from "../agent/sandbox/sandboxVendor.js";
import type * as agent_sandbox_scripts_grim from "../agent/sandbox/scripts/grim.js";
import type * as agent_sandbox_scripts_metaanalysis from "../agent/sandbox/scripts/metaanalysis.js";
import type * as agent_sandbox_scripts_power from "../agent/sandbox/scripts/power.js";
import type * as agent_sandbox_scripts_statcheck from "../agent/sandbox/scripts/statcheck.js";
import type * as agent_sandbox_statcheckClassify from "../agent/sandbox/statcheckClassify.js";
import type * as agent_sandbox_verificationReport from "../agent/sandbox/verificationReport.js";
import type * as agent_service from "../agent/service.js";
import type * as agent_service_model from "../agent/service/model.js";
import type * as agent_skills_builtin_generated from "../agent/skills/builtin/generated.js";
import type * as agent_skills_builtin_index from "../agent/skills/builtin/index.js";
import type * as agent_skills_skillParser from "../agent/skills/skillParser.js";
import type * as agent_skills_skillRegistry from "../agent/skills/skillRegistry.js";
import type * as agent_skills_skillTools from "../agent/skills/skillTools.js";
import type * as agent_skills_skillUpload from "../agent/skills/skillUpload.js";
import type * as agent_skills_skills from "../agent/skills/skills.js";
import type * as agent_threadTitles from "../agent/threadTitles.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_tools_artifactCommandInference from "../agent/tools/artifactCommandInference.js";
import type * as agent_tools_artifacts from "../agent/tools/artifacts.js";
import type * as agent_tools_toolContext from "../agent/tools/toolContext.js";
import type * as agent_tools_workspaceCommandInference from "../agent/tools/workspaceCommandInference.js";
import type * as agent_v2 from "../agent/v2.js";
import type * as agent_v2_interactions from "../agent/v2/interactions.js";
import type * as agent_v2_queries from "../agent/v2/queries.js";
import type * as agent_workflow from "../agent/workflow.js";
import type * as artifacts from "../artifacts.js";
import type * as artifacts_model from "../artifacts/model.js";
import type * as artifacts_uploadLimits from "../artifacts/uploadLimits.js";
import type * as artifacts_uploadPolicy from "../artifacts/uploadPolicy.js";
import type * as artifacts_uploads from "../artifacts/uploads.js";
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
import type * as billing_reconciliation from "../billing/reconciliation.js";
import type * as billing_subscription from "../billing/subscription.js";
import type * as billing_usage from "../billing/usage.js";
import type * as billing_usageShape from "../billing/usageShape.js";
import type * as billing_validators from "../billing/validators.js";
import type * as crons from "../crons.js";
import type * as explore from "../explore.js";
import type * as explore_model from "../explore/model.js";
import type * as explore_validators from "../explore/validators.js";
import type * as feed from "../feed.js";
import type * as feed_ai from "../feed/ai.js";
import type * as feed_bahasa from "../feed/bahasa.js";
import type * as feed_claims from "../feed/claims.js";
import type * as feed_consensus from "../feed/consensus.js";
import type * as feed_ideas from "../feed/ideas.js";
import type * as feed_interests from "../feed/interests.js";
import type * as feed_model from "../feed/model.js";
import type * as feed_openAlex from "../feed/openAlex.js";
import type * as feed_providers_factCheck from "../feed/providers/factCheck.js";
import type * as feed_providers_gdelt from "../feed/providers/gdelt.js";
import type * as feed_providers_news from "../feed/providers/news.js";
import type * as feed_sources from "../feed/sources.js";
import type * as feed_validators from "../feed/validators.js";
import type * as http from "../http.js";
import type * as lib_appError from "../lib/appError.js";
import type * as lib_arrays from "../lib/arrays.js";
import type * as lib_identifiers from "../lib/identifiers.js";
import type * as lib_paperTypes from "../lib/paperTypes.js";
import type * as lib_similarity from "../lib/similarity.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_userImage from "../lib/userImage.js";
import type * as limits from "../limits.js";
import type * as onboarding from "../onboarding.js";
import type * as papers_articlePreview from "../papers/articlePreview.js";
import type * as papers_extractions from "../papers/extractions.js";
import type * as papers_grobid_grobidClient from "../papers/grobid/grobidClient.js";
import type * as papers_grobid_teiParser from "../papers/grobid/teiParser.js";
import type * as papers_ingest_download from "../papers/ingest/download.js";
import type * as papers_ingest_http from "../papers/ingest/http.js";
import type * as papers_ingest_identifiers from "../papers/ingest/identifiers.js";
import type * as papers_ingest_ingest from "../papers/ingest/ingest.js";
import type * as papers_ingest_model from "../papers/ingest/model.js";
import type * as papers_ingest_providers from "../papers/ingest/providers.js";
import type * as papers_ingest_resolve from "../papers/ingest/resolve.js";
import type * as papers_ingest_uploadIdentifiers from "../papers/ingest/uploadIdentifiers.js";
import type * as papers_metadataEnrichment from "../papers/metadataEnrichment.js";
import type * as workspaces from "../workspaces.js";
import type * as workspaces_access from "../workspaces/access.js";
import type * as workspaces_defaults from "../workspaces/defaults.js";
import type * as workspaces_emoji from "../workspaces/emoji.js";
import type * as workspaces_folders from "../workspaces/folders.js";
import type * as workspaces_moveModel from "../workspaces/moveModel.js";

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
  "agent/astra": typeof agent_astra;
  "agent/context/contextBudget": typeof agent_context_contextBudget;
  "agent/context/mentionMarkers": typeof agent_context_mentionMarkers;
  "agent/context/rag": typeof agent_context_rag;
  "agent/context/ragContext": typeof agent_context_ragContext;
  "agent/context/resumeContext": typeof agent_context_resumeContext;
  "agent/context/threadContext": typeof agent_context_threadContext;
  "agent/context/threadContextWorkspaces": typeof agent_context_threadContextWorkspaces;
  "agent/evals/devHarness": typeof agent_evals_devHarness;
  "agent/evals/goldenSets": typeof agent_evals_goldenSets;
  "agent/evals/scoring": typeof agent_evals_scoring;
  "agent/evals/skillTriggerSurrogate": typeof agent_evals_skillTriggerSurrogate;
  "agent/hitl/executeArtifactGate": typeof agent_hitl_executeArtifactGate;
  "agent/hitl/hitlProvenance": typeof agent_hitl_hitlProvenance;
  "agent/hitl/hitlResume": typeof agent_hitl_hitlResume;
  "agent/hitl/hitlToolNames": typeof agent_hitl_hitlToolNames;
  "agent/hitl/hitlTools": typeof agent_hitl_hitlTools;
  "agent/hitl/hitlWorkspace": typeof agent_hitl_hitlWorkspace;
  "agent/messages": typeof agent_messages;
  "agent/models": typeof agent_models;
  "agent/prompt/promptCommandParsing": typeof agent_prompt_promptCommandParsing;
  "agent/prompt/promptCommands": typeof agent_prompt_promptCommands;
  "agent/prompt/promptPayload": typeof agent_prompt_promptPayload;
  "agent/prompt/promptRouting": typeof agent_prompt_promptRouting;
  "agent/providers/domainReliability": typeof agent_providers_domainReliability;
  "agent/providers/exaClient": typeof agent_providers_exaClient;
  "agent/providers/externalProviders": typeof agent_providers_externalProviders;
  "agent/providers/openalexProvider": typeof agent_providers_openalexProvider;
  "agent/providers/providerCache": typeof agent_providers_providerCache;
  "agent/providers/providers": typeof agent_providers_providers;
  "agent/providers/userAgent": typeof agent_providers_userAgent;
  "agent/rateLimits": typeof agent_rateLimits;
  "agent/research/citationIntegrity": typeof agent_research_citationIntegrity;
  "agent/research/citationRouter": typeof agent_research_citationRouter;
  "agent/research/citationTools": typeof agent_research_citationTools;
  "agent/research/claimEvidence": typeof agent_research_claimEvidence;
  "agent/research/deepResearch": typeof agent_research_deepResearch;
  "agent/research/deepResearchContract": typeof agent_research_deepResearchContract;
  "agent/research/researchTools": typeof agent_research_researchTools;
  "agent/research/sourceCandidates": typeof agent_research_sourceCandidates;
  "agent/research/sourceQuality": typeof agent_research_sourceQuality;
  "agent/research/sources": typeof agent_research_sources;
  "agent/research/subagents/citationAgent": typeof agent_research_subagents_citationAgent;
  "agent/research/subagents/contracts": typeof agent_research_subagents_contracts;
  "agent/research/subagents/counterEvidenceAgent": typeof agent_research_subagents_counterEvidenceAgent;
  "agent/research/subagents/literatureRoundAgent": typeof agent_research_subagents_literatureRoundAgent;
  "agent/research/subagents/loopState": typeof agent_research_subagents_loopState;
  "agent/research/subagents/runState": typeof agent_research_subagents_runState;
  "agent/research/subagents/skillDelegation": typeof agent_research_subagents_skillDelegation;
  "agent/research/subagents/writerAgent": typeof agent_research_subagents_writerAgent;
  "agent/runLifecycle": typeof agent_runLifecycle;
  "agent/runtime": typeof agent_runtime;
  "agent/sandbox/artifactText": typeof agent_sandbox_artifactText;
  "agent/sandbox/claimExtraction": typeof agent_sandbox_claimExtraction;
  "agent/sandbox/computationOutcome": typeof agent_sandbox_computationOutcome;
  "agent/sandbox/computationRouting": typeof agent_sandbox_computationRouting;
  "agent/sandbox/computationWorkflow": typeof agent_sandbox_computationWorkflow;
  "agent/sandbox/computeRouter": typeof agent_sandbox_computeRouter;
  "agent/sandbox/grimClassify": typeof agent_sandbox_grimClassify;
  "agent/sandbox/metaAnalysisClassify": typeof agent_sandbox_metaAnalysisClassify;
  "agent/sandbox/metaClaimExtraction": typeof agent_sandbox_metaClaimExtraction;
  "agent/sandbox/powerClassify": typeof agent_sandbox_powerClassify;
  "agent/sandbox/records": typeof agent_sandbox_records;
  "agent/sandbox/sandboxRunner": typeof agent_sandbox_sandboxRunner;
  "agent/sandbox/sandboxTools": typeof agent_sandbox_sandboxTools;
  "agent/sandbox/sandboxVendor": typeof agent_sandbox_sandboxVendor;
  "agent/sandbox/scripts/grim": typeof agent_sandbox_scripts_grim;
  "agent/sandbox/scripts/metaanalysis": typeof agent_sandbox_scripts_metaanalysis;
  "agent/sandbox/scripts/power": typeof agent_sandbox_scripts_power;
  "agent/sandbox/scripts/statcheck": typeof agent_sandbox_scripts_statcheck;
  "agent/sandbox/statcheckClassify": typeof agent_sandbox_statcheckClassify;
  "agent/sandbox/verificationReport": typeof agent_sandbox_verificationReport;
  "agent/service": typeof agent_service;
  "agent/service/model": typeof agent_service_model;
  "agent/skills/builtin/generated": typeof agent_skills_builtin_generated;
  "agent/skills/builtin/index": typeof agent_skills_builtin_index;
  "agent/skills/skillParser": typeof agent_skills_skillParser;
  "agent/skills/skillRegistry": typeof agent_skills_skillRegistry;
  "agent/skills/skillTools": typeof agent_skills_skillTools;
  "agent/skills/skillUpload": typeof agent_skills_skillUpload;
  "agent/skills/skills": typeof agent_skills_skills;
  "agent/threadTitles": typeof agent_threadTitles;
  "agent/threads": typeof agent_threads;
  "agent/tools/artifactCommandInference": typeof agent_tools_artifactCommandInference;
  "agent/tools/artifacts": typeof agent_tools_artifacts;
  "agent/tools/toolContext": typeof agent_tools_toolContext;
  "agent/tools/workspaceCommandInference": typeof agent_tools_workspaceCommandInference;
  "agent/v2": typeof agent_v2;
  "agent/v2/interactions": typeof agent_v2_interactions;
  "agent/v2/queries": typeof agent_v2_queries;
  "agent/workflow": typeof agent_workflow;
  artifacts: typeof artifacts;
  "artifacts/model": typeof artifacts_model;
  "artifacts/uploadLimits": typeof artifacts_uploadLimits;
  "artifacts/uploadPolicy": typeof artifacts_uploadPolicy;
  "artifacts/uploads": typeof artifacts_uploads;
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
  "billing/reconciliation": typeof billing_reconciliation;
  "billing/subscription": typeof billing_subscription;
  "billing/usage": typeof billing_usage;
  "billing/usageShape": typeof billing_usageShape;
  "billing/validators": typeof billing_validators;
  crons: typeof crons;
  explore: typeof explore;
  "explore/model": typeof explore_model;
  "explore/validators": typeof explore_validators;
  feed: typeof feed;
  "feed/ai": typeof feed_ai;
  "feed/bahasa": typeof feed_bahasa;
  "feed/claims": typeof feed_claims;
  "feed/consensus": typeof feed_consensus;
  "feed/ideas": typeof feed_ideas;
  "feed/interests": typeof feed_interests;
  "feed/model": typeof feed_model;
  "feed/openAlex": typeof feed_openAlex;
  "feed/providers/factCheck": typeof feed_providers_factCheck;
  "feed/providers/gdelt": typeof feed_providers_gdelt;
  "feed/providers/news": typeof feed_providers_news;
  "feed/sources": typeof feed_sources;
  "feed/validators": typeof feed_validators;
  http: typeof http;
  "lib/appError": typeof lib_appError;
  "lib/arrays": typeof lib_arrays;
  "lib/identifiers": typeof lib_identifiers;
  "lib/paperTypes": typeof lib_paperTypes;
  "lib/similarity": typeof lib_similarity;
  "lib/text": typeof lib_text;
  "lib/userImage": typeof lib_userImage;
  limits: typeof limits;
  onboarding: typeof onboarding;
  "papers/articlePreview": typeof papers_articlePreview;
  "papers/extractions": typeof papers_extractions;
  "papers/grobid/grobidClient": typeof papers_grobid_grobidClient;
  "papers/grobid/teiParser": typeof papers_grobid_teiParser;
  "papers/ingest/download": typeof papers_ingest_download;
  "papers/ingest/http": typeof papers_ingest_http;
  "papers/ingest/identifiers": typeof papers_ingest_identifiers;
  "papers/ingest/ingest": typeof papers_ingest_ingest;
  "papers/ingest/model": typeof papers_ingest_model;
  "papers/ingest/providers": typeof papers_ingest_providers;
  "papers/ingest/resolve": typeof papers_ingest_resolve;
  "papers/ingest/uploadIdentifiers": typeof papers_ingest_uploadIdentifiers;
  "papers/metadataEnrichment": typeof papers_metadataEnrichment;
  workspaces: typeof workspaces;
  "workspaces/access": typeof workspaces_access;
  "workspaces/defaults": typeof workspaces_defaults;
  "workspaces/emoji": typeof workspaces_emoji;
  "workspaces/folders": typeof workspaces_folders;
  "workspaces/moveModel": typeof workspaces_moveModel;
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
