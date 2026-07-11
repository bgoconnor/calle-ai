import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { api } from "./_generated/api";

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleFor = (kind: string) => kind.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");

const defaultGuardrails = [
  "Preserve original-language dish and service names.",
  "Never infer prices, dietary claims, hours, or business facts from incomplete sources.",
  "Research-derived claims require citations.",
  "Escalate low-confidence facts instead of fabricating them.",
];

const specialistPlan = (type: string) => {
  const restaurant = /restaurant|food|bakery|cafe/i.test(type);
  return [
    { order: 1, role: "Intake & Evidence", purpose: "Build an evidence ledger and canonical fact sheet", inputKinds: ["brief", "assets"] },
    { order: 2, role: restaurant ? "Menu Structuring" : "Service Catalog Structuring", purpose: restaurant ? "Extract menu categories, names, prices, and uncertainty" : "Extract service categories, durations, prices, and uncertainty", inputKinds: ["business_facts"] },
    { order: 3, role: "Cultural Localization", purpose: "Create bilingual, culturally respectful customer content", inputKinds: ["menu_catalog", "business_facts"] },
    { order: 4, role: "Local Discovery Research", purpose: "Research regional context and local-discovery wording with attributable sources", inputKinds: ["business_facts"] },
    { order: 5, role: "Publisher & QA", purpose: "Assemble the microsite and delivery pack, then validate required fields", inputKinds: ["bilingual_content", "research"] },
  ];
};

function portableJobStatus(status: Doc<"jobs">["status"], published: boolean) {
  if (published) return "published";
  if (status === "planning" || status === "running") return "running";
  if (status === "awaiting_approval" || status === "escalated") return "needs_review";
  if (status === "publishing" || status === "completed") return "ready_to_publish";
  if (status === "failed") return "failed";
  return "brief_review";
}

function portableTaskStatus(status: Doc<"tasks">["status"]) {
  if (status === "succeeded") return "complete";
  if (status === "revision_requested" || status === "escalated") return "needs_review";
  if (status === "pending") return "queued";
  return status;
}

function managerTaskStatus(status: Doc<"jobs">["status"]) {
  if (status === "failed") return "failed";
  if (status === "planning" || status === "running" || status === "publishing") return "running";
  if (status === "awaiting_approval" || status === "escalated") return "needs_review";
  if (status === "queued") return "queued";
  return "complete";
}

