import { useMemo, useRef, useState } from "react";
import type { BriefInput, StructuredBrief } from "../../lib/agency-contract";
import { createMockIntakeAdapter } from "./mock-adapter";
import type { BriefDraft, IntakeProps, VoiceState } from "./types";
import "./intake.css";

const examples = [
  { label: "Yucatasia", brief: "Create a Spanish-first bilingual website for Yucatasia in the Mission. Use public sources and menu photos. Preserve regional Yucatán dish names and explain them for English-speaking visitors.", name: "Yucatasia", city: "San Francisco", category: "Yucatán restaurant" },
  { label: "Chely’s", brief: "Turn Chely’s Beauty Salon’s Maps listing and service photos into a polished Spanish-English microsite. Keep the storefront’s bright pink, aqua, and lavender energy.", name: "Chely’s Beauty Salon", city: "San Francisco", category: "Beauty salon" },
];

const emptyDraft: BriefDraft = { brief: "", businessName: "", city: "", category: "", primaryLanguage: "es", secondaryLanguage: "en", sourceUrls: [], files: [] };

function listValue(value: string[]) { return value.filter(Boolean).join("\n"); }

export function AgencyIntake({ adapter, integrationWorkerUrl, onLaunched, initialBrief = "" }: IntakeProps) {
  const client = useMemo(() => adapter ?? createMockIntakeAdapter(), [adapter]);
  const [draft, setDraft] = useState<BriefDraft>({ ...emptyDraft, brief: initialBrief });
  const [urlInput, setUrlInput] = useState("");
  const [structured, setStructured] = useState<StructuredBrief | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState<"review" | "launch" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>(integrationWorkerUrl ? "idle" : "unavailable");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(integrationWorkerUrl ? null : "Voice transcription is unavailable until the integration Worker is configured.");
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const setField = <K extends keyof BriefDraft>(key: K, value: BriefDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const applyExample = (example: typeof examples[number]) => { setDraft({ ...emptyDraft, brief: example.brief, businessName: example.name, city: example.city, category: example.category, primaryLanguage: "es", secondaryLanguage: "en" }); setStructured(null); setJobId(null); setError(null); };
  const addUrl = () => {
    const candidate = urlInput.trim();
    if (!candidate) return;
    try { new URL(candidate); } catch { setError("Add a complete source URL, including https://."); return; }
    if (!draft.sourceUrls.includes(candidate)) setField("sourceUrls", [...draft.sourceUrls, candidate]);
    setUrlInput(""); setError(null);
  };

  const submitForReview = async () => {
    if (draft.brief.trim().length < 24) { setError("Describe the agency assignment in at least a sentence so Calle AI can plan the work."); return; }
    setLoading("review"); setError(null);
    try {
      const input: BriefInput = { brief: draft.brief.trim(), businessName: draft.businessName.trim() || "Business to confirm", city: draft.city.trim() || "Location to confirm", category: draft.category.trim() || "Local business", primaryLanguage: draft.primaryLanguage, secondaryLanguage: draft.secondaryLanguage, sourceUrls: draft.sourceUrls };
      const result = await client.createDraft(input);
      setStructured(result.structuredBrief); setJobId(result.jobId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Calle AI could not prepare the job brief. Try again."); }
    finally { setLoading(null); }
  };

  const launch = async () => {
    if (!structured || !jobId) return;
    setLoading("launch"); setError(null);
    try { await client.updateDraft(jobId, { brief: draft.brief, structuredBrief: structured }); const result = await client.launch(jobId); onLaunched?.(result); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The agency job did not launch. Your reviewed brief is still saved."); }
    finally { setLoading(null); }
  };

  const transcribe = async (audio: Blob) => {
    if (!integrationWorkerUrl) return;
    setVoiceState("transcribing"); setVoiceMessage("Turning your voice brief into an agency assignment…");
    try {
      const body = new FormData(); body.append("audio", audio, "calle-brief.webm");
      const response = await fetch(`${integrationWorkerUrl.replace(/\/$/, "")}/v1/voice-brief/transcribe`, { method: "POST", body });
      const payload = await response.json() as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "No transcript returned");
      setField("brief", draft.brief ? `${draft.brief.trim()}\n\n${payload.transcript}` : payload.transcript);
      setVoiceState("idle"); setVoiceMessage("Voice brief added to the assignment.");
    } catch (reason) { setVoiceState("error"); setVoiceMessage(reason instanceof Error ? reason.message : "Transcription failed. You can continue by typing your brief."); }
  };

  const toggleRecording = async () => {
    if (voiceState === "recording" && recorder.current) { recorder.current.stop(); return; }
    if (!integrationWorkerUrl || !navigator.mediaDevices || typeof MediaRecorder === "undefined") { setVoiceState("unavailable"); setVoiceMessage("Recording is not supported in this browser or the Worker is unavailable."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream); chunks.current = [];
      media.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      media.onstop = () => { stream.getTracks().forEach((track) => track.stop()); void transcribe(new Blob(chunks.current, { type: media.mimeType || "audio/webm" })); };
      recorder.current = media; media.start(); setVoiceState("recording"); setVoiceMessage("Recording… tap again when your brief is complete.");
    } catch { setVoiceState("error"); setVoiceMessage("Microphone access was not granted. You can type the brief instead."); }
  };

  if (structured) return <BriefReview draft={draft} structured={structured} setStructured={setStructured} onBack={() => { setStructured(null); setJobId(null); }} onLaunch={launch} isLaunching={loading === "launch"} error={error} />;

  return <main className="intake-shell"><section className="intake-card" aria-labelledby="intake-title">
    <div className="intake-kicker">Calle AI · New agency job</div>
    <h1 id="intake-title">Assign the work. We’ll build the presence.</h1>
    <p className="intake-intro">Describe what this business needs in your own words. Calle AI will turn it into a reviewable agency brief before any work starts.</p>
    <div className="example-row" aria-label="Example briefs">{examples.map((example) => <button key={example.label} type="button" className="example-chip" onClick={() => applyExample(example)}>Try {example.label}</button>)}</div>
    <label className="brief-label" htmlFor="agency-brief">What should Calle AI create for this business?</label>
    <textarea id="agency-brief" value={draft.brief} onChange={(event) => setField("brief", event.target.value)} placeholder="Create a Spanish-first bilingual website for a neighborhood business. Use public sources and these menu photos. Preserve the business’s voice and flag anything uncertain." rows={8} />
    <div className="voice-row"><button type="button" className={`voice-button ${voiceState === "recording" ? "is-recording" : ""}`} onClick={() => void toggleRecording()} disabled={voiceState === "transcribing" || voiceState === "unavailable"}>{voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing…" : "Add a voice brief"}</button>{voiceMessage && <span className="voice-message" role="status">{voiceMessage}</span>}</div>
    <div className="field-grid"><Field label="Business name" value={draft.businessName} onChange={(value) => setField("businessName", value)} placeholder="e.g. Yucatasia" /><Field label="City or neighborhood" value={draft.city} onChange={(value) => setField("city", value)} placeholder="e.g. Mission District, SF" /><Field label="Business type" value={draft.category} onChange={(value) => setField("category", value)} placeholder="e.g. Restaurant or salon" /></div>
    <section className="source-panel" aria-labelledby="sources-title"><div><h2 id="sources-title">Helpful sources <span>optional</span></h2><p>Links and photos give the agency evidence; they are never treated as approval to invent missing facts.</p></div><div className="source-add"><input aria-label="Source URL" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="https://maps.google.com/…" /><button type="button" onClick={addUrl}>Add link</button></div><div className="source-chips">{draft.sourceUrls.map((url) => <button type="button" className="source-chip" key={url} onClick={() => setField("sourceUrls", draft.sourceUrls.filter((item) => item !== url))}>{url.replace(/^https?:\/\//, "")} <span>×</span></button>)}</div><label className="upload-zone"><input type="file" multiple accept="image/*,.pdf" onChange={(event) => setField("files", Array.from(event.target.files ?? []))} /><strong>Attach menu or service photos</strong><small>{draft.files.length ? `${draft.files.length} file${draft.files.length === 1 ? "" : "s"} ready for the agency` : "Images and PDFs only — optional for this demo"}</small></label></section>
    {error && <p className="intake-error" role="alert">{error}</p>}
    <div className="intake-actions"><span>Your assignment is reviewed before agents begin.</span><button className="primary-action" type="button" onClick={() => void submitForReview()} disabled={loading === "review"}>{loading === "review" ? "Preparing brief…" : "Create agency brief"}</button></div>
  </section></main>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) { return <label className="small-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>; }

function BriefReview({ draft, structured, setStructured, onBack, onLaunch, isLaunching, error }: { draft: BriefDraft; structured: StructuredBrief; setStructured: (next: StructuredBrief) => void; onBack: () => void; onLaunch: () => void; isLaunching: boolean; error: string | null }) {
  const editBusiness = (key: keyof StructuredBrief["business"], value: string) => setStructured({ ...structured, business: { ...structured.business, [key]: value } });
  const setArray = (key: "deliverables" | "guardrails" | "sourceStrategy", value: string) => setStructured({ ...structured, [key]: value.split("\n").map((item) => item.trim()).filter(Boolean) });
  return <main className="intake-shell"><section className="intake-card review-card" aria-labelledby="review-title"><div className="intake-kicker">Step 2 of 2 · Confirm assignment</div><h1 id="review-title">Does this reflect the job?</h1><p className="intake-intro">Make corrections now. Launch stays locked until you confirm this is the brief your agency should execute.</p>
    <div className="review-grid"><Field label="Business" value={structured.business.name} onChange={(value) => editBusiness("name", value)} placeholder="Business name" /><Field label="Location" value={structured.business.city} onChange={(value) => editBusiness("city", value)} placeholder="Location" /><Field label="Category" value={structured.business.category} onChange={(value) => editBusiness("category", value)} placeholder="Category" /><Field label="Primary language" value={structured.languages.primary} onChange={(value) => setStructured({ ...structured, languages: { ...structured.languages, primary: value } })} placeholder="es" /><Field label="Secondary language" value={structured.languages.secondary} onChange={(value) => setStructured({ ...structured, languages: { ...structured.languages, secondary: value } })} placeholder="en" /></div>
    <label className="review-field"><span>Agency objective</span><input value={structured.objective} onChange={(event) => setStructured({ ...structured, objective: event.target.value })} /></label>
    <div className="review-lists"><ReviewList label="Deliverables" value={listValue(structured.deliverables)} onChange={(value) => setArray("deliverables", value)} /><ReviewList label="Source strategy" value={listValue(structured.sourceStrategy)} onChange={(value) => setArray("sourceStrategy", value)} /><ReviewList label="Publishing guardrails" value={listValue(structured.guardrails)} onChange={(value) => setArray("guardrails", value)} /></div>
    {draft.files.length > 0 && <p className="review-note">{draft.files.length} source file{draft.files.length === 1 ? "" : "s"} will be attached when file storage is connected.</p>}{error && <p className="intake-error" role="alert">{error}</p>}
    <div className="intake-actions"><button className="back-action" type="button" onClick={onBack}>Back to assignment</button><button className="primary-action" type="button" onClick={onLaunch} disabled={isLaunching || !structured.business.name.trim() || !structured.objective.trim()}>{isLaunching ? "Launching agency…" : "Launch agency job"}</button></div>
  </section></main>;
}

function ReviewList({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="review-list"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} /></label>; }
