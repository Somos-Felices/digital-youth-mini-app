"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header, Footer, NumberedSection } from "@/components/chrome";
import { request, readableError } from "@/lib/api";
import { formatStatus, MethodContractError, parseMethodDetail, safeExternalUrl, type Method } from "@/lib/method-detail";
import type { LocalExperiment } from "@/lib/types";

type Evidence = { title: string; url: string | null; description: string; evidence_type: string; recorded_on: string | null };
type PublicExperiment = { id: number; title: string; status: string; started_on: string | null; ended_on: string | null; actual_spending: number | null; actual_spending_currency: string | null; actual_income: number | null; actual_income_currency: string | null; tasks_completed: string; outputs_produced: string; problems_encountered: string; final_assessment: string; reviewed_at: string | null; evidence: Evidence[] };
const criterionNames: Record<string, string> = { phone_and_free_tools: "1 · Phone and free tools", independent_execution: "2 · Independent execution without Somos Felices", no_credentials_or_preexisting_trust: "3 · No credentials or pre-existing trust", no_meetings_or_sales_calls: "4 · No meetings or sales calls" };
function parseExperiments(value: unknown): PublicExperiment[] {
  if (typeof value !== "object" || value === null || !("experiments" in value) || !Array.isArray(value.experiments)) throw new Error("Experiment evidence could not be read.");
  return value.experiments.map((entry): PublicExperiment => {
    if (typeof entry !== "object" || entry === null) throw new Error("Experiment evidence could not be read.");
    const row = entry as Record<string, unknown>;
    if (!Number.isSafeInteger(Number(row.id)) || typeof row.title !== "string" || typeof row.status !== "string" || row.status !== "completed" || !Array.isArray(row.evidence) || typeof row.tasks_completed !== "string" || typeof row.outputs_produced !== "string" || typeof row.problems_encountered !== "string" || typeof row.final_assessment !== "string") throw new Error("Experiment evidence could not be read.");
    const nullableDate = (x: unknown) => x == null ? null : typeof x === "string" ? x : (() => { throw new Error("Experiment evidence could not be read."); })();
    const nullableAmount = (x: unknown) => x == null ? null : typeof x === "number" && Number.isFinite(x) ? x : (() => { throw new Error("Experiment evidence could not be read."); })();
    return { id: Number(row.id), title: row.title, status: row.status, started_on: nullableDate(row.started_on), ended_on: nullableDate(row.ended_on), actual_spending: nullableAmount(row.actual_spending), actual_spending_currency: nullableDate(row.actual_spending_currency), actual_income: nullableAmount(row.actual_income), actual_income_currency: nullableDate(row.actual_income_currency), tasks_completed: row.tasks_completed, outputs_produced: row.outputs_produced, problems_encountered: row.problems_encountered, final_assessment: row.final_assessment, reviewed_at: nullableDate(row.reviewed_at), evidence: row.evidence.map((item): Evidence => { if (typeof item !== "object" || item === null || typeof (item as Record<string, unknown>).title !== "string" || typeof (item as Record<string, unknown>).description !== "string" || typeof (item as Record<string, unknown>).evidence_type !== "string") throw new Error("Experiment evidence could not be read."); const evidence = item as Record<string, unknown>; return { title: evidence.title as string, url: safeExternalUrl(nullableDate(evidence.url)), description: evidence.description as string, evidence_type: evidence.evidence_type as string, recorded_on: nullableDate(evidence.recorded_on) }; }) };
  });
}