/** Minimal NL entrypoint. Research/manager actions can enrich the placeholder business later. */
export const createJobFromPrompt = mutation({
  args: {
    prompt: v.string(),
    businessName: v.optional(v.string()),
    businessType: v.optional(v.string()),
    languages: v.optional(v.array(v.string())),
    mapsUrl: v.optional(v.string()),
    address: v.optional(v.string()),
    sourceUrls: v.optional(v.array(v.string())),
    approvalMode: v.optional(v.union(v.literal("autonomous"), v.literal("require_approval"))),
  },
  handler: async (ctx, args) => {
    const name = args.businessName?.trim() || "Business pending research";
    const baseSlug = slugify(name) || "research-pending";
    const slug = args.businessName ? baseSlug : `${baseSlug}-${Date.now().toString(36)}`;
    const existing = args.businessName
      ? await ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
      : null;
    const businessId = existing?._id ?? await ctx.db.insert("businesses", {
      slug,
      name,
      type: args.businessType || "local_business",
      languages: args.languages?.length ? args.languages : ["es", "en"],
      mapsUrl: args.mapsUrl,
      address: args.address,
      notes: "Business identity and facts must be verified by the research agent.",
    });
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.businessType ? { type: args.businessType } : {}),
        ...(args.languages?.length ? { languages: args.languages } : {}),
        ...(args.mapsUrl ? { mapsUrl: args.mapsUrl } : {}),
        ...(args.address ? { address: args.address } : {}),
        notes: "Business identity and facts must be re-verified by the research agent for this job.",
      });
    }
    const jobId = await ctx.db.insert("jobs", {
      businessId,
      status: "queued",
      approvalMode: args.approvalMode ?? "autonomous",
      requiredDeliverables: ["microsite", "catalog", "gbp_pack", "report"],
      guardrails: defaultGuardrails.join("\n"),
    });
    const briefArtifactId = await ctx.db.insert("artifacts", {
      jobId,
      businessId,
      kind: "brief",
      version: 1,
      producedByRole: "Operator",
      data: { prompt: args.prompt, sourceUrls: args.sourceUrls ?? [] },
      confidence: 1,
    });
    await ctx.db.patch(jobId, { briefArtifactId });
    await ctx.db.insert("policies", { scope: "business", businessId, key: "operator_brief", value: args.prompt, version: 1, sourceArtifactId: briefArtifactId });
    await ctx.db.insert("traceEvents", { jobId, parentRole: "Operator", role: "Agency Manager", phase: "plan", summary: "Natural-language agency job created", input: { prompt: args.prompt }, output: { jobId, businessId } });
    return {
      jobId,
      businessId,
      structuredBrief: {
        objective: "Research the business and publish a bilingual local-presence pack",
        business: { name, city: args.address || "Research pending", category: args.businessType || "Local business" },
        languages: { primary: args.languages?.[0] || "es", secondary: args.languages?.[1] || "en" },
        deliverables: ["Bilingual microsite", "Structured catalog", "Listing improvement pack", "Delivery report"],
        guardrails: defaultGuardrails,
        sourceStrategy: ["Linkup live research", "Operator-provided URLs and assets", "Exception escalation for uncertain facts"],
      },
    };
  },
});

/** Queue the long-running agency action and return immediately to the UI. */
export const startJob = mutation({
  args: { jobId: v.id("jobs"), publicBaseUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, api.orchestrator.runJob, args);
    return { jobId: args.jobId };
  },
});

/** Compatibility entrypoint for the detailed intake UI. */
export const createJob = mutation({
  args: { brief: v.string(), businessName: v.string(), city: v.string(), category: v.string(), primaryLanguage: v.optional(v.string()), secondaryLanguage: v.optional(v.string()), sourceUrls: v.optional(v.array(v.string())), approvalMode: v.optional(v.union(v.literal("autonomous"), v.literal("require_approval"))) },
  handler: async (ctx, args) => {
    const slug = slugify(args.businessName);
    const existing = await ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    const businessId = existing?._id ?? await ctx.db.insert("businesses", { slug, name: args.businessName, type: args.category, languages: [args.primaryLanguage || "es", args.secondaryLanguage || "en"], address: args.city });
    const jobId = await ctx.db.insert("jobs", { businessId, status: "queued", approvalMode: args.approvalMode ?? "autonomous", requiredDeliverables: ["microsite", "catalog", "gbp_pack", "report"], guardrails: defaultGuardrails.join("\n") });
    const briefArtifactId = await ctx.db.insert("artifacts", { jobId, businessId, kind: "brief", version: 1, producedByRole: "Operator", data: { prompt: args.brief, sourceUrls: args.sourceUrls ?? [] }, confidence: 1 });
    await ctx.db.patch(jobId, { briefArtifactId });
    await ctx.db.insert("policies", { scope: "business", businessId, key: "operator_brief", value: args.brief, version: 1, sourceArtifactId: briefArtifactId });
    return { jobId, businessId, structuredBrief: { objective: "Create a bilingual local-business microsite and local-presence pack", business: { name: args.businessName, city: args.city, category: args.category }, languages: { primary: args.primaryLanguage || "es", secondary: args.secondaryLanguage || "en" }, deliverables: ["Bilingual microsite", "Structured catalog", "Listing improvement pack", "Delivery report"], guardrails: defaultGuardrails, sourceStrategy: ["Linkup live research", "Operator-provided sources"] } };
  },
});

