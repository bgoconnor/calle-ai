import { persistCitations } from "./citationsPersist";
import { linkupSearch } from "./linkupSearch";
import { emitTrace } from "./traceEmit";
import type { ToolContext, ToolInputs, ToolName, ToolOutputs } from "./types";

const tools = {
  "trace.emit": emitTrace,
  "citations.persist": persistCitations,
  "linkup.search": linkupSearch,
};

export async function callTool<Name extends ToolName>(
  ctx: ToolContext,
  name: Name,
  input: ToolInputs[Name],
): Promise<ToolOutputs[Name]> {
  const tool = tools[name] as unknown as (
    context: ToolContext,
    args: ToolInputs[Name],
  ) => Promise<ToolOutputs[Name]>;
  return await tool(ctx, input);
}
