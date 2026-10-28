import { useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Send } from "lucide-react";
import { Alert, useToast } from "./ui";
import { DocumentPreviewModal } from "./DocumentUploader";
import { api, ApiError } from "../lib/api";
import { fmtAY, titleCase } from "../lib/format";
import type { AppDocument, ApplicationDetail } from "../lib/types";

export function ReviewStep({ app, onBack, onSubmitted }: {
  app: ApplicationDetail; onBack: () => void; onSubmitted: (app: ApplicationDetail) => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AppDocument | null>(null);

  const formEntries = Object.entries(app.form_data).filter(([k]) => !k.startsWith("_"));
  const warnings = app.documents.filter((d) => d.quality.verdict === "warning");

  async function submit() {
    if (!confirm) return;
    setBusy(true);
    try {
      const res = await api.post<ApplicationDetail>(`/api/applications/${app.id}/submit`, { confirm: true });
      toast({ kind: "success", title: "Application submitted" });
      onSubmitted(res);
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Submission failed" });
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold text-navy-900">Review & Submit</h1>
          <p className="mt-1 text-sm text-navy-500">Check the details below before submitting your application.</p>

          <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="Institution" value={app.institution_profile.name} />
            <Row label="Institution ID" value={app.institution_profile.permanent_id} />
            <Row label="Application Type" value={app.app_type_label} />
            <Row label="Academic Year" value={fmtAY(app.academic_year)} />
          </dl>
        </div>

        {formEntries.length > 0 && (
          <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
            <h2 className="text-base font-bold text-navy-900">Form Details</h2>
            <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {formEntries.map(([k, v]) => <Row key={k} label={titleCase(k)} value={String(v)} />)}
            </dl>
          </div>
        )}

        <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
          <h2 className="text-base font-bold text-navy-900">Uploaded Documents ({app.documents.length})</h2>
          <ul className="mt-4 space-y-2">
            {app.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-navy-100 p-3">
                <span className="flex min-w-0 items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-navy-300" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-navy-900">{d.original_filename}</span>
                    <span className="text-xs text-navy-400">{titleCase(d.requirement_code)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`chip ${d.status === "accepted" ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}>
                    {d.status === "accepted" ? "Accepted" : "Review"}
                  </span>
                  <button onClick={() => setPreview(d)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">Preview</button>
                </span>
              </li>
            ))}
          </ul>
          {warnings.length > 0 && (
            <div className="mt-4"><Alert kind="warning" title={`${warnings.length} document(s) flagged for legibility review`}>
              These can still be submitted; an official will confirm they are legible.
            </Alert></div>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
          <h2 className="text-base font-bold text-navy-900">Declaration</h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-navy-100 bg-navy-50/50 p-3">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-400" />
            <span className="text-xs text-navy-600">
              I confirm the information and documents submitted are correct to the best of my knowledge. (Demonstration submission.)
            </span>
          </label>
          <div className="mt-5 space-y-2">
            <button onClick={submit} disabled={!confirm || busy} className="btn-primary w-full py-3">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit Application</>}
            </button>
            <button onClick={onBack} disabled={busy} className="btn-ghost w-full"><ArrowLeft className="h-4 w-4" /> Back</button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-navy-400">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-500" />
            A unique application ID is generated on submission and the application becomes visible to AICTE officials.
          </p>
        </div>
      </aside>

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-navy-900">{value}</dd>
    </div>
  );
}