export const updateBrief = mutation({
  args: { jobId: v.id("jobs"), brief: v.string(), structuredBrief: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    const previous = job.briefArtifactId ? await ctx.db.get(job.briefArtifactId) : null;
    const version = previous ? previous.version + 1 : 1;
    const briefArtifactId = await ctx.db.insert("artifacts", { jobId: args.jobId, businessId: job.businessId, kind: "brief", version, producedByRole: "Operator", data: { prompt: args.brief, structuredBrief: args.structuredBrief }, confidence: 1, supersedesId: previous?._id });
    await ctx.db.patch(args.jobId, { briefArtifactId, status: "queued" });
    await ctx.db.insert("policies", { scope: "business", businessId: job.businessId, key: "operator_brief", value: args.brief, version, sourceArtifactId: briefArtifactId });
    return args.jobId;
  },
});

/** Deterministic rubric/demo run, ported entirely to plans/tasks/artifacts/approvals/deployments. */
export const launchDeterministicRun = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const business = await ctx.db.get(job.businessId);
    if (!business) throw new Error("Business not found");
    const priorPlans = await ctx.db.query("plans").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect();
    const steps = specialistPlan(business.type);
    const planId = await ctx.db.insert("plans", { jobId, version: priorPlans.length + 1, steps, rationale: `Manager selected a ${business.type}-specific delivery plan.` });
    await ctx.db.patch(jobId, { status: "running", planId, startedAt: Date.now() });
    await ctx.db.insert("traceEvents", { jobId, parentRole: "Operator", role: "Agency Manager", phase: "plan", summary: `Created ${steps.length}-specialist plan`, input: { businessType: business.type }, output: { steps }, model: "deterministic-demo", durationMs: 180, costEstimate: 0 });

    let inputArtifactIds: Id<"artifacts">[] = job.briefArtifactId ? [job.briefArtifactId] : [];
    for (const step of steps) {
      const taskId = await ctx.db.insert("tasks", { jobId, planId, order: step.order, role: step.role, status: "running", inputArtifactIds, attempt: 1 });
      await ctx.db.insert("traceEvents", { jobId, taskId, parentRole: "Agency Manager", role: step.role, phase: "delegate", summary: step.purpose, input: { artifactIds: inputArtifactIds } });
      const output = demoArtifact(step.role, business);
      const artifactId = await ctx.db.insert("artifacts", { jobId, businessId: business._id, kind: output.kind, version: 1, producedByRole: step.role, taskId, data: output.data, confidence: output.confidence });
      const escalated = output.confidence < 0.85;
      await ctx.db.patch(taskId, { status: escalated ? "escalated" : "succeeded", outputArtifactId: artifactId, confidence: output.confidence, durationMs: 350 + step.order * 80, costEstimate: 0.004 + step.order * 0.002, blockerReason: escalated ? "Source evidence is below the publishing confidence threshold." : undefined });
      await ctx.db.insert("traceEvents", { jobId, taskId, parentRole: "Agency Manager", role: step.role, phase: "artifact_write", summary: `Wrote ${output.kind}`, output: output.data, model: "deterministic-demo", promptTokens: 180 + step.order * 30, completionTokens: 90 + step.order * 20, durationMs: 350 + step.order * 80, costEstimate: 0.004 + step.order * 0.002 });
      if (escalated) await ctx.db.insert("approvals", { jobId, taskId, type: "escalation", reason: "Low-confidence source field requires operator verification.", status: "open" });
      if (step.role === "Local Discovery Research") await ctx.db.insert("citations", { jobId, artifactId, claim: "Regional dish names should be preserved and contextually explained.", sourceUrl: "https://example.com/yucatan-cuisine", sourceTitle: "Yucatán cuisine context", snippet: "Deterministic fixture; replace with a persisted Linkup result.", origin: "linkup" });
      inputArtifactIds = [artifactId];
    }
    await ctx.db.patch(jobId, { status: "awaiting_approval", finishedAt: Date.now() });
    return { planId };
  },
});

