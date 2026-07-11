import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const now = () => Date.now();
const slugify = (input: string) => input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const policy = [
  "Preserve original-language dish and service names.",
  "Never infer prices, dietary claims, hours, or business facts from incomplete sources.",
  "Research-derived claims require citations.",
  "Escalate low-confidence facts rather than fabricating them.",
];

function planFor(category: string) {
  const restaurant = /restaurant|food|bakery|cafe/i.test(category);
  return [
    { agent: "Intake & Evidence", task: "Build evidence ledger and canonical fact sheet", tools: ["source-parser"] },
    { agent: restaurant ? "Menu Structuring" : "Service Catalog Structuring", task: restaurant ? "Extract categories, names, prices, and uncertainty from menu evidence" : "Extract service categories, durations, prices, and uncertainty", tools: ["vision-ocr"] },
    { agent: "Cultural Localization", task: "Create bilingual, culturally respectful customer content", tools: ["localization-model", "agency-policy"] },
    { agent: "Local Discovery Research", task: "Research context and local-discovery wording with attributable sources", tools: ["linkup"] },
    { agent: "Publisher & QA", task: "Assemble microsite, listing pack, QA report, and publish candidate", tools: ["site-renderer", "required-field-validator"] },
  ];
}

/** Natural language brief -> reviewable job. The UI can call this directly. */
export const createJob = mutation({
  args: { brief: v.string(), businessName: v.string(), city: v.string(), category: v.string(), primaryLanguage: v.optional(v.string()), secondaryLanguage: v.optional(v.string()), sourceUrls: v.optional(v.array(v.string())) },
  handler: async (ctx, args) => {
    const timestamp = now();
    const slug = slugify(args.businessName);
    const existing = await ctx.db.query("businesses").withIndex("by_slug", q => q.eq("slug", slug)).unique();
    const businessId = existing?._id ?? await ctx.db.insert("businesses", {
      name: args.businessName, slug, category: args.category, city: args.city,
      primaryLanguage: args.primaryLanguage ?? "es", secondaryLanguage: args.secondaryLanguage ?? "en",
      publishStatus: "draft", createdAt: timestamp, updatedAt: timestamp,
    });
    const structuredBrief = {
      objective: "Create a bilingual local-business microsite and local-presence pack",
      business: { name: args.businessName, city: args.city, category: args.category },
      languages: { primary: args.primaryLanguage ?? "es", secondary: args.secondaryLanguage ?? "en" },
      deliverables: ["bilingual microsite", "structured menu or service catalog", "listing improvement pack", "delivery report"],
      guardrails: policy,
      sourceStrategy: ["public sources", "operator-provided assets"],
    };
    const jobId = await ctx.db.insert("jobs", { businessId, brief: args.brief, status: "brief_review", structuredBrief, requiredDeliverables: structuredBrief.deliverables, sourceUrls: args.sourceUrls ?? [], createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert("memory", { businessId, layer: "agency_policy", key: "default-guardrails", value: policy, updatedAt: timestamp });
    return { jobId, businessId, structuredBrief };
  },
});

/** Generates a task-specific manager plan and deterministic specialist tasks for demo/offline runs. */
export const launchDeterministicRun = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId); if (!job) throw new Error("Job not found");
    const business = await ctx.db.get(job.businessId); if (!business) throw new Error("Business not found");
    const timestamp = now();
    const plan = planFor(business.category);
    await ctx.db.patch(jobId, { status: "running", managerPlan: plan, updatedAt: timestamp });
    const managerId = await ctx.db.insert("tasks", { jobId, agent: "Agency Manager", title: "Plan, delegate, and review local-presence job", status: "complete", inputArtifactIds: [], outputArtifactIds: [], tools: ["planner", "agency-memory"], createdAt: timestamp, updatedAt: timestamp });
    await ctx.db.insert("traceEvents", { jobId, taskId: managerId, agent: "Agency Manager", event: "planned", inputSummary: job.brief, outputSummary: `Created ${plan.length} task plan for ${business.category}`, tools: ["planner", "agency-memory"], latencyMs: 320, tokenEstimate: 410, costUsd: 0.006, createdAt: timestamp });
    let previousArtifacts: any[] = [];
    for (const [index, step] of plan.entries()) {
      const taskId = await ctx.db.insert("tasks", { jobId, parentTaskId: managerId, agent: step.agent, title: step.task, status: "complete", inputArtifactIds: previousArtifacts, outputArtifactIds: [], tools: step.tools, createdAt: timestamp + index + 1, updatedAt: timestamp + index + 1 });
      const output = demoArtifact(step.agent, business.name, business.category);
      const artifactId = await ctx.db.insert("artifacts", { jobId, taskId, kind: output.kind, title: output.title, payload: output.payload, confidence: output.confidence, approvalStatus: output.confidence < .85 ? "escalated" : "pending", version: 1, createdAt: timestamp + index + 1 });
      await ctx.db.patch(taskId, { outputArtifactIds: [artifactId] });
      await ctx.db.insert("traceEvents", { jobId, taskId, parentTaskId: managerId, agent: step.agent, event: output.confidence < .85 ? "escalated" : "completed", inputSummary: previousArtifacts.length ? "Consumed prior specialist artifact" : "Consumed brief and source inventory", outputSummary: output.title, tools: step.tools, latencyMs: 450 + index * 90, tokenEstimate: 260 + index * 45, costUsd: 0.004 + index * 0.002, createdAt: timestamp + index + 1 });
      previousArtifacts = [artifactId];
      if (step.agent === "Local Discovery Research") await ctx.db.insert("citations", { jobId, artifactId, title: "Yucatán cuisine context", url: "https://example.com/yucatan-cuisine", snippet: "Placeholder deterministic citation; replace with Linkup output in production.", query: `${business.name} ${business.city} regional cuisine`, retrievedAt: timestamp });
    }
    const site = demoSite(business.name, business.slug, business.category, business.city);
    const siteId = await ctx.db.insert("siteVersions", { businessId: business._id, jobId, version: 1, content: site, isPublished: false, createdAt: timestamp });
    await ctx.db.insert("artifacts", { jobId, taskId: managerId, kind: "published_site_candidate", title: "Approved-site candidate", payload: { siteVersionId: siteId, ...site }, confidence: .93, approvalStatus: "pending", version: 1, createdAt: timestamp });
    await ctx.db.patch(jobId, { status: "needs_review", updatedAt: now() });
    return { managerTaskId: managerId, siteVersionId: siteId };
  },
});

