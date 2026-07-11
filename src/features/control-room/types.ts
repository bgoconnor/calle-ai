export type JobStatus = "brief_review" | "queued" | "running" | "needs_review" | "ready_to_publish" | "published" | "failed";
export type TaskStatus = "queued" | "running" | "complete" | "needs_review" | "failed";
export type ApprovalStatus = "pending" | "approved" | "changes_requested" | "escalated";

export type ControlJob = {
  id: string; businessId: string; businessName: string; category: string; city: string;
  approvalMode?: "autonomous" | "require_approval";
  status: JobStatus; brief: string; managerPlan: Array<{ agent: string; task: string; tools: string[] }>;
  publishState: "draft" | "published" | "unpublished"; publishedUrl?: string; createdAt: number; updatedAt: number;
};
export type ControlTask = {
  id: string; parentTaskId?: string; agent: string; title: string; status: TaskStatus;
  tools: string[]; inputSummary: string; outputSummary: string; latencyMs: number; tokenEstimate: number; costUsd: number;
};
export type ControlArtifact = {
  id: string; taskId?: string; kind: string; title: string; payload: unknown; confidence: number;
  approvalStatus: ApprovalStatus; version: number; createdAt: number;
};
export type ControlCitation = { id: string; artifactId?: string; title: string; url: string; snippet: string; query: string; retrievedAt: number };
export type ControlTrace = {
  id: string; taskId?: string; parentTaskId?: string; parentRole?: string;
  agent: string; event: string; summary: string; inputSummary: string; outputSummary: string;
  tools: string[]; model?: string; latencyMs: number; tokenEstimate: number; costUsd: number; createdAt: number;
};
export type ControlRoomDetail = { job: ControlJob; tasks: ControlTask[]; artifacts: ControlArtifact[]; citations: ControlCitation[]; traces: ControlTrace[]; siteVersionId?: string };

export type ControlRoomAdapter = {
  mode: "demo" | "live";
  listJobs(): Promise<ControlJob[]>;
  getJob(id: string): Promise<ControlRoomDetail | null>;
  approveArtifact(id: string): Promise<void>;
  requestChanges(id: string, note: string): Promise<void>;
  retryTask(id: string): Promise<void>;
  publish(job: ControlJob, siteVersionId?: string): Promise<void>;
  unpublish?(job: ControlJob): Promise<void>;
};