export const approveEscalation = mutation({
  args: { approvalId: v.id("approvals"), resolutionNote: v.optional(v.string()), resolvedBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const approval = await ctx.db.get(args.approvalId);
    if (!approval) throw new Error("Approval not found");
    await ctx.db.patch(args.approvalId, { status: "approved", resolutionNote: args.resolutionNote, resolvedBy: args.resolvedBy || "Operator" });
    if (approval.taskId) await ctx.db.patch(approval.taskId, { status: "revision_requested", reviewNote: args.resolutionNote || "Operator verified the exception; rerun with this context." });
    return args.approvalId;
  },
});

export const approveArtifact = mutation({
  args: { artifactId: v.id("artifacts") },
  handler: async (ctx, { artifactId }) => {
    const artifact = await ctx.db.get(artifactId);
    if (!artifact) throw new Error("Artifact not found");
    const approvals = await ctx.db.query("approvals").withIndex("by_job", (q) => q.eq("jobId", artifact.jobId)).collect();
    const open = approvals.find((item) => item.taskId === artifact.taskId && item.status === "open");
    if (open) {
      await ctx.db.patch(open._id, { status: "approved", resolvedBy: "Operator", resolutionNote: "Artifact approved in the control room." });
      if (artifact.taskId) await ctx.db.patch(artifact.taskId, { status: "succeeded", blockerReason: undefined });
    }
    return artifactId;
  },
});

export const requestTaskRevision = mutation({
  args: { taskId: v.id("tasks"), note: v.string() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    await ctx.db.patch(args.taskId, { status: "revision_requested", reviewNote: args.note });
    await ctx.db.insert("traceEvents", { jobId: task.jobId, taskId: task._id, parentRole: "Operator", role: task.role, phase: "review", summary: "Operator requested a targeted revision", input: { note: args.note } });
    return args.taskId;
  },
});

export const requestArtifactRevision = mutation({
  args: { artifactId: v.id("artifacts"), note: v.string() },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact?.taskId) throw new Error("Artifact has no originating task");
    const task = await ctx.db.get(artifact.taskId);
    if (!task) throw new Error("Task not found");
    await ctx.db.patch(task._id, { status: "revision_requested", reviewNote: args.note });
    await ctx.db.insert("traceEvents", { jobId: task.jobId, taskId: task._id, parentRole: "Operator", role: task.role, phase: "review", summary: "Operator requested an artifact revision", input: { artifactId: artifact._id, note: args.note } });
    return task._id;
  },
});

export const retryTask = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task) throw new Error("Task not found");
    await ctx.db.patch(taskId, { status: "pending", attempt: task.attempt + 1, blockerReason: undefined });
    await ctx.db.insert("traceEvents", { jobId: task.jobId, taskId, parentRole: "Operator", role: task.role, phase: "delegate", summary: "Targeted retry queued", input: { priorAttempt: task.attempt, reviewNote: task.reviewNote } });
    return taskId;
  },
});

export const publishJob = mutation({
  args: { jobId: v.id("jobs"), publicBaseUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    const business = await ctx.db.get(job.businessId);
    if (!business) throw new Error("Business not found");
    const openApprovals = await ctx.db.query("approvals").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).collect();
    if (openApprovals.some((item) => item.status === "open")) throw new Error("Resolve open escalations before publishing");
    const microsites = await ctx.db.query("artifacts").withIndex("by_job_kind", (q) => q.eq("jobId", args.jobId).eq("kind", "microsite")).collect();
    const microsite = microsites.sort((a, b) => b.version - a.version)[0];
    if (!microsite) throw new Error("No microsite artifact is ready to publish");
    await ctx.db.patch(args.jobId, { status: "publishing" });
    const existing = await ctx.db.query("deployments").withIndex("by_slug", (q) => q.eq("slug", business.slug)).collect();
    for (const deployment of existing.filter((item) => item.status === "published")) await ctx.db.patch(deployment._id, { status: "superseded" });
    const version = existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const url = `${(args.publicBaseUrl || "").replace(/\/$/, "")}/b/${business.slug}` || `/b/${business.slug}`;
    const deploymentId = await ctx.db.insert("deployments", { jobId: args.jobId, businessId: business._id, slug: business.slug, version, url, micrositeArtifactId: microsite._id, status: "published" });
    await ctx.db.patch(args.jobId, { status: "completed", finishedAt: Date.now() });
    await ctx.db.insert("traceEvents", { jobId: args.jobId, parentRole: "Agency Manager", role: "Publisher & QA", phase: "publish", summary: "Published approved microsite", input: { artifactId: microsite._id }, output: { deploymentId, url } });
    return { deploymentId, slug: business.slug, url };
  },
});

