/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agency from "../agency.js";
import type * as http from "../http.js";
import type * as agents_helpers from "../agents/helpers.js";
import type * as agents_llm from "../agents/llm.js";
import type * as agents_roles from "../agents/roles.js";
import type * as agents_specialist from "../agents/specialist.js";
import type * as jobs from "../jobs.js";
import type * as orchestrator from "../orchestrator.js";
import type * as seed from "../seed.js";
import type * as trace from "../trace.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agency: typeof agency;
  http: typeof http;
  "agents/helpers": typeof agents_helpers;
  "agents/llm": typeof agents_llm;
  "agents/roles": typeof agents_roles;
  "agents/specialist": typeof agents_specialist;
  jobs: typeof jobs;
  orchestrator: typeof orchestrator;
  seed: typeof seed;
  trace: typeof trace;
  validators: typeof validators;
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

export declare const components: {};
