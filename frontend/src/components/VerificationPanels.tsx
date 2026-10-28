import { AlertTriangle, CheckCircle2, FileSearch, Info, ScanLine, ShieldAlert, XCircle } from "lucide-react";
import { SimulatedBadge } from "./ui";
import { titleCase, fmtBytes } from "../lib/format";
import type { AppDocument, CaseDetail, Finding, VerificationRunJson } from "../lib/types";

const SEV_ICON = { critical: XCircle, warning: AlertTriangle, pass: CheckCircle2, info: Info };
const SEV_CLS = {
  critical: "text-red-600", warning: "text-amber-600", pass: "text-teal-600", info: "text-navy-400",
};

export function FindingRow({ f }: { f: Finding }) {
  const Icon = SEV_ICON[f.severity];
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-navy-100 bg-white p-3">
      <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${SEV_CLS[f.severity]}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-navy-900">{f.title}</p>
        {f.detail && <p className="mt-0.5 text-xs text-navy-500">{f.detail}</p>}
        {(f.expected || f.observed) && (
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
            {f.expected && <span className="rounded bg-navy-50 px-2 py-0.5 text-navy-600">Expected: <b>{f.expected}</b></span>}
            {f.observed && <span className={`rounded px-2 py-0.5 ${f.severity === "critical" ? "bg-red-50 text-red-700" : "bg-navy-50 text-navy-600"}`}>Observed: <b>{f.observed}</b></span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function GlimpsePanel({ run, simulated }: { run: VerificationRunJson | null; simulated: boolean }) {
  const docs = (run?.summary.documents as { document_id: number; source: string; fields: { field: string; label: string; value: string; confidence: string }[] }[]) || [];
  const allFields = docs.flatMap((d) => d.fields);
  return (
    <div>
      <Header icon={FileSearch} title="GLIMPSE — Document Extraction" sub="OCR / field extraction" simulated={simulated} />
      {allFields.length === 0 ? (
        <p className="mt-3 rounded-xl bg-navy-50 p-3 text-sm text-navy-500">
          No fields extracted. GLIMPSE reads the text layer of digitally generated PDFs; scanned images are not OCR'd in this build.
        </p>
      ) : (
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="border-b border-navy-100 text-xs uppercase text-navy-400"><th className="pb-2 pr-3 font-semibold">Field</th><th className="pb-2 pr-3 font-semibold">Extracted Value</th><th className="pb-2 font-semibold">Basis</th></tr></thead>
          <tbody>
            {allFields.map((f, i) => (
              <tr key={i} className="border-b border-navy-50 last:border-0">
                <td className="py-2 pr-3 font-semibold text-navy-700">{f.label}</td>
                <td className="py-2 pr-3 text-navy-900">{f.value}</td>
                <td className="py-2 text-xs text-teal-700">{f.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Method text={run?.summary.method as string} />
    </div>
  );
}

export function TracexPanel({ run, documents, simulated }: { run: VerificationRunJson | null; documents: AppDocument[]; simulated: boolean }) {
  const docs = (run?.summary.documents as { document_id: number; hash_verified: boolean; quality_verdict: string; integrity_status: string; indicators: string[]; pdf_revisions?: number }[]) || [];
  const nameOf = (id: number) => documents.find((d) => d.id === id)?.original_filename || `Document ${id}`;
  return (
    <div>
      <Header icon={ScanLine} title="TRACE-X — Document Integrity" sub="Measured signals only" simulated={simulated} />
      <div className="mt-3 space-y-2">
        {docs.map((d) => (
          <div key={d.document_id} className="rounded-xl border border-navy-100 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-navy-800">{nameOf(d.document_id)}</span>
              <span className={`chip ${d.integrity_status === "attention" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}>
                {d.integrity_status === "attention" ? <><ShieldAlert className="h-3.5 w-3.5" /> Attention</> : <><CheckCircle2 className="h-3.5 w-3.5" /> No indicators</>}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-2 text-xs text-navy-500">
              <span>Hash re-verified: <b className={d.hash_verified ? "text-teal-700" : "text-red-600"}>{d.hash_verified ? "yes" : "no"}</b></span>
              <span>Readability: <b>{titleCase(d.quality_verdict || "n/a")}</b></span>
              {typeof d.pdf_revisions === "number" && <span>PDF revisions: <b>{d.pdf_revisions}</b></span>}
            </div>
            {d.indicators.length > 0 && (
              <ul className="mt-1.5 list-disc pl-4 text-xs text-amber-700">{d.indicators.map((x, i) => <li key={i}>{x}</li>)}</ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
        TRACE-X reports measurable signals (quality, PDF metadata/revisions, EXIF, duplicate hashes). It does not label a document genuine or forged.
      </p>
      <Method text={run?.summary.method as string} />
    </div>
  );
}

export function VerificationSummary({ data }: { data: CaseDetail }) {
  const rules = data.verification.rules;
  const summary = (rules?.summary || {}) as { critical?: number; warning?: number; pass?: number };
  const rows = [
    { engine: "GLIMPSE (Field Extraction)", state: data.verification.glimpse ? "Completed" : "—", tone: "teal" },
    { engine: "TRACE-X (Integrity Analysis)", state: tracexState(data), tone: tracexState(data) === "Attention" ? "amber" : "teal" },
    { engine: "EvidenceGraph (Cross-check)", state: summary.critical ? "Discrepancy" : summary.warning ? "Warnings" : "Consistent", tone: summary.critical ? "red" : summary.warning ? "amber" : "teal" },
    { engine: "Deterministic Rules", state: summary.critical ? `${summary.critical} critical` : summary.warning ? `${summary.warning} warning(s)` : "All passed", tone: summary.critical ? "red" : summary.warning ? "amber" : "teal" },
  ];
  const toneCls: Record<string, string> = { teal: "bg-teal-100 text-teal-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700" };
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.engine} className="flex items-center justify-between gap-2 rounded-xl border border-navy-100 bg-white px-3 py-2.5">
          <span className="text-sm font-medium text-navy-700">{r.engine}</span>
          <span className={`chip ${toneCls[r.tone]}`}>{r.state}</span>
        </div>
      ))}
    </div>
  );
}

function tracexState(data: CaseDetail): string {
  const docs = (data.verification.tracex?.summary.documents as { integrity_status: string }[]) || [];
  return docs.some((d) => d.integrity_status === "attention") ? "Attention" : "Clear";
}

function Header({ icon: Icon, title, sub, simulated }: { icon: typeof FileSearch; title: string; sub: string; simulated: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-600"><Icon className="h-4 w-4" /></span>
        <div><p className="text-sm font-bold text-navy-900">{title}</p><p className="text-xs text-navy-400">{sub}</p></div>
      </div>
      {simulated && <SimulatedBadge />}
    </div>
  );
}

function Method({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mt-3 text-[11px] italic text-navy-400">Method: {text}</p>;
}

export function DocBadge({ doc }: { doc: AppDocument }) {
  const v = doc.quality.verdict;
  return (
    <span className={`chip ${v === "accepted" ? "bg-teal-100 text-teal-800" : v === "warning" ? "bg-amber-100 text-amber-800" : v === "failed" ? "bg-red-100 text-red-700" : "bg-navy-100 text-navy-500"}`}>
      {v === "accepted" ? "Accepted" : v === "warning" ? "Review" : v === "failed" ? "Failed" : titleCase(doc.status)}
    </span>
  );
}

export function fileMeta(doc: AppDocument) {
  return `${fmtBytes(doc.size_bytes)}${doc.page_count ? ` · ${doc.page_count}p` : ""}`;
}
