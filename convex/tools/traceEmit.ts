import { api } from "../_generated/api";
import type { ToolContext, TraceEmitInput } from "./types";

export async function emitTrace(ctx: ToolContext, input: TraceEmitInput) {
  return await ctx.runMutation(api.trace.emitTrace, input);
}
