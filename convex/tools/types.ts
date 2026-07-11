import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { CitationsPersistInput, CitationsPersistOutput } from "./citationsPersist";
import type { LinkupSearchInput, LinkupSearchOutput } from "./linkupSearch";
import type { LinkupFetchInput, LinkupFetchOutput } from "./linkupFetch";

export type ToolContext = Pick<ActionCtx, "runMutation">;

export type TraceEmitInput = {
  jobId: Id<"jobs">;
  taskId?: Id<"tasks">;
  parentRole?: string;
  role: string;
  phase: "plan" | "delegate" | "tool_call" | "llm_call" | "review" | "artifact_write" | "publish" | "error";
  summary: string;
  input?: unknown;
  output?: unknown;
  toolName?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  costEstimate?: number;
  durationMs?: number;
};

export type ToolInputs = {
  "trace.emit": TraceEmitInput;
  "citations.persist": CitationsPersistInput;
  "linkup.search": LinkupSearchInput;
  "linkup.fetch": LinkupFetchInput;
};

export type ToolOutputs = {
  "trace.emit": Id<"traceEvents">;
  "citations.persist": CitationsPersistOutput;
  "linkup.search": LinkupSearchOutput;
  "linkup.fetch": LinkupFetchOutput;
};
export type ToolName = keyof ToolInputs;