export const publishBusiness = mutation({
  args: { businessId: v.id("businesses"), siteVersionId: v.optional(v.string()) },
  handler: async (ctx, { businessId }) => {
    const jobs = await ctx.db.query("jobs").withIndex("by_business", (q) => q.eq("businessId", businessId)).order("desc").collect();
    const job = jobs[0];
    if (!job) throw new Error("No job found for business");
    const microsites = await ctx.db.query("artifacts").withIndex("by_job_kind", (q) => q.eq("jobId", job._id).eq("kind", "microsite")).collect();
    const microsite = microsites.sort((a, b) => b.version - a.version)[0];
    if (!microsite) throw new Error("No microsite artifact is ready to publish");
    const business = await ctx.db.get(businessId);
    if (!business) throw new Error("Business not found");
    const existing = await ctx.db.query("deployments").withIndex("by_slug", (q) => q.eq("slug", business.slug)).collect();
    for (const deployment of existing.filter((item) => item.status === "published")) await ctx.db.patch(deployment._id, { status: "superseded" });
    const version = existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;
    const url = `/b/${business.slug}`;
    const deploymentId = await ctx.db.insert("deployments", { jobId: job._id, businessId, slug: business.slug, version, url, micrositeArtifactId: microsite._id, status: "published" });
    await ctx.db.patch(job._id, { status: "completed", finishedAt: Date.now() });
    return { deploymentId, slug: business.slug, url };
  },
});

export const unpublishJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const deployments = await ctx.db.query("deployments").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect();
    for (const deployment of deployments.filter((item) => item.status === "published")) await ctx.db.patch(deployment._id, { status: "superseded" });
    await ctx.db.patch(jobId, { status: "awaiting_approval" });
    await ctx.db.insert("traceEvents", { jobId, parentRole: "Operator", role: "Publisher & QA", phase: "publish", summary: "Public deployment was unpublished", output: { unpublished: true } });
    return jobId;
  },
});

export const getPublishedSite = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const deployments = await ctx.db.query("deployments").withIndex("by_slug", (q) => q.eq("slug", slug)).collect();
    const current = deployments.filter((item) => item.status === "published").sort((a, b) => b.version - a.version)[0];
    if (!current) return null;
    const artifact = await ctx.db.get(current.micrositeArtifactId);
    if (!artifact) return null;
    return { ...artifact.data, deployment: { id: current._id, version: current.version, url: current.url } };
  },
});

export const getControlRoomJobs = query({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").order("desc").collect();
    return Promise.all(jobs.map(async (job) => {
      const [business, brief, deployments] = await Promise.all([ctx.db.get(job.businessId), job.briefArtifactId ? ctx.db.get(job.briefArtifactId) : null, ctx.db.query("deployments").withIndex("by_job", (q) => q.eq("jobId", job._id)).collect()]);
      const published = deployments.find((item) => item.status === "published");
      return { id: job._id, businessId: job.businessId, businessName: business?.name || "Unknown business", category: business?.type || "Local business", city: business?.address || "Research pending", status: portableJobStatus(job.status, Boolean(published)), approvalMode: job.approvalMode ?? "autonomous", brief: String((brief?.data as { prompt?: string } | undefined)?.prompt || ""), managerPlan: [], publishState: published ? "published" : "draft", publishedUrl: published?.url, createdAt: job._creationTime, updatedAt: job.finishedAt || job.startedAt || job._creationTime };
    }));
  },
});

