import { useMemo, useState } from "react";
import { createMockIntakeAdapter } from "./mock-adapter";
import type { IntakeAdapter, LaunchResult } from "./types";
import "./quick-intake.css";
import "./automation-settings.css";

type QuickIntakeProps = {
  adapter?: IntakeAdapter;
  onLaunched?: (result: LaunchResult) => void;
  onAdvanced?: () => void;
};

const example = "Build a Spanish-first bilingual microsite for Yucatasia in San Francisco. Research the business and its menu, preserve Yucatán dish names, and explain them clearly in English.";

export function QuickIntake({ adapter, onLaunched, onAdvanced }: QuickIntakeProps) {
  const client = useMemo(() => adapter ?? createMockIntakeAdapter(), [adapter]);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);

  const submit = async () => {
    if (brief.trim().length < 20) {
      setError("Add a little more detail so the agency knows what to research and build.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const draft = await client.createDraft({
        brief: brief.trim(),
        businessName: "Research from brief",
        city: "Research from brief",
        category: "Local business",
        primaryLanguage: "es",
        secondaryLanguage: "en",
        approvalMode: requireApproval ? "require_approval" : "autonomous",
      });
      await client.updateDraft(draft.jobId, { brief: brief.trim(), structuredBrief: draft.structuredBrief });
      onLaunched?.(await client.launch(draft.jobId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The job could not be started. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="quick-shell">
      <section className="quick-intake">
        <div className="quick-mark" aria-hidden="true">✦</div>
        <p className="quick-eyebrow">AI local-presence agency</p>
        <h1>What should we build?</h1>
        <p className="quick-subtitle">Name the business and the outcome. Our agents research the rest.</p>

        <div className="quick-composer">
          <textarea
            autoFocus
            aria-label="Agency assignment"
            value={brief}
            onChange={(event) => setBrief(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
            }}
            placeholder="Build a bilingual microsite for…"
            rows={5}
          />
          <div className="quick-composer-footer">
            <span>Researches public sources with Linkup</span>
            <button disabled={loading} onClick={() => void submit()}>
              {loading ? "Starting…" : "Build presence"}<b>↗</b>
            </button>
          </div>
        </div>

        {error && <p className="quick-error" role="alert">{error}</p>}
        <label className="quick-approval"><input type="checkbox" checked={requireApproval} onChange={(event) => setRequireApproval(event.target.checked)} /><span>Require approval before publishing</span></label>
        <button className="quick-example" onClick={() => setBrief(example)}>Try an example</button>
        {onAdvanced && <button className="quick-advanced" onClick={onAdvanced}>Add sources and detailed requirements</button>}

        <div className="quick-process" aria-label="Agency process">
          <span><i>1</i> Identify</span><em>→</em><span><i>2</i> Research</span><em>→</em><span><i>3</i> Publish</span>
        </div>
      </section>
    </main>
  );
}