export const approveArtifact = mutation({ args: { artifactId: v.id("artifacts") }, handler: async (ctx, { artifactId }) => { await ctx.db.patch(artifactId, { approvalStatus: "approved" }); return artifactId; } });
export const updateBrief = mutation({ args: { jobId: v.id("jobs"), brief: v.string(), structuredBrief: v.optional(v.any()) }, handler: async (ctx, args) => { await ctx.db.patch(args.jobId, { brief: args.brief, structuredBrief: args.structuredBrief, status: "brief_review", updatedAt: now() }); return args.jobId; } });
export const retryTask = mutation({ args: { taskId: v.id("tasks") }, handler: async (ctx, { taskId }) => { const task = await ctx.db.get(taskId); if (!task) throw new Error("Task not found"); await ctx.db.patch(taskId, { status: "queued", updatedAt: now() }); await ctx.db.insert("traceEvents", { jobId: task.jobId, taskId, parentTaskId: task.parentTaskId, agent: task.agent, event: "retry_requested", inputSummary: "Operator requested targeted retry", outputSummary: "Task returned to queue", tools: [], latencyMs: 0, tokenEstimate: 0, costUsd: 0, createdAt: now() }); return taskId; } });
export const publishBusiness = mutation({ args: { businessId: v.id("businesses"), siteVersionId: v.id("siteVersions") }, handler: async (ctx, args) => { const timestamp = now(); await ctx.db.patch(args.siteVersionId, { isPublished: true }); await ctx.db.patch(args.businessId, { publishStatus: "published", liveVersionId: args.siteVersionId, updatedAt: timestamp }); const version = await ctx.db.get(args.siteVersionId); if (version) await ctx.db.patch(version.jobId, { status: "published", updatedAt: timestamp }); return args.siteVersionId; } });