export const getControlRoomJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    const [business, brief, plan, tasks, artifacts, approvals, citations, traces, deployments] = await Promise.all([
      ctx.db.get(job.businessId),
      job.briefArtifactId ? ctx.db.get(job.briefArtifactId) : null,
      job.planId ? ctx.db.get(job.planId) : null,
      ctx.db.query("tasks").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect(),
      ctx.db.query("artifacts").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect(),
      ctx.db.query("approvals").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect(),
      ctx.db.query("citations").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect(),
      ctx.db.query("traceEvents").withIndex("by_job", (q) => q.eq("jobId", jobId)).order("asc").collect(),
      ctx.db.query("deployments").withIndex("by_job", (q) => q.eq("jobId", jobId)).collect(),
    ]);
    const published = deployments.find((item) => item.status === "published");
    const artifactKindById = new Map(artifacts.map((a) => [a._id, a.kind]));
    // Forward stored trace payloads to the Control Room, truncating large ones.
    const compact = (value: unknown) => {
      if (value === undefined || value === null) return value;
      const str = JSON.stringify(value);
      return str.length > 4000 ? `${str.slice(0, 4000)}… (truncated)` : value;
    };
    const managerEvents = traces.filter((item) => item.role === "Agency Manager");
    const managerTask = { id: `manager:${jobId}`, agent: "Agency Manager", title: "Plan, delegate, and review local-presence job", status: managerTaskStatus(job.status), tools: [...new Set(managerEvents.flatMap((event) => event.toolName ? [event.toolName] : []))], inputSummary: String((brief?.data as { prompt?: string } | undefined)?.prompt || "Natural-language brief"), outputSummary: job.error || (plan ? `Created ${plan.steps.length}-specialist plan` : "Waiting to plan"), latencyMs: managerEvents.reduce((sum, item) => sum + (item.durationMs || 0), 0), tokenEstimate: managerEvents.reduce((sum, item) => sum + (item.promptTokens || 0) + (item.completionTokens || 0), 0), costUsd: managerEvents.reduce((sum, item) => sum + (item.costEstimate || 0), 0) };
    const portableTasks = tasks.sort((a, b) => a.order - b.order).map((task) => {
      const events = traces.filter((item) => item.taskId === task._id);
      const outputEvent = [...events].reverse().find((event) => event.output);
      return { id: task._id, parentTaskId: managerTask.id, agent: task.role, title: plan?.steps.find((step) => step.order === task.order)?.purpose || task.role, status: portableTaskStatus(task.status), tools: [...new Set(events.flatMap((event) => event.toolName ? [event.toolName] : []))], inputSummary: task.inputArtifactIds.length ? `Fed by: ${[...new Set(task.inputArtifactIds.map((id) => artifactKindById.get(id) || "artifact"))].join(", ")}` : (events.find((event) => event.input)?.summary || "No recorded task input"), outputSummary: outputEvent?.summary || task.blockerReason || "No output yet", latencyMs: task.durationMs || events.reduce((sum, item) => sum + (item.durationMs || 0), 0), tokenEstimate: events.reduce((sum, item) => sum + (item.promptTokens || 0) + (item.completionTokens || 0), 0), costUsd: task.costEstimate || events.reduce((sum, item) => sum + (item.costEstimate || 0), 0) };
    });
    const portableArtifacts = artifacts.filter((artifact) => artifact.kind !== "brief").map((artifact) => {
      const escalation = approvals.find((item) => item.taskId === artifact.taskId && item.type === "escalation");
      return { id: artifact._id, taskId: artifact.taskId, kind: artifact.kind, title: titleFor(artifact.kind), payload: artifact.data, confidence: artifact.confidence ?? 0, approvalStatus: escalation?.status === "open" ? "escalated" : escalation?.status === "approved" ? "approved" : "pending", version: artifact.version, createdAt: artifact._creationTime };
    });
    return {
      job: { id: job._id, businessId: job.businessId, businessName: business?.name || "Unknown business", category: business?.type || "Local business", city: business?.address || "Research pending", status: portableJobStatus(job.status, Boolean(published)), approvalMode: job.approvalMode ?? "autonomous", brief: String((brief?.data as { prompt?: string } | undefined)?.prompt || ""), managerPlan: plan?.steps.map((step) => ({ agent: step.role, task: step.purpose, tools: step.inputKinds })) || [], publishState: published ? "published" : "draft", publishedUrl: published?.url, createdAt: job._creationTime, updatedAt: job.finishedAt || job.startedAt || job._creationTime },
      tasks: [managerTask, ...portableTasks],
      artifacts: portableArtifacts,
      approvals: approvals.map((item) => ({ id: item._id, taskId: item.taskId, type: item.type, reason: item.reason, status: item.status, resolutionNote: item.resolutionNote })),
      citations: citations.map((item) => ({ id: item._id, artifactId: item.artifactId, title: item.sourceTitle || item.claim, url: item.sourceUrl, snippet: item.snippet || item.claim, query: item.claim, retrievedAt: item._creationTime })),
      traces: traces.map((item) => ({ id: item._id, taskId: item.taskId, parentTaskId: item.taskId ? managerTask.id : undefined, parentRole: item.parentRole, agent: item.role, event: item.phase, summary: item.summary, inputSummary: item.input ? item.summary : "", outputSummary: item.output ? item.summary : "", input: compact(item.input), output: compact(item.output), tools: item.toolName ? [item.toolName] : [], model: item.model, latencyMs: item.durationMs || 0, tokenEstimate: (item.promptTokens || 0) + (item.completionTokens || 0), costUsd: item.costEstimate || 0, createdAt: item._creationTime })),
      siteVersionId: portableArtifacts.find((item) => item.kind === "microsite")?.id,
    };
  },
});

