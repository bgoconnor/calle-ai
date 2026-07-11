import { useEffect, useMemo, useState } from "react";
import type {
  ControlArtifact,
  ControlJob,
  ControlRoomAdapter,
  ControlRoomDetail,
  ControlTask,
  ControlTrace,
} from "./types";
import "./control-room.css";
import "./trace-events.css";

const money = (n: number) => `$${n.toFixed(3)}`;
const time = (n: number) =>
  n ? `${(n / 1000).toFixed(n > 9999 ? 1 : 2)}s` : "—";
const state = (value: string) => value.replaceAll("_", " ");

export function ControlRoom({
  adapter,
  initialJobId,
}: {
  adapter: ControlRoomAdapter;
  initialJobId?: string;
}) {
  const [jobs, setJobs] = useState<ControlJob[]>([]);
  const [detail, setDetail] = useState<ControlRoomDetail | null>(null);
  const [selected, setSelected] = useState(initialJobId ?? "");
  const [filter, setFilter] = useState({
    agent: "all",
    status: "all",
    task: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<ControlArtifact | null>(null);
  const refresh = async (jobId = selected) => {
    setLoading(true);
    setError("");
    try {
      const nextJobs = await adapter.listJobs();
      setJobs(nextJobs);
      const nextId = jobId || nextJobs[0]?.id || "";
      setSelected(nextId);
      setDetail(nextId ? await adapter.getJob(nextId) : null);
    } catch {
      setError(
        "This run could not be loaded. Check the agency connection and retry.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh(initialJobId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (
      adapter.mode !== "live" ||
      !selected ||
      detail?.job.status !== "running"
    )
      return;
    const timer = window.setInterval(async () => {
      try {
        setDetail(await adapter.getJob(selected));
      } catch {
        /* keep the last reconstructable state */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [adapter, selected, detail?.job.status]);
  const selectJob = async (id: string) => {
    setSelected(id);
    setLoading(true);
    setDetail(await adapter.getJob(id));
    setLoading(false);
  };
  const metrics = useMemo(() => {
    const all = detail?.traces ?? [];
    return {
      cost: all.reduce((sum, item) => sum + item.costUsd, 0),
      latency: all.reduce((sum, item) => sum + item.latencyMs, 0),
      tokens: all.reduce((sum, item) => sum + item.tokenEstimate, 0),
    };
  }, [detail]);
  const visibleTasks = useMemo(
    () =>
      (detail?.tasks ?? []).filter(
        (task) =>
          (filter.agent === "all" || task.agent === filter.agent) &&
          (filter.status === "all" || task.status === filter.status) &&
          (!filter.task ||
            task.title.toLowerCase().includes(filter.task.toLowerCase())),
      ),
    [detail, filter],
  );
  const act = async (key: string, cb: () => Promise<void>) => {
    setBusy(key);
    try {
      await cb();
      await refresh();
    } catch {
      setError(
        "That agency action did not complete. No publish state was changed.",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="cr-shell">
      <header className="cr-topbar">
        <div>
          <p className="cr-kicker">Calle AI / agency delivery desk</p>
          <h1>Control room</h1>
        </div>
        <div className="cr-live">
          <i /> {adapter.mode === "demo" ? "Demo data" : "Live Convex"}
        </div>
      </header>
      {error && (
        <div className="cr-alert" role="alert">
          {error}
          <button onClick={() => void refresh()}>Try again</button>
        </div>
      )}
      <div className="cr-layout">
        <aside className="cr-jobs">
          <div className="cr-panel-title">
            <span>Agency jobs</span>
            <button onClick={() => void refresh()}>↻</button>
          </div>
          {loading && !jobs.length ? (
            <p className="cr-muted">Loading jobs…</p>
          ) : jobs.length ? (
            jobs.map((job) => (
              <button
                key={job.id}
                className={`cr-job ${selected === job.id ? "selected" : ""}`}
                onClick={() => void selectJob(job.id)}
              >
                <span className={`cr-dot ${job.status}`} />
                <b>{job.businessName}</b>
                <small>
                  {job.category} · {job.city}
                </small>
                <em>{state(job.status)}</em>
              </button>
            ))
          ) : (
            <div className="cr-empty">
              <b>No agency jobs yet</b>
              <p>Assign a natural-language brief to start a delivery run.</p>
            </div>
          )}
        </aside>
        <main className="cr-main">
          {loading && !detail ? (
            <div className="cr-empty large">
              <b>Reconstructing the run…</b>
              <p>Loading its plan, artifacts, and trace history.</p>
            </div>
          ) : detail ? (
            <>
              <section className="cr-summary">
                <div>
                  <p className="cr-kicker">
                    {detail.job.category} · {detail.job.city}
                  </p>
                  <h2>{detail.job.businessName}</h2>
                  <p>{detail.job.brief}</p>
                  <small>
                    {detail.job.approvalMode === "require_approval"
                      ? "Human approval required before publish"
                      : "Autonomous publish + automatic retraction"}
                  </small>
                </div>
                <span className={`cr-status ${detail.job.status}`}>
                  {state(detail.job.status)}
                </span>
              </section>
              <section className="cr-metrics">
                <Metric label="Run cost" value={money(metrics.cost)} />
                <Metric label="Agent time" value={time(metrics.latency)} />
                <Metric
                  label="Tokens"
                  value={metrics.tokens.toLocaleString()}
                />
                <Metric label="Publish" value={detail.job.publishState} />
              </section>
              <PublishedOutputs detail={detail} />
              <section className="cr-plan">
                <div className="cr-section-heading">
                  <div>
                    <p className="cr-kicker">Manager plan</p>
                    <h3>A tailored agency crew</h3>
                  </div>
                  <span>{detail.job.managerPlan.length} specialist tasks</span>
                </div>
                <ol>
                  {detail.job.managerPlan.map((step, index) => (
                    <li key={`${step.agent}-${index}`}>
                      <b>{step.agent}</b>
                      <span>{step.task}</span>
                      <small>{step.tools.join(" · ")}</small>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="cr-filterbar">
                <input
                  value={filter.task}
                  onChange={(event) =>
                    setFilter({ ...filter, task: event.target.value })
                  }
                  placeholder="Find a task"
                />
                <select
                  value={filter.agent}
                  onChange={(event) =>
                    setFilter({ ...filter, agent: event.target.value })
                  }
                >
                  <option value="all">All agents</option>
                  {[...new Set(detail.tasks.map((task) => task.agent))].map(
                    (agent) => (
                      <option key={agent}>{agent}</option>
                    ),
                  )}
                </select>
                <select
                  value={filter.status}
                  onChange={(event) =>
                    setFilter({ ...filter, status: event.target.value })
                  }
                >
                  <option value="all">All task states</option>
                  {[...new Set(detail.tasks.map((task) => task.status))].map(
                    (status) => (
                      <option key={status}>{state(status)}</option>
                    ),
                  )}
                </select>
              </section>
              <section className="cr-trace">
                <div className="cr-section-heading">
                  <div>
                    <p className="cr-kicker">Run trace</p>
                    <h3>Execution events by task</h3>
                  </div>
                  <span>
                    {visibleTasks.length} tasks · {detail.traces.length} events
                  </span>
                </div>
                <TraceTree
                  tasks={visibleTasks}
                  traces={detail.traces}
                  artifacts={detail.artifacts}
                  onRetry={(task) =>
                    void act(`retry-${task.id}`, () =>
                      adapter.retryTask(task.id),
                    )
                  }
                  busy={busy}
                />
              </section>
              <section className="cr-columns">
                <div className="cr-artifacts">
                  <div className="cr-section-heading">
                    <div>
                      <p className="cr-kicker">Working record</p>
                      <h3>All agent artifacts</h3>
                    </div>
                  </div>
                  {detail.artifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      artifact={artifact}
                      requireApproval={
                        detail.job.approvalMode === "require_approval"
                      }
                      onApprove={() =>
                        void act(`approve-${artifact.id}`, () =>
                          adapter.approveArtifact(artifact.id),
                        )
                      }
                      onEdit={() => setEditor(artifact)}
                      onRetry={() =>
                        artifact.taskId &&
                        void act(`retry-${artifact.taskId}`, () =>
                          adapter.retryTask(artifact.taskId!),
                        )
                      }
                      busy={busy}
                    />
                  ))}
                </div>
              </section>
              <section className="cr-evidence">
                <div className="cr-section-heading">
                  <div>
                    <p className="cr-kicker">Research provenance</p>
                    <h3>Citations used</h3>
                  </div>
                  <span>{detail.citations.length} sources</span>
                </div>
                <div className="cr-citation-grid">
                  {detail.citations.length ? (
                    detail.citations.map((citation) => (
                      <a
                        className="cr-citation"
                        key={citation.id}
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <b>{citation.title} ↗</b>
                        <p>{citation.snippet}</p>
                        <small>{citation.query}</small>
                      </a>
                    ))
                  ) : (
                    <p className="cr-muted">
                      No cited research is attached to this run.
                    </p>
                  )}
                </div>
              </section>
              <PublishPanel
                job={detail.job}
                siteVersionId={detail.siteVersionId}
                adapter={adapter}
                busy={busy}
                act={act}
              />
            </>
          ) : (
            <div className="cr-empty large">
              <b>No selected run</b>
              <p>Choose an agency job to inspect its work.</p>
            </div>
          )}
        </main>
      </div>
      {editor && (
        <EditArtifact
          artifact={editor}
          onClose={() => setEditor(null)}
          onSave={(note) =>
            void act(`edit-${editor.id}`, async () => {
              await adapter.requestChanges(editor.id, note);
              setEditor(null);
            })
          }
        />
      )}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value}</b>
    </div>
  );
}
function PublishedOutputs({ detail }: { detail: ControlRoomDetail }) {
  const menu = [...detail.artifacts]
    .reverse()
    .find((artifact) => artifact.kind === "normalized_menu");
  const payload = menu?.payload as any;
  const itemCount = (payload?.sections ?? []).reduce(
    (sum: number, section: any) => sum + (section.items?.length ?? 0),
    0,
  );
  return (
    <section className="cr-outputs">
      <div className="cr-section-heading">
        <div>
          <p className="cr-kicker">Published outputs</p>
          <h3>What the agency delivered</h3>
        </div>
      </div>
      <div className="cr-output-grid">
        <article>
          <span>01</span>
          <small>Normalized menu</small>
          <h4>{menu ? `${itemCount} sourced items` : "Still processing"}</h4>
          <p>
            {menu
              ? `${payload?.sections?.length ?? 0} sections · canonical source retained with each item`
              : "The menu artifact will appear here when normalization completes."}
          </p>
          {menu && <a href={`#artifact-${menu.id}`}>Inspect menu artifact ↓</a>}
        </article>
        <article className={detail.job.publishedUrl ? "live" : ""}>
          <span>02</span>
          <small>Public microsite</small>
          <h4>
            {detail.job.publishedUrl
              ? "Live and browseable"
              : "Not published yet"}
          </h4>
          <p>
            {detail.job.publishedUrl
              ? "Open the customer-facing bilingual menu and storefront."
              : "Autonomous publishing runs after source checks pass."}
          </p>
          {detail.job.publishedUrl && (
            <a href={detail.job.publishedUrl} target="_blank" rel="noreferrer">
              Open microsite ↗
            </a>
          )}
        </article>
      </div>
    </section>
  );
}
function TraceTree({
  tasks,
  traces,
  artifacts,
  onRetry,
  busy,
}: {
  tasks: ControlTask[];
  traces: ControlTrace[];
  artifacts: ControlArtifact[];
  onRetry: (task: ControlTask) => void;
  busy: string | null;
}) {
  const roots = tasks.filter((task) => !task.parentTaskId);
  const branch = (task: ControlTask, depth = 0): React.ReactNode => {
    const events = task.parentTaskId
      ? traces.filter((trace) => trace.taskId === task.id)
      : traces.filter((trace) => !trace.taskId);
    return (
      <li key={task.id} style={{ "--depth": depth } as React.CSSProperties}>
        <article className={`cr-task ${task.status}`}>
          <div className="cr-task-title">
            <span className="cr-dot" />
            <div>
              <b>{task.agent}</b>
              <p>{task.title}</p>
            </div>
            <em>{state(task.status)}</em>
          </div>
          <div className="cr-task-grid">
            <span>
              <small>Input</small>
              {task.inputSummary}
            </span>
            <span>
              <small>Output</small>
              {task.outputSummary}
            </span>
            <span>
              <small>Tools</small>
              {task.tools.join(", ") || "—"}
            </span>
            <span>
              <small>Latency / cost</small>
              {time(task.latencyMs)} · {money(task.costUsd)} ·{" "}
              {task.tokenEstimate} tok
            </span>
          </div>
          <TraceEvents events={events} />
          {task.status === "needs_review" || task.status === "failed" ? (
            <button
              className="cr-button ghost"
              disabled={busy === `retry-${task.id}`}
              onClick={() => onRetry(task)}
            >
              {busy === `retry-${task.id}`
                ? "Queuing…"
                : "Retry only this task"}
            </button>
          ) : null}
          {artifacts
            .filter((artifact) => artifact.taskId === task.id)
            .map((artifact) => (
              <small className="cr-task-artifact" key={artifact.id}>
                ↳ {artifact.title} · v{artifact.version}
              </small>
            ))}
        </article>
        <ul>
          {tasks
            .filter((child) => child.parentTaskId === task.id)
            .map((child) => branch(child, depth + 1))}
        </ul>
      </li>
    );
  };
  return <ul className="cr-tree">{roots.map((task) => branch(task))}</ul>;
}
function TraceEvents({ events }: { events: ControlTrace[] }) {
  if (!events.length)
    return (
      <p className="cr-no-events">
        No execution events recorded for this task.
      </p>
    );
  return (
    <ol className="cr-events">
      {events.map((event) => (
        <li key={event.id} className={event.event === "error" ? "error" : ""}>
          <span className="cr-event-phase">{state(event.event)}</span>
          <div>
            <b>{event.agent}</b>
            {event.parentRole && <small>called by {event.parentRole}</small>}
            <p>{event.summary}</p>
            <em>
              {[
                event.tools.join(", "),
                event.model,
                event.latencyMs ? time(event.latencyMs) : "",
                event.tokenEstimate ? `${event.tokenEstimate} tok` : "",
                event.costUsd ? money(event.costUsd) : "",
              ]
                .filter(Boolean)
                .join(" · ") || "No provider metadata recorded"}
            </em>
          </div>
        </li>
      ))}
    </ol>
  );
}
function ArtifactCard({
  artifact,
  requireApproval,
  onApprove,
  onEdit,
  onRetry,
  busy,
}: {
  artifact: ControlArtifact;
  requireApproval: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onRetry: () => void;
  busy: string | null;
}) {
  const payload = JSON.stringify(artifact.payload, null, 2);
  const confidence =
    artifact.confidence > 0
      ? `${Math.round(artifact.confidence * 100)}% confidence`
      : "Confidence not scored";
  return (
    <article
      id={`artifact-${artifact.id}`}
      className={`cr-artifact ${artifact.approvalStatus}`}
    >
      <div>
        <span className={`cr-status ${artifact.approvalStatus}`}>
          {state(artifact.approvalStatus)}
        </span>
        <small>
          v{artifact.version} · {confidence}
        </small>
      </div>
      <h4>{artifact.title}</h4>
      <pre>{payload}</pre>
      <div className="cr-actions">
        {requireApproval && artifact.approvalStatus !== "approved" && (
          <button
            className="cr-button"
            disabled={busy === `approve-${artifact.id}`}
            onClick={onApprove}
          >
            Approve
          </button>
        )}
        <button className="cr-button ghost" onClick={onEdit}>
          Request edit
        </button>
        {artifact.approvalStatus === "escalated" && (
          <button className="cr-button ghost" onClick={onRetry}>
            Correct & retry
          </button>
        )}
      </div>
    </article>
  );
}
function PublishPanel({
  job,
  siteVersionId,
  adapter,
  busy,
  act,
}: {
  job: ControlJob;
  siteVersionId?: string;
  adapter: ControlRoomAdapter;
  busy: string | null;
  act: (key: string, cb: () => Promise<void>) => void;
}) {
  const published = job.publishState === "published";
  const gated = job.approvalMode === "require_approval";
  return (
    <section className="cr-publish">
      <div>
        <p className="cr-kicker">Public delivery</p>
        <h3>
          {published
            ? "This storefront is live"
            : gated
              ? "Waiting for approval"
              : job.status === "failed"
                ? "Automation retracted or withheld"
                : "Automation is finishing"}
        </h3>
        <p>
          {published
            ? "The current site version was published successfully."
            : gated
              ? "This job is configured to wait at the final publish boundary."
              : "Autonomous jobs publish after checks pass and retract when critical checks fail."}
        </p>
      </div>
      <div className="cr-publish-actions">
        {published && job.publishedUrl && (
          <a
            className="cr-button ghost"
            href={job.publishedUrl}
            target="_blank"
            rel="noreferrer"
          >
            Preview public site ↗
          </a>
        )}
        {published && adapter.unpublish ? (
          <button
            className="cr-button ghost"
            onClick={() => act("unpublish", () => adapter.unpublish!(job))}
          >
            Retract now
          </button>
        ) : gated ? (
          <button
            className="cr-button"
            disabled={busy === "publish"}
            onClick={() =>
              act("publish", () => adapter.publish(job, siteVersionId))
            }
          >
            {busy === "publish" ? "Publishing…" : "Approve & publish"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
function EditArtifact({
  artifact,
  onClose,
  onSave,
}: {
  artifact: ControlArtifact;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(
    "Please verify the unreadable price against the original menu before republishing.",
  );
  return (
    <div className="cr-modal-backdrop" role="dialog" aria-modal="true">
      <form
        className="cr-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(note);
        }}
      >
        <p className="cr-kicker">Revision request · {artifact.title}</p>
        <h3>Send this artifact back with context</h3>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div>
          <button type="button" className="cr-button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="cr-button" type="submit">
            Request targeted revision
          </button>
        </div>
      </form>
    </div>
  );
}
