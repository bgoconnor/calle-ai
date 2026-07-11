import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { IntakeAdapter } from "../features/intake";
import type { ControlJob, ControlRoomAdapter, ControlRoomDetail } from "../features/control-room";
import type { PublishedSite } from "../public/types";

export function createAgencyClient(url: string) {
  return new ConvexHttpClient(url);
}

export function createLiveIntakeAdapter(url: string): IntakeAdapter {
  const client = createAgencyClient(url);
  return {
    async createDraft(input) {
      const result = await client.mutation(api.agency.createJobFromPrompt, {
        prompt: input.brief,
        businessName: input.businessName,
        businessType: input.category,
        languages: [input.primaryLanguage ?? "es", input.secondaryLanguage ?? "en"],
        address: input.city,
        sourceUrls: input.sourceUrls,
        approvalMode: input.approvalMode,
      });
      return { jobId: result.jobId, structuredBrief: result.structuredBrief };
    },
    async updateDraft(jobId, input) {
      await client.mutation(api.agency.updateBrief, { jobId: jobId as Id<"jobs">, brief: input.brief, structuredBrief: input.structuredBrief });
    },
    async launch(jobId) {
      await client.mutation(api.agency.startJob, { jobId: jobId as Id<"jobs">, publicBaseUrl: window.location.origin });
      return { jobId };
    },
  };
}

export function createLiveControlAdapter(url: string): ControlRoomAdapter {
  const client = createAgencyClient(url);
  return {
    mode: "live",
    async listJobs() {
      return await client.query(api.agency.getControlRoomJobs, {}) as ControlJob[];
    },
    async getJob(id) {
      return await client.query(api.agency.getControlRoomJob, { jobId: id as Id<"jobs"> }) as ControlRoomDetail | null;
    },
    async approveArtifact(id) {
      await client.mutation(api.agency.approveArtifact, { artifactId: id as Id<"artifacts"> });
    },
    async requestChanges(id, note) {
      await client.mutation(api.agency.requestArtifactRevision, { artifactId: id as Id<"artifacts">, note });
    },
    async retryTask(id) {
      await client.mutation(api.agency.retryTask, { taskId: id as Id<"tasks"> });
    },
    async publish(job) {
      await client.mutation(api.agency.publishJob, { jobId: job.id as Id<"jobs">, publicBaseUrl: window.location.origin });
    },
    async unpublish(job) {
      await client.mutation(api.agency.unpublishJob, { jobId: job.id as Id<"jobs"> });
    },
  };
}

export async function fetchPublishedSite(url: string, slug: string) {
  const client = createAgencyClient(url);
  return await client.query(api.agency.getPublishedSite, { slug }) as PublishedSite | null;
}