export const listJobs = getControlRoomJobs;
export const getJob = getControlRoomJob;

/** Server-only bridge used after Linkup or ElevenLabs provider calls. */
export const ingestWorkerEnvelope = internalMutation({
  args: { jobId: v.id("jobs"), event: v.string(), payload: v.any() },
  handler: async (ctx, { jobId, event, payload }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    if (event === "voice_brief") {
      const prior = await ctx.db.query("artifacts").withIndex("by_job_kind", (q) => q.eq("jobId", jobId).eq("kind", "brief_transcript")).collect();
      const artifactId = await ctx.db.insert("artifacts", { jobId, businessId: job.businessId, kind: "brief_transcript", version: prior.length + 1, producedByRole: "ElevenLabs Intake", data: { transcript: String(payload.transcript || ""), language: payload.language, duration: payload.duration }, confidence: Number(payload.confidence || 0.9) });
      await ctx.db.insert("policies", { scope: "business", businessId: job.businessId, key: "voice_brief", value: String(payload.transcript || ""), version: prior.length + 1, sourceArtifactId: artifactId });
    } else if (event === "linkup_research") {
      const prior = await ctx.db.query("artifacts").withIndex("by_job_kind", (q) => q.eq("jobId", jobId).eq("kind", "research")).collect();
      const artifactId = await ctx.db.insert("artifacts", { jobId, businessId: job.businessId, kind: "research", version: prior.length + 1, producedByRole: "Local Discovery Research", data: payload, confidence: 0.9 });
      for (const result of Array.isArray(payload.results) ? payload.results : []) {
        if (!result.url) continue;
        await ctx.db.insert("citations", { jobId, artifactId, claim: String(result.claim || payload.query || "Research finding"), sourceUrl: String(result.url), sourceTitle: String(result.title || "Linkup source"), snippet: String(result.snippet || ""), origin: "linkup" });
      }
    }
    await ctx.db.insert("traceEvents", { jobId, parentRole: "Integration Gateway", role: event === "voice_brief" ? "Intake & Evidence" : "Local Discovery Research", phase: "tool_call", summary: `Persisted ${event} provider result`, toolName: event === "voice_brief" ? "elevenlabs" : "linkup", input: { event }, output: payload, durationMs: Number(payload.latencyMs || 0), costEstimate: Number(payload.costUsd || 0) });
  },
});