export const getJob = query({ args: { jobId: v.id("jobs") }, handler: async (ctx, { jobId }) => { const job = await ctx.db.get(jobId); return { job, business: job ? await ctx.db.get(job.businessId) : null, tasks: await ctx.db.query("tasks").withIndex("by_job", q => q.eq("jobId", jobId)).collect(), artifacts: await ctx.db.query("artifacts").withIndex("by_job", q => q.eq("jobId", jobId)).collect(), sourceAssets: await ctx.db.query("sourceAssets").withIndex("by_job", q => q.eq("jobId", jobId)).collect(), traces: await ctx.db.query("traceEvents").withIndex("by_job", q => q.eq("jobId", jobId)).collect(), citations: await ctx.db.query("citations").withIndex("by_job", q => q.eq("jobId", jobId)).collect() }; } });
export const getPublishedSite = query({ args: { slug: v.string() }, handler: async (ctx, { slug }) => { const business = await ctx.db.query("businesses").withIndex("by_slug", q => q.eq("slug", slug)).unique(); if (!business || business.publishStatus !== "published" || !business.liveVersionId) return null; return await ctx.db.get(business.liveVersionId); } });
export const listJobs = query({ args: {}, handler: async ctx => await ctx.db.query("jobs").order("desc").collect() });

/** Server-only bridge used by the Cloudflare Worker after a provider call. */
export const ingestWorkerEnvelope = internalMutation({
  args: { jobId: v.id("jobs"), event: v.string(), payload: v.any() },
  handler: async (ctx, { jobId, event, payload }) => {
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const timestamp = now();
    if (event === "voice_brief") {
      await ctx.db.insert("sourceAssets", { jobId, kind: "voice_brief", label: "ElevenLabs voice brief", extractedText: String(payload.transcript ?? ""), confidence: Number(payload.confidence ?? .9), createdAt: timestamp });
    } else if (event === "linkup_research") {
      const artifactId = await ctx.db.insert("artifacts", { jobId, kind: "research_pack", title: "Live Linkup research", payload, confidence: .9, approvalStatus: "pending", version: 1, createdAt: timestamp });
      for (const result of Array.isArray(payload.results) ? payload.results : []) {
        if (!result.url) continue;
        await ctx.db.insert("citations", { jobId, artifactId, title: String(result.title ?? "Linkup source"), url: String(result.url), snippet: String(result.snippet ?? ""), query: String(payload.query ?? ""), retrievedAt: timestamp });
      }
    }
    await ctx.db.insert("traceEvents", { jobId, agent: "Integration Gateway", event, inputSummary: "Provider response received by Cloudflare Worker", outputSummary: `Persisted ${event} payload`, tools: [event === "voice_brief" ? "elevenlabs" : "linkup", "cloudflare-worker"], latencyMs: Number(payload.latencyMs ?? 0), tokenEstimate: 0, costUsd: Number(payload.costUsd ?? 0), createdAt: timestamp });
  },
});

