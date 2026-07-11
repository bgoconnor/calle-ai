import { useEffect, useMemo, useState } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ControlRoomDetail } from "../control-room";
import type { EvalMenu } from "./types";
import { adaptAgencyMenu, summarizeMenu } from "./devScoring";
import "./dev-evals.css";
import "./dev-evals-extended.css";

type BaselineResult = { menu: EvalMenu; model: string; promptTokens?: number; completionTokens?: number; durationMs: number; toolCalls: number; runner: string };
type RunState = "idle" | "starting" | "running" | "complete" | "failed";
type HistoryItem = { jobId: string; businessName: string; prompt: string; createdAt: number; status: string };

export function DevEvalLab({ convexUrl, onOpenJob }: { convexUrl?: string; onOpenJob: (jobId: string) => void }) {
  const [businessName, setBusinessName] = useState("Yucatasia");
  const [location, setLocation] = useState("San Francisco, CA");
  const [prompt, setPrompt] = useState("Create a comprehensive, normalized, bilingual menu for Yucatasia. Preserve source wording and prices; translate each item into the other language.");
  const [state, setState] = useState<RunState>("idle");
  const [jobId, setJobId] = useState<string>();
  const [baseline, setBaseline] = useState<BaselineResult>();
  const [detail, setDetail] = useState<ControlRoomDetail | null>(null);
  const [error, setError] = useState<string>();
  const [artifactKind, setArtifactKind] = useState("normalized_menu");
  const [inspectJobId, setInspectJobId] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(window.localStorage.getItem("calle-eval-history") ?? "[]") as HistoryItem[]; } catch { return []; }
  });
  const client = useMemo(() => convexUrl ? new ConvexHttpClient(convexUrl) : null, [convexUrl]);

  useEffect(() => {
    if (!client || !jobId || (state !== "starting" && state !== "running")) return;
    let active = true;
    const poll = async () => {
      const next = await client.query(api.agency.getControlRoomJob, { jobId: jobId as Id<"jobs"> }) as ControlRoomDetail | null;
      if (active) setDetail(next);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [client, jobId, state]);

  const launch = async () => {
    if (!client) return;
    setState("starting"); setError(undefined); setBaseline(undefined); setDetail(null);
    try {
      const created = await client.mutation(api.agency.createJobFromPrompt, { prompt, businessName, businessType: "restaurant", languages: ["es", "en"], address: location });
      const id = String(created.jobId);
      setJobId(id); setState("running");
      const [baselineResult, agencyResult] = await Promise.allSettled([
        client.action(api.evals.runMenuBaseline, { prompt, businessName }),
        client.action(api.orchestrator.runJob, { jobId: created.jobId, publicBaseUrl: window.location.origin }),
      ]);
      if (baselineResult.status === "fulfilled") setBaseline(baselineResult.value as BaselineResult);
      if (agencyResult.status === "rejected") throw agencyResult.reason;
      if (baselineResult.status === "rejected") throw baselineResult.reason;
      setDetail(await client.query(api.agency.getControlRoomJob, { jobId: created.jobId }) as ControlRoomDetail | null);
      const agencyStatus = (agencyResult.value as { status?: string }).status ?? "complete";
      const historyItem = { jobId: id, businessName, prompt, createdAt: Date.now(), status: agencyStatus };
      setHistory((current) => {
        const next = [historyItem, ...current.filter((item) => item.jobId !== id)].slice(0, 8);
        window.localStorage.setItem("calle-eval-history", JSON.stringify(next));
        return next;
      });
      if (agencyStatus === "failed") {
        setState("failed");
        setError("The agent team returned a failed run. Inspect the trace below for the exact blocker.");
      } else {
        setState("complete");
      }
    } catch (reason) {
      setState("failed"); setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const loadJob = async (id: string) => {
    if (!client || !id.trim()) return;
    setError(undefined);
    const loaded = await client.query(api.agency.getControlRoomJob, { jobId: id.trim() as Id<"jobs"> }) as ControlRoomDetail | null;
    if (!loaded) { setError("No job was found for that ID."); return; }
    setJobId(id.trim()); setInspectJobId(id.trim()); setDetail(loaded);
    setState(loaded.job.status === "failed" ? "failed" : "complete");
  };

  const artifacts = detail?.artifacts ?? [];
  const selectedArtifact = [...artifacts].reverse().find((artifact) => artifact.kind === artifactKind);
  const totalCost = detail?.tasks.reduce((sum, task) => sum + task.costUsd, 0) ?? 0;
  const totalTokens = detail?.tasks.reduce((sum, task) => sum + task.tokenEstimate, 0) ?? 0;
  const totalLatency = detail?.tasks.reduce((sum, task) => sum + task.latencyMs, 0) ?? 0;
  const agencyMenu = adaptAgencyMenu(artifacts);
  const baselineSummary = summarizeMenu(baseline?.menu);
  const agencySummary = summarizeMenu(agencyMenu);

  return <main className="dev-eval">
    <header className="dev-eval-head"><div><p>Developer tools / Agent evaluation</p><h1>Menu agent workbench</h1><span>Launch the same brief through a no-tools control and the live Calle AI organization. Inspect the machinery, not the marketing.</span></div><a href="/evals">View sales comparison →</a></header>
    <section className="dev-config"><div className="dev-fields"><label>Business<input value={businessName} onChange={(event) => setBusinessName(event.target.value)} /></label><label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} /></label></div><label>Shared prompt<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label><div className="dev-controls"><div><span>CONTROL</span> Same model · temperature 0 · shared schema · no tools</div><button disabled={!client || state === "starting" || state === "running"} onClick={() => void launch()}>{state === "starting" ? "Creating run…" : state === "running" ? "Agents running…" : "Run A/B evaluation"}</button></div><div className="dev-inspect"><input placeholder="Paste an existing Convex job ID" value={inspectJobId} onChange={(event) => setInspectJobId(event.target.value)} /><button onClick={() => void loadJob(inspectJobId)}>Inspect job</button></div>{!client && <p className="dev-warning">VITE_CONVEX_URL is not configured in this deployment.</p>}{error && <p className="dev-warning">{error}</p>}</section>
    <section className="dev-status"><Status label="Baseline" state={baseline ? "complete" : state} detail={baseline ? `${baseline.model} · ${baseline.durationMs}ms · ${(baseline.promptTokens ?? 0) + (baseline.completionTokens ?? 0)} tokens` : "Waiting for raw model output"} /><Status label="Agent team" state={detail?.job.status === "failed" ? "failed" : state} detail={detail ? `${detail.tasks.filter((task) => task.parentTaskId).length} specialists · ${detail.traces.length} events · ${detail.citations.length} citations` : "Waiting for Convex job"} />{jobId && <button onClick={() => onOpenJob(jobId)}>Open full Control Room ↗</button>}</section>
    <section className="dev-metrics"><Metric label="Sections" a={baselineSummary.sections} b={agencySummary.sections} /><Metric label="Items" a={baselineSummary.items} b={agencySummary.items} /><Metric label="Priced" a={baselineSummary.priced} b={agencySummary.priced} /><Metric label="Bilingual" a={baselineSummary.bilingual} b={agencySummary.bilingual} /><Metric label="Sourced" a={baselineSummary.sourced} b={agencySummary.sourced} /><Metric label="Descriptions" a={baselineSummary.descriptions} b={agencySummary.descriptions} /></section>
    <section className="dev-grid"><article className="dev-panel"><header><div><small>A · RAW CONTROL</small><h2>Single-call output</h2></div><code>tools: []</code></header><pre>{baseline ? JSON.stringify(baseline.menu, null, 2) : "Run the evaluation to inspect the baseline artifact."}</pre></article><article className="dev-panel"><header><div><small>B · CALLE AI</small><h2>Agent artifacts</h2></div><select value={artifactKind} onChange={(event) => setArtifactKind(event.target.value)}>{["menu_sources", "normalized_menu", "bilingual_content", "menu_testimonials", "microsite"].map((kind) => <option key={kind}>{kind}</option>)}</select></header><pre>{selectedArtifact ? JSON.stringify(selectedArtifact.payload, null, 2) : `Waiting for ${artifactKind}…`}</pre></article></section>
    <section className="dev-observe"><header><div><small>LIVE OBSERVABILITY</small><h2>Agent trace</h2></div><div><b>{totalLatency}ms</b><b>{totalTokens} tok</b><b>${totalCost.toFixed(3)}</b></div></header><div className="dev-trace">{detail?.traces.length ? detail.traces.map((trace) => <article key={trace.id}><i /><div><b>{trace.agent}</b><span>{trace.event}</span><p>{trace.outputSummary || trace.inputSummary || "Structured event recorded"}</p><small>{trace.tools.join(", ") || "model/runtime"} · {trace.latencyMs}ms · {trace.tokenEstimate} tok · ${trace.costUsd.toFixed(3)}</small></div></article>) : <p className="dev-empty">Trace events appear here while the organization runs.</p>}</div></section>
    <section className="dev-history"><header><small>LOCAL RUN HISTORY</small><h2>Recent evaluations</h2></header>{history.length ? history.map((item) => <button key={item.jobId} onClick={() => void loadJob(item.jobId)}><b>{item.businessName}</b><span>{item.status}</span><code>{item.jobId}</code><time>{new Date(item.createdAt).toLocaleString()}</time></button>) : <p>No evaluations launched from this browser yet.</p>}</section>
  </main>;
}

function Status({ label, state, detail }: { label: string; state: RunState; detail: string }) {
  return <article><i className={state} /><div><b>{label}</b><span>{state}</span><p>{detail}</p></div></article>;
}

function Metric({ label, a, b }: { label: string; a: number; b: number }) {
  return <article><span>{label}</span><b>{a}</b><b>{b}</b></article>;
}