export default function MethodDetail() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [method, setMethod] = useState<Method | null>(null);
  const [experiments, setExperiments] = useState<PublicExperiment[]>([]);
  const [error, setError] = useState("");
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setMethod(null); setExperiments([]); setError(""); setEvidenceError(""); setLoading(true); setEvidenceLoading(true); setStarted(false);
    request<unknown>(`/api/methods/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then((payload) => { const parsed = parseMethodDetail(payload); if (live) setMethod(parsed); })
      .catch((e: unknown) => { if (live && !controller.signal.aborted) setError(e instanceof MethodContractError ? e.message : readableError(e)); })
      .finally(() => { if (live) setLoading(false); });
    request<unknown>(`/api/methods/${encodeURIComponent(slug)}/experiments`, { signal: controller.signal })
      .then((payload) => { const parsed = parseExperiments(payload); if (live) setExperiments(parsed); })
      .catch((e: unknown) => { if (live && !controller.signal.aborted) setEvidenceError(readableError(e)); })
      .finally(() => { if (live) setEvidenceLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [slug]);

  function start() {
    if (!method) return;
    try {
      const saved = localStorage.getItem("dy-local-experiments");
      const entries = saved ? JSON.parse(saved) as LocalExperiment[] : [];
      if (!Array.isArray(entries)) throw new Error("Invalid saved data");
      if (!entries.some((entry) => entry?.slug === method.slug)) entries.push({ slug: method.slug, title: method.title, startedAt: new Date().toISOString(), completedSteps: [], paused: false, timeMinutes: 0, costs: [], income: [], outputs: [], notes: "" });
      localStorage.setItem("dy-local-experiments", JSON.stringify(entries)); setStarted(true); router.push("/my-experiments");
    } catch { setError("This browser could not save local experiment progress. Check storage settings and try again."); }
  }

  if (loading) return <><Header /><main className="admin-main"><div className="loading" role="status">Loading method guide…</div></main><Footer /></>;
  if (!method) return <><Header /><main className="admin-main"><div className="status-message" role="alert">{error || "This method could not be loaded."}</div><Link className="text-link" href="/methods">← Method library</Link></main><Footer /></>;
  const req = method.requirements;
  const sourceById = new Map(method.sources.map((source) => [source.id, source]));
  return <><Header /><main>
    <header className="page-intro method-heading"><Link className="text-link" href="/methods">← All methods</Link><div className="method-overline"><span className="eyebrow">{method.category}</span><span className={`status-label status-${method.status}`}>{formatStatus(method.status)}</span></div><h1>{method.title}</h1><p>{method.summary}</p><p className="disclaimer">This method is a candidate experiment. No earning outcome is promised or implied.</p><button className="button" onClick={start}>{started ? "Start added to your local experiments" : "Start an individual experiment ↗"}</button>{error && <p className="status-message" role="alert">{error}</p>}</header>
    <section className="method-content">
      <NumberedSection number="I"><div className="eyebrow">Overview</div><h2>What you actually do</h2><p>{method.overview}</p></NumberedSection>
      <NumberedSection number="II"><div className="eyebrow">Four-condition assessment</div><h2>Current qualification</h2>{method.criteria.length ? <div className="assessment-list">{method.criteria.map((criterion) => <article className="assessment-row" key={criterion.criterion_code}><div><strong>{criterionNames[criterion.criterion_code] ?? formatStatus(criterion.criterion_code)}</strong><span className={`status-label status-${criterion.assessment}`}>{formatStatus(criterion.assessment)}</span></div><p>{criterion.explanation}</p>{criterion.source_ids.map((id) => { const source = sourceById.get(id); return source ? <p className="helper" key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></p> : null; })}</article>)}</div> : <p className="inline-notice">No criterion assessments are recorded yet. Treat every requirement as unverified.</p>}{method.status === "qualified" && method.criteria.length === 4 && method.criteria.every((c) => c.assessment === "pass") ? <p className="inline-notice">All four requirements currently pass with evidence. Review the linked sources and limitations before acting.</p> : <p className="inline-notice">This method is not qualified. At least one condition remains unverified, conditional or failed.</p>}</NumberedSection>
      <NumberedSection number="III"><div className="eyebrow">Starting requirements</div><h2>What you need to begin</h2><div className="requirements-grid">{Object.entries(req).map(([key, value]) => <div className="detail-item" key={key}><span className="label">{formatStatus(key)}</span><p>{String(value)}</p></div>)}</div></NumberedSection>
      <NumberedSection number="IV"><div className="eyebrow">Tools</div><h2>Tools and conditions</h2>{method.tools.length ? method.tools.map((tool, index) => <article className="tool-row" key={tool.id ?? `${tool.name}-${index}`}><h3>{tool.name}</h3><p>{tool.purpose}</p><p><strong>Free use:</strong> {tool.free_conditions}</p><p><strong>Limitations:</strong> {tool.limitations}</p><p><strong>Phone support:</strong> {formatStatus(tool.phone_usable)} · <strong>Last verified:</strong> {tool.last_verified || "Not verified"}</p>{tool.official_url && <a href={tool.official_url} target="_blank" rel="noreferrer" className="text-link">Official website ↗</a>}</article>) : <p className="inline-notice">No tools have been verified for this method yet. Do not assume a free plan or phone support.</p>}</NumberedSection>
      <NumberedSection number="V"><div className="eyebrow">Step-by-step execution</div><h2>A starting experiment</h2><p className="muted">These steps help test the idea. They do not establish that it will generate income.</p>{method.steps.length ? <div className="guide-steps">{method.steps.map((step) => <article className="guide-step" key={step.step_number}><span className="step-num">{String(step.step_number).padStart(2, "0")}</span><div><h3>{step.title}</h3><p><strong>What to do:</strong> {step.what_to_do}</p><p><strong>How:</strong> {step.how_to_do}</p>{step.tool_names && <p><strong>Tool:</strong> {step.tool_names}</p>}<p><strong>Produce:</strong> {step.output}</p><p><strong>Done when:</strong> {step.success_looks_like}</p>{step.common_problems && <p><strong>Common problems:</strong> {step.common_problems}</p>}{step.alternatives && <p><strong>Alternative:</strong> {step.alternatives}</p>}</div></article>)}</div> : <p className="inline-notice">Execution steps have not been documented yet.</p>}</NumberedSection>
      <NumberedSection number="VI"><div className="eyebrow">Distribution</div><h2>How the output reaches people</h2><p>{method.distribution}</p></NumberedSection>
      <NumberedSection number="VII"><div className="eyebrow">Income mechanism</div><h2>How money could be generated</h2><p>{method.income_mechanism}</p><p className="disclaimer">Possible income mechanisms are not actual earnings. No income has been recorded unless a reviewed experiment below explicitly reports it.</p></NumberedSection>
      <NumberedSection number="VIII"><div className="eyebrow">Limitations and risks</div><h2>What could prevent this from working</h2><p>{method.limitations}</p></NumberedSection>
      <NumberedSection number="IX"><div className="eyebrow">Sources and experiment evidence</div><h2>What supports these statements</h2>{method.sources.length ? method.sources.map((source) => <article className="source-row" key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a><p>{source.supports_claim}</p><span className="helper">{formatStatus(source.source_type)} · accessed {source.accessed_at || "date not recorded"} · verified {source.last_verified_at || "not verified"}</span></article>) : <p className="inline-notice">No evidence sources have been approved. Platform and cost details remain unverified.</p>}{evidenceLoading ? <p className="loading" role="status">Loading reviewed experiment evidence…</p> : evidenceError ? <div className="status-message" role="alert">Reviewed experiment evidence is temporarily unavailable. The method guide remains available. {evidenceError}</div> : experiments.length ? experiments.map((experiment) => <article className="experiment-evidence" key={experiment.id}><h3>{experiment.title} · {formatStatus(experiment.status)}</h3><p>Period: {experiment.started_on || "not recorded"} — {experiment.ended_on || "not recorded"}</p><p>Actual spending: {experiment.actual_spending == null ? "Not recorded" : `${experiment.actual_spending_currency || ""} ${experiment.actual_spending}`}</p><p>Actual income received: {experiment.actual_income == null ? "Not recorded" : `${experiment.actual_income_currency || ""} ${experiment.actual_income}`}</p><p>Outputs: {experiment.outputs_produced || "Not recorded"}</p><p>Problems: {experiment.problems_encountered || "Not recorded"}</p><p>{experiment.final_assessment || "No final assessment recorded."}</p>{experiment.evidence.map((evidence, index) => <p key={`${evidence.title}-${index}`}>{evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title} ↗</a> : evidence.title}{evidence.description ? ` · ${evidence.description}` : ""}</p>)}<span className="helper">Reviewed {experiment.reviewed_at || "date not recorded"}</span></article>) : <p className="muted">No approved project experiment results are available.</p>}</NumberedSection>
      <div className="start-panel"><div><div className="eyebrow">Your progress stays on this device</div><h2>Test it for yourself.</h2><p>Checklist progress, notes, time, costs and actual received income are stored in this browser only by default.</p></div><button className="button" onClick={start}>Add to my experiments ↗</button></div>
    </section></main><Footer /></>;
}