function demoArtifact(agent: string, businessName: string, category: string) {
  if (agent === "Intake & Evidence") return { kind: "evidence_ledger", title: "Canonical fact sheet and evidence ledger", confidence: .92, payload: { verified: [{ field: "businessName", value: businessName }, { field: "category", value: category }], uncertain: ["hours", "phone", "menu prices"] } };
  if (/Structuring/.test(agent)) return { kind: "structured_catalog", title: "Structured Spanish-first catalog", confidence: .81, payload: { items: [{ name: "Cochinita Pibil", price: null, confidence: .74, needsReview: true }, { name: "Panuchos", price: null, confidence: .89, needsReview: false }] } };
  if (agent === "Cultural Localization") return { kind: "localization_copy", title: "Culturally informed bilingual content", confidence: .91, payload: { items: [{ es: "Relleno Negro", en: "Traditional Yucatán turkey stew flavored with roasted chiles, served with a pork-and-egg filling.", rationale: "Keeps the regional name while explaining the dish." }] } };
  if (agent === "Local Discovery Research") return { kind: "research_pack", title: "Source-backed discovery research", confidence: .89, payload: { query: `${businessName} regional context`, findings: ["Explain regional specialties without flattening them into generic cuisine."] } };
  return { kind: "qa_delivery_report", title: "Microsite and local-presence delivery report", confidence: .93, payload: { checks: ["language parity", "source-aware footer", "missing-data warnings"], result: "ready for operator approval" } };
}

function demoSite(name: string, slug: string, category: string, city: string) {
  const restaurant = /restaurant|food|bakery|cafe/i.test(category);
  const contact = { address: "Needs owner verification", city, phone: "Needs owner verification", mapsUrl: "https://maps.google.com", hours: [] };
  if (restaurant) return {
    slug, kind: "restaurant", theme: "yucatasia", business: { name, eyebrow: { es: "Comida yucateca · San Francisco", en: "Yucatán food · San Francisco" }, contact },
    hero: { title: { es: "Comida yucateca en el corazón de la Mission.", en: "Yucatán food in the heart of the Mission." }, subtitle: { es: "Sabores regionales, explicados con respeto.", en: "Regional flavors, explained with care." }, cta: { es: "Cómo llegar", en: "Get directions" }, image: "/images/yucatasia-hero.jpg" },
    story: { es: "Una guía bilingüe para descubrir sabores de Yucatán.", en: "A bilingual guide to discovering Yucatán flavors." },
    sections: [{ title: { es: "Platos yucatecos", en: "Yucatán specialties" }, items: [{ name: { es: "Cochinita Pibil", en: "Cochinita Pibil" }, description: { es: "Cerdo marinado lentamente.", en: "Slow-marinated pork, a Yucatán classic." }, note: { es: "Precio por confirmar", en: "Price to be confirmed" } }, { name: { es: "Panuchos", en: "Panuchos" }, description: { es: "Antojito yucateco.", en: "A Yucatán antojito with a crisp, filled tortilla." }, note: { es: "Precio por confirmar", en: "Price to be confirmed" } }] }],
    guide: { title: { es: "¿Primera vez?", en: "New here?" }, body: { es: "Empieza con panuchos y cochinita pibil.", en: "Start with panuchos and cochinita pibil." }, picks: ["Panuchos", "Cochinita Pibil"] }, faqs: [], conceptLabel: "Concept demo by Calle AI. Business information must be reviewed by the owner before publishing.",
  };
  return {
    slug, kind: "salon", theme: "chelys", business: { name, eyebrow: { es: "Belleza y cuidado", en: "Beauty and care" }, contact },
    hero: { title: { es: "Belleza y cuidado en tu idioma.", en: "Beauty and care in your language." }, subtitle: { es: "Servicios claros y acogedores.", en: "Clear, welcoming services." }, cta: { es: "Llamar al salón", en: "Call the salon" }, image: "/images/chelys-hero.jpg" },
    story: { es: "Un salón de barrio con servicios explicados claramente.", en: "A neighborhood salon with clearly explained services." },
    sections: [{ title: { es: "Servicios", en: "Services" }, items: [{ name: { es: "Rizado de pestañas", en: "Rizado de pestañas" }, description: { es: "Servicio de pestañas; los detalles se confirman con el salón.", en: "Lash service; details should be confirmed with the salon." }, note: { es: "Precio por confirmar", en: "Price to be confirmed" } }] }], faqs: [], conceptLabel: "Concept demo by Calle AI. Business information must be reviewed by the owner before publishing.",
  };
}
