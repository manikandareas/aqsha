/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_artifacts from "../agent/artifacts.js";
import type * as agent_astra from "../agent/astra.js";
import type * as agent_deepResearch from "../agent/deepResearch.js";
import type * as agent_domainReliability from "../agent/domainReliability.js";
import type * as agent_externalProviders from "../agent/externalProviders.js";
import type * as agent_messages from "../agent/messages.js";
import type * as agent_promptCommands from "../agent/promptCommands.js";
import type * as agent_rag from "../agent/rag.js";
import type * as agent_ragContext from "../agent/ragContext.js";
import type * as agent_rateLimits from "../agent/rateLimits.js";
import type * as agent_researchTools from "../agent/researchTools.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_sourceCandidates from "../agent/sourceCandidates.js";
import type * as agent_sourceQuality from "../agent/sourceQuality.js";
import type * as agent_sources from "../agent/sources.js";
import type * as agent_threadContext from "../agent/threadContext.js";
import type * as agent_threadTitles from "../agent/threadTitles.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_workflow from "../agent/workflow.js";
import type * as artifactModel from "../artifactModel.js";
import type * as artifactUploads from "../artifactUploads.js";
import type * as artifacts from "../artifacts.js";
import type * as auth from "../auth.js";
import type * as billing_admin from "../billing/admin.js";
import type * as billing_catalog from "../billing/catalog.js";
import type * as billing_checkout from "../billing/checkout.js";
import type * as billing_current from "../billing/current.js";
import type * as billing_entitlements from "../billing/entitlements.js";
import type * as billing_polar from "../billing/polar.js";
import type * as billing_portal from "../billing/portal.js";
import type * as billing_products from "../billing/products.js";
import type * as billing_usage from "../billing/usage.js";
import type * as http from "../http.js";
import type * as limits from "../limits.js";
import type * as workspaceAccess from "../workspaceAccess.js";
import type * as workspaceFolders from "../workspaceFolders.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/artifacts": typeof agent_artifacts;
  "agent/astra": typeof agent_astra;
  "agent/deepResearch": typeof agent_deepResearch;
  "agent/domainReliability": typeof agent_domainReliability;
  "agent/externalProviders": typeof agent_externalProviders;
  "agent/messages": typeof agent_messages;
  "agent/promptCommands": typeof agent_promptCommands;
  "agent/rag": typeof agent_rag;
  "agent/ragContext": typeof agent_ragContext;
  "agent/rateLimits": typeof agent_rateLimits;
  "agent/researchTools": typeof agent_researchTools;
  "agent/runtime": typeof agent_runtime;
  "agent/sourceCandidates": typeof agent_sourceCandidates;
  "agent/sourceQuality": typeof agent_sourceQuality;
  "agent/sources": typeof agent_sources;
  "agent/threadContext": typeof agent_threadContext;
  "agent/threadTitles": typeof agent_threadTitles;
  "agent/threads": typeof agent_threads;
  "agent/workflow": typeof agent_workflow;
  artifactModel: typeof artifactModel;
  artifactUploads: typeof artifactUploads;
  artifacts: typeof artifacts;
  auth: typeof auth;
  "billing/admin": typeof billing_admin;
  "billing/catalog": typeof billing_catalog;
  "billing/checkout": typeof billing_checkout;
  "billing/current": typeof billing_current;
  "billing/entitlements": typeof billing_entitlements;
  "billing/polar": typeof billing_polar;
  "billing/portal": typeof billing_portal;
  "billing/products": typeof billing_products;
  "billing/usage": typeof billing_usage;
  http: typeof http;
  limits: typeof limits;
  workspaceAccess: typeof workspaceAccess;
  workspaceFolders: typeof workspaceFolders;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
