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
import type * as agents_businessResearch from "../agents/businessResearch.js";
import type * as agents_businessResearchContract from "../agents/businessResearchContract.js";
import type * as agents_helpers from "../agents/helpers.js";
import type * as agents_llm from "../agents/llm.js";
import type * as agents_manager from "../agents/manager.js";
import type * as agents_menuEvidence from "../agents/menuEvidence.js";
import type * as agents_menuResearch from "../agents/menuResearch.js";
import type * as agents_roles from "../agents/roles.js";
import type * as agents_specialist from "../agents/specialist.js";
import type * as evals from "../evals.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as orchestrator from "../orchestrator.js";
import type * as researchEvals from "../researchEvals.js";
import type * as seed from "../seed.js";
import type * as tools_citationPersistenceMutations from "../tools/citationPersistenceMutations.js";
import type * as tools_citationsPersist from "../tools/citationsPersist.js";
import type * as tools_index from "../tools/index.js";
import type * as tools_linkupFetch from "../tools/linkupFetch.js";
import type * as tools_linkupSearch from "../tools/linkupSearch.js";
import type * as tools_registry from "../tools/registry.js";
import type * as tools_traceEmit from "../tools/traceEmit.js";
import type * as tools_types from "../tools/types.js";
import type * as trace from "../trace.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agency: typeof agency;
  "agents/businessResearch": typeof agents_businessResearch;
  "agents/businessResearchContract": typeof agents_businessResearchContract;
  "agents/helpers": typeof agents_helpers;
  "agents/llm": typeof agents_llm;
  "agents/manager": typeof agents_manager;
  "agents/menuEvidence": typeof agents_menuEvidence;
  "agents/menuResearch": typeof agents_menuResearch;
  "agents/roles": typeof agents_roles;
  "agents/specialist": typeof agents_specialist;
  evals: typeof evals;
  http: typeof http;
  jobs: typeof jobs;
  orchestrator: typeof orchestrator;
  researchEvals: typeof researchEvals;
  seed: typeof seed;
  "tools/citationPersistenceMutations": typeof tools_citationPersistenceMutations;
  "tools/citationsPersist": typeof tools_citationsPersist;
  "tools/index": typeof tools_index;
  "tools/linkupFetch": typeof tools_linkupFetch;
  "tools/linkupSearch": typeof tools_linkupSearch;
  "tools/registry": typeof tools_registry;
  "tools/traceEmit": typeof tools_traceEmit;
  "tools/types": typeof tools_types;
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
