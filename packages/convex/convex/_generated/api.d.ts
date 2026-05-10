/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as astra from "../astra.js";
import type * as auth from "../auth.js";
import type * as corpus from "../corpus.js";
import type * as externalProviders from "../externalProviders.js";
import type * as http from "../http.js";
import type * as limits from "../limits.js";
import type * as messages from "../messages.js";
import type * as rag from "../rag.js";
import type * as rateLimits from "../rateLimits.js";
import type * as researchTools from "../researchTools.js";
import type * as sourceCandidates from "../sourceCandidates.js";
import type * as sources from "../sources.js";
import type * as threads from "../threads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  astra: typeof astra;
  auth: typeof auth;
  corpus: typeof corpus;
  externalProviders: typeof externalProviders;
  http: typeof http;
  limits: typeof limits;
  messages: typeof messages;
  rag: typeof rag;
  rateLimits: typeof rateLimits;
  researchTools: typeof researchTools;
  sourceCandidates: typeof sourceCandidates;
  sources: typeof sources;
  threads: typeof threads;
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
};
