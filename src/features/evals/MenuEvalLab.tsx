import { useMemo, useState } from "react";
import { groundTruth, sampleRuns } from "./fixture";
import { percent, scoreMenu } from "./scoring";
import type { EvalMenuItem, EvalRun } from "./types";
import "./evals.css";

const metric = (label: string, a: number, b: number) => <div className="eval-metric"><span>{label}</span><b>{percent(a)}</b><b>{percent(b)}</b></div>;
const flatten = (run: EvalRun) => run.menu.sections.flatMap((section) => section.items);

export function MenuEvalLab() {
  const [focus, setFocus] = useState<"all" | "missing" | "prices" | "unsupported">("all");
  const [baseline, agency] = sampleRuns;
  const scores = useMemo(() => ({ baseline: scoreMenu(baseline.menu, groundTruth), agency: scoreMenu(agency.menu, groundTruth) }), [baseline, agency]);
  const baselineItems = new Map(flatten(baseline).map((item) => [item.name.original.toLowerCase(), item]));
  const agencyItems = new Map(flatten(agency).map((item) => [item.name.original.toLowerCase(), item]));
  const truthItems = flatten({ ...agency, menu: groundTruth });
  const visible = truthItems.filter((item) => focus === "all" || (focus === "missing" && (!baselineItems.has(item.name.original.toLowerCase()) || !agencyItems.has(item.name.original.toLowerCase()))) || (focus === "prices" && (baselineItems.get(item.name.original.toLowerCase())?.price !== item.price || agencyItems.get(item.name.original.toLowerCase())?.price !== item.price)));
  const unsupported = focus === "unsupported" ? scores.baseline.unsupportedItems : [];

  return <main className="eval-lab">
    <header className="eval-hero"><div><p className="eval-kicker">Agent Lab · Menu normalization</p><h1>Same brief.<br /><em>Different machinery.</em></h1><p>One OpenAI call with no tools versus Calle AI’s Linkup discovery, normalization, and direction-aware translation workflow.</p><a href="/evals/dev">Open developer workbench →</a></div><aside><span>Evaluation mode</span><b>Frozen evidence replay</b><small>Sample comparison · not a live provider run</small></aside></header>

    <section className="eval-prompt"><span>Shared prompt</span><blockquote>“{baseline.prompt}”</blockquote><div><i>Same model</i><i>Same JSON contract</i><i>Same bilingual requirements</i><i>Same frozen ground truth</i></div></section>

    <section className="eval-scoreboard">
      <div className="eval-score-head"><span>Quality score</span><article><small>A · Baseline</small><strong>{percent(scores.baseline.overall)}</strong><p>{baseline.model}</p></article><article className="winner"><small>B · Agent team</small><strong>{percent(scores.agency.overall)}</strong><p>{agency.model}</p></article></div>
      {metric("Item precision", scores.baseline.itemPrecision, scores.agency.itemPrecision)}
      {metric("Item recall", scores.baseline.itemRecall, scores.agency.itemRecall)}
      {metric("Price accuracy", scores.baseline.priceAccuracy, scores.agency.priceAccuracy)}
      {metric("Translation coverage", scores.baseline.translationCoverage, scores.agency.translationCoverage)}
      {metric("Source-language preservation", scores.baseline.sourcePreservation, scores.agency.sourcePreservation)}
      <div className="eval-run-meta"><span>Runtime / cost</span><b>{(baseline.durationMs / 1000).toFixed(1)}s · ${baseline.costUsd.toFixed(3)}</b><b>{(agency.durationMs / 1000).toFixed(1)}s · ${agency.costUsd.toFixed(3)}</b></div>
    </section>

    <section className="eval-diff"><div className="eval-section-head"><div><p className="eval-kicker">Ground-truth diff</p><h2>Where the outputs diverge</h2></div><div className="eval-filters">{(["all", "missing", "prices", "unsupported"] as const).map((value) => <button className={focus === value ? "active" : ""} onClick={() => setFocus(value)} key={value}>{value}</button>)}</div></div>
      <div className="eval-table"><div className="eval-row heading"><b>Official item</b><b>Single-call baseline</b><b>Calle AI</b></div>{visible.map((truth) => <DiffRow key={truth.id} truth={truth} baseline={baselineItems.get(truth.name.original.toLowerCase())} agency={agencyItems.get(truth.name.original.toLowerCase())} />)}{unsupported.map((name) => <div className="eval-row" key={name}><div><b>Not on official menu</b></div><div className="bad"><b>{name}</b><small>Unsupported item</small></div><div className="good"><b>Not produced</b><small>Correctly excluded</small></div></div>)}</div>
    </section>
  </main>;
}

function DiffRow({ truth, baseline, agency }: { truth: EvalMenuItem; baseline?: EvalMenuItem; agency?: EvalMenuItem }) {
  const cell = (item?: EvalMenuItem) => !item ? <div className="bad"><b>Missing</b><small>Not returned</small></div> : <div className={item.price === truth.price ? "good" : "bad"}><b>{item.name.original} · {item.price ?? "No price"}</b><small>{item.price === truth.price ? "Exact match" : `Expected ${truth.price}`}</small><span>{item.name.es} / {item.name.en}</span></div>;
  return <div className="eval-row"><div><b>{truth.name.original} · {truth.price}</b><small>{truth.description?.original}</small></div>{cell(baseline)}{cell(agency)}</div>;
}