function demoArtifact(role: string, business: Doc<"businesses">) {
  if (role === "Intake & Evidence") return { kind: "business_facts", confidence: 0.92, data: { verified: [{ field: "name", value: business.name }, { field: "type", value: business.type }], uncertain: ["hours", "phone", "prices"] } };
  if (/Structuring/.test(role)) return { kind: "menu_catalog", confidence: 0.81, data: { items: [{ name: "Cochinita Pibil", price: null, confidence: 0.74, needsReview: true }, { name: "Panuchos", price: null, confidence: 0.89 }] } };
  if (role === "Cultural Localization") return { kind: "bilingual_content", confidence: 0.91, data: { items: [{ es: "Relleno Negro", en: "Traditional Yucatán turkey stew flavored with roasted chiles, served with a pork-and-egg filling.", rationale: "Preserves the regional name and explains the dish." }] } };
  if (role === "Local Discovery Research") return { kind: "research", confidence: 0.89, data: { query: `${business.name} regional context`, findings: ["Explain regional specialties without flattening them into generic cuisine."] } };
  return { kind: "microsite", confidence: 0.93, data: demoSite(business) };
}

function demoSite(business: Doc<"businesses">) {
  const restaurant = /restaurant|food|bakery|cafe/i.test(business.type);
  const contact = { address: business.address || "Needs owner verification", city: business.address || "San Francisco, CA", phone: "Needs owner verification", mapsUrl: business.mapsUrl || "https://maps.google.com", hours: [] };
  if (restaurant) return { slug: business.slug, kind: "restaurant", theme: "yucatasia", business: { name: business.name, eyebrow: { es: "Comida yucateca · San Francisco", en: "Yucatán food · San Francisco" }, contact }, hero: { title: { es: "Comida yucateca en el corazón de la Mission.", en: "Yucatán food in the heart of the Mission." }, subtitle: { es: "Sabores regionales, explicados con respeto.", en: "Regional flavors, explained with care." }, cta: { es: "Cómo llegar", en: "Get directions" }, image: "https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?auto=format&fit=crop&w=1600&q=85" }, story: { es: "Una guía bilingüe para descubrir sabores de Yucatán.", en: "A bilingual guide to discovering Yucatán flavors." }, sections: [{ title: { es: "Platos yucatecos", en: "Yucatán specialties" }, items: [{ name: { es: "Cochinita Pibil", en: "Cochinita Pibil" }, description: { es: "Cerdo marinado lentamente.", en: "Slow-marinated pork, a Yucatán classic." }, note: { es: "Precio por confirmar", en: "Price to be confirmed" } }] }], faqs: [], conceptLabel: "Concept demo by Calle AI. Business information requires owner review." };
  return { slug: business.slug, kind: "salon", theme: "chelys", business: { name: business.name, eyebrow: { es: "Belleza y cuidado", en: "Beauty and care" }, contact }, hero: { title: { es: "Belleza y cuidado en tu idioma.", en: "Beauty and care in your language." }, subtitle: { es: "Servicios claros y acogedores.", en: "Clear, welcoming services." }, cta: { es: "Llamar al salón", en: "Call the salon" }, image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=85" }, story: { es: "Un salón de barrio con servicios explicados claramente.", en: "A neighborhood salon with clearly explained services." }, sections: [{ title: { es: "Servicios", en: "Services" }, items: [{ name: { es: "Rizado de pestañas", en: "Rizado de pestañas" }, description: { es: "Servicio por confirmar.", en: "Service details to be confirmed." } }] }], faqs: [], conceptLabel: "Concept demo by Calle AI. Business information requires owner review." };
}
