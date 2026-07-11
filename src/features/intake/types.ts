import type { BriefInput, StructuredBrief } from "../../lib/agency-contract";

export type BriefDraft = BriefInput & { sourceUrls: string[]; files: File[] };

export type LaunchResult = { jobId: string };

/**
 * The only backend boundary used by the intake feature. A Convex-aware caller
 * can provide an adapter; the exported mock keeps the UI demoable offline.
 */
export interface IntakeAdapter {
  createDraft(input: BriefInput): Promise<{ jobId: string; structuredBrief: StructuredBrief }>;
  updateDraft(jobId: string, input: Pick<BriefInput, "brief"> & { structuredBrief: StructuredBrief }): Promise<void>;
  launch(jobId: string): Promise<LaunchResult>;
}

export type IntakeProps = {
  adapter?: IntakeAdapter;
  integrationWorkerUrl?: string;
  onLaunched?: (result: LaunchResult) => void;
  initialBrief?: string;
};

export type VoiceState = "idle" | "recording" | "transcribing" | "unavailable" | "error";
