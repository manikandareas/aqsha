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
import type * as agent_corpus from "../agent/corpus.js";
import type * as agent_deepResearch from "../agent/deepResearch.js";
import type * as agent_externalProviders from "../agent/externalProviders.js";
import type * as agent_messages from "../agent/messages.js";
import type * as agent_promptCommands from "../agent/promptCommands.js";
import type * as agent_rag from "../agent/rag.js";
import type * as agent_rateLimits from "../agent/rateLimits.js";
import type * as agent_researchTools from "../agent/researchTools.js";
import type * as agent_runtime from "../agent/runtime.js";
import type * as agent_sourceCandidates from "../agent/sourceCandidates.js";
import type * as agent_sources from "../agent/sources.js";
import type * as agent_threadTitles from "../agent/threadTitles.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_workflow from "../agent/workflow.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as limits from "../limits.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/artifacts": typeof agent_artifacts;
  "agent/astra": typeof agent_astra;
  "agent/corpus": typeof agent_corpus;
  "agent/deepResearch": typeof agent_deepResearch;
  "agent/externalProviders": typeof agent_externalProviders;
  "agent/messages": typeof agent_messages;
  "agent/promptCommands": typeof agent_promptCommands;
  "agent/rag": typeof agent_rag;
  "agent/rateLimits": typeof agent_rateLimits;
  "agent/researchTools": typeof agent_researchTools;
  "agent/runtime": typeof agent_runtime;
  "agent/sourceCandidates": typeof agent_sourceCandidates;
  "agent/sources": typeof agent_sources;
  "agent/threadTitles": typeof agent_threadTitles;
  "agent/threads": typeof agent_threads;
  "agent/workflow": typeof agent_workflow;
  auth: typeof auth;
  http: typeof http;
  limits: typeof limits;
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
};
