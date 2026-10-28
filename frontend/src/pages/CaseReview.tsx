import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, GitBranch, History, LayoutGrid, ScanSearch } from "lucide-react";
import { OfficialNav } from "../components/OfficialNav";
import { Footer, PageShell } from "../components/layout";
import { Alert, Chip, LoadingPanel, SimulatedBadge } from "../components/ui";
import { DocumentViewer } from "../components/DocumentViewer";
import { EvidenceGraph } from "../components/EvidenceGraph";
import { DecisionPanel } from "../components/DecisionPanel";
import { Timeline } from "../components/Timeline";
import { FindingRow, GlimpsePanel, TracexPanel, VerificationSummary, DocBadge, fileMeta } from "../components/VerificationPanels";
import { api } from "../lib/api";
import { fmtAY, fmtDateTime, statusTone, titleCase } from "../lib/format";
import { useMe } from "../lib/session";
import type { AppDocument, CaseDetail } from "../lib/types";
import clsx from "clsx";

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "verification", label: "Verification Results", icon: ScanSearch },
  { key: "graph", label: "EvidenceGraph", icon: GitBranch },
  { key: "history", label: "Review History", icon: History },
] as const;

type TabKey = typeof TABS[number]["key"];

export default function CaseReview() {
  const { id } = useParams();
  const caseId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [tab, setTab] = useState<TabKey>("overview");

  const { data, isLoading, error } = useQuery<CaseDetail>({
    queryKey: ["official", "case", caseId],
    queryFn: () => api.get(`/api/official/applications/${caseId}`),
  });

  // Opening a submitted case starts scrutiny (idempotent on the backend).
  const open = useMutation({
    mutationFn: () => api.post<CaseDetail>(`/api/official/applications/${caseId}/open`),
    onSuccess: (d) => { qc.setQueryData(["official", "case", caseId], d); qc.invalidateQueries({ queryKey: ["official", "dashboard"] }); },
  });
  useEffect(() => {
    if (data?.status === "submitted" && (me?.official?.user.role === "scrutiny_member" || me?.official?.user.role === "reviewer") && !open.isPending) {
      open.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status, me]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <OfficialNav session={me?.official} />
      <PageShell>
        <button onClick={() => navigate("/official/applications")} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </button>

        {isLoading || !data ? (error ? <Alert kind="error" title="Case not found">This case may not exist.</Alert> : <LoadingPanel />) : (
          <div className="space-y-5">
            <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-extrabold text-navy-900">{data.application_number}</h1>
                    {data.simulated && <SimulatedBadge />}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-navy-700">{data.institution.name}</p>
                  <p className="text-xs text-navy-400">{data.app_type_label} · Academic Year {fmtAY(data.academic_year)}</p>
                </div>
                <Chip tone={statusTone(data.status)}>{data.status_label}</Chip>
              </div>

              <nav className="mt-5 flex items-center gap-5 overflow-x-auto border-b border-navy-100" aria-label="Case sections">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} className={clsx("tab whitespace-nowrap", tab === t.key && "tab-active")}>
                      <Icon className="h-4 w-4" /> {t.label}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-5">
                {tab === "overview" && <OverviewTab data={data} />}
                {tab === "documents" && <DocumentsTab data={data} />}
                {tab === "verification" && <VerificationTab data={data} />}
                {tab === "graph" && (
                  <div>
                    {data.simulated && <div className="mb-3"><SimulatedBadge /></div>}
                    <EvidenceGraph nodes={data.evidence_graph.nodes} edges={data.evidence_graph.edges} />
                  </div>
                )}
                {tab === "history" && <HistoryTab data={data} />}
              </div>
            </div>

            <DecisionPanel data={data} />
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}

function OverviewTab({ data }: { data: CaseDetail }) {
  const inst = data.institution_profile;
  const ref = inst.reference_approval;
  const rules = data.verification.rules?.findings.filter((f) => f.severity === "critical" || f.severity === "warning") || [];
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="Institution Details">
        <Row label="Institution" value={inst.name} />
        <Row label="Institution ID" value={inst.permanent_id} />
        <Row label="Type" value={inst.institution_type || "—"} />
        <Row label="State" value={inst.state || "—"} />
        <Row label="Affiliating University" value={inst.affiliating_university || "—"} />
        {ref && <Row label="Previous EoA (reference)" value={`${fmtAY(ref.academic_year)}`} />}
      </Section>
      <Section title="Application Details">
        <Row label="Application ID" value={data.application_number || "—"} />
        <Row label="Type" value={data.app_type_label} />
        <Row label="Academic Year" value={fmtAY(data.academic_year)} />
        <Row label="Submitted" value={fmtDateTime(data.submitted_at)} />
        <Row label="Documents" value={String(data.documents.length)} />
        <Row label="Current Stage" value={data.status_label} />
      </Section>
      <Section title="Verification Summary">
        <VerificationSummary data={data} />
        {rules.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-navy-400">Key findings</p>
            <div className="space-y-2">{rules.slice(0, 3).map((f) => <FindingRow key={f.id} f={f} />)}</div>
          </div>
        )}
      </Section>
    </div>
  );
}

function DocumentsTab({ data }: { data: CaseDetail }) {
  const [selected, setSelected] = useState<AppDocument | null>(data.documents[0] || null);
  const glimpse = data.verification.glimpse;
  const tracex = data.verification.tracex;
  const docFields = selected ? ((glimpse?.summary.documents as { document_id: number; fields: { label: string; value: string }[] }[])?.find((d) => d.document_id === selected.id)?.fields || []) : [];
  const docTracex = selected ? ((tracex?.summary.documents as { document_id: number; indicators: string[]; integrity_status: string }[])?.find((d) => d.document_id === selected.id)) : null;
  const docRules = data.verification.rules?.findings.filter((f) => f.document_id === selected?.id) || [];

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_1fr_300px]">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">Uploaded Documents ({data.documents.length})</p>
        <div className="space-y-1.5">
          {data.documents.map((d) => (
            <button key={d.id} onClick={() => setSelected(d)}
              className={clsx("w-full rounded-xl border p-2.5 text-left transition", selected?.id === d.id ? "border-brand-400 bg-brand-50/60" : "border-navy-100 bg-white hover:border-navy-200")}>
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-navy-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-navy-800">{d.original_filename}</p>
                  <p className="text-[11px] text-navy-400">{titleCase(d.requirement_code)} · {fileMeta(d)}</p>
                  <div className="mt-1"><DocBadge doc={d} /></div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[420px]"><DocumentViewer doc={selected} /></div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-navy-400">
            Extracted Fields {data.simulated && <SimulatedBadge />}
          </p>
          {docFields.length ? (
            <dl className="space-y-1.5">
              {docFields.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-navy-50 px-2.5 py-1.5 text-xs">
                  <dt className="text-navy-500">{f.label}</dt><dd className="font-semibold text-navy-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : <p className="rounded-lg bg-navy-50 p-2.5 text-xs text-navy-500">No text layer extracted for this document (no OCR in this build).</p>}
        </div>
        {selected && (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">Quality</p>
            <div className="rounded-lg border border-navy-100 p-2.5 text-xs">
              <div className="flex items-center justify-between"><span className="text-navy-500">Verdict</span><DocBadge doc={selected} /></div>
              {selected.quality.metrics && (
                <dl className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-navy-500">
                  {Object.entries(selected.quality.metrics).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-1"><dt>{titleCase(k)}</dt><dd className="font-semibold text-navy-700">{v}</dd></div>
                  ))}
                </dl>
              )}
              {selected.quality.reasons.length > 0 && (
                <ul className="mt-1.5 list-disc pl-4 text-[11px] text-amber-700">{selected.quality.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>
              )}
            </div>
          </div>
        )}
        {docTracex && docTracex.indicators.length > 0 && (
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">Integrity Indicators</p>
            <ul className="list-disc rounded-lg bg-amber-50 p-2.5 pl-6 text-[11px] text-amber-800">{docTracex.indicators.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        )}
        {docRules.length > 0 && (
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy-400">Rule Checks</p>
            <div className="space-y-1.5">{docRules.map((f) => <FindingRow key={f.id} f={f} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function VerificationTab({ data }: { data: CaseDetail }) {
  const rules = data.verification.rules?.findings || [];
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-navy-100 p-4"><GlimpsePanel run={data.verification.glimpse} simulated={data.simulated} /></div>
        <div className="rounded-2xl border border-navy-100 p-4"><TracexPanel run={data.verification.tracex} documents={data.documents} simulated={data.simulated} /></div>
      </div>
      <div className="rounded-2xl border border-navy-100 p-4">
        <h3 className="mb-3 text-sm font-bold text-navy-900">Deterministic Rule Checks (EvidenceGraph cross-source consistency)</h3>
        <div className="grid gap-2 sm:grid-cols-2">{rules.map((f) => <FindingRow key={f.id} f={f} />)}</div>
        <p className="mt-3 text-[11px] italic text-navy-400">Documents are not labelled genuine or forged. These checks compare extracted fields, the institution profile, the published reference and the applicant's form.</p>
      </div>
    </div>
  );
}

function HistoryTab({ data }: { data: CaseDetail }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-bold text-navy-900">Workflow Timeline</h3>
        <Timeline stages={data.stages} />
      </div>
      <div>
        <h3 className="mb-3 text-sm font-bold text-navy-900">Recorded Actions</h3>
        {data.review_actions.length === 0 ? <p className="text-sm text-navy-400">No review actions recorded yet.</p> : (
          <ul className="space-y-3">
            {data.review_actions.map((a) => (
              <li key={a.id} className="rounded-xl border border-navy-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-navy-900">{a.label}</span>
                  <span className="text-[11px] text-navy-400">{fmtDateTime(a.created_at)}</span>
                </div>
                <p className="mt-0.5 text-xs text-navy-500">{a.user} · {a.role}</p>
                {a.comment && <p className="mt-1.5 rounded-lg bg-navy-50 p-2 text-xs text-navy-700">“{a.comment}”</p>}
                {a.deadline && <p className="mt-1 text-[11px] text-amber-700">Deadline: {a.deadline}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-navy-100 p-4">
      <h3 className="mb-3 text-sm font-bold text-navy-900">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-navy-400">{label}</span>
      <span className="text-right font-medium text-navy-900">{value}</span>
    </div>
  );
}
