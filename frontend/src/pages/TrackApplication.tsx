import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, MessageSquareWarning, Send, Upload } from "lucide-react";
import { AccountMenu, DemoBadge, Footer, PageShell, TopBar } from "../components/layout";
import { Timeline } from "../components/Timeline";
import { DocumentPreviewModal } from "../components/DocumentUploader";
import { Alert, Chip, EmptyState, LoadingPanel, useToast } from "../components/ui";
import { api, ApiError, uploadFile } from "../lib/api";
import { fmtAY, fmtDate, fmtDateTime, relativeDeadline, statusTone } from "../lib/format";
import type { AppDocument, ApplicationDetail, ApplicationSummary } from "../lib/types";

export default function TrackApplication() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(id ? Number(id) : null);

  const { data: list, isLoading: listLoading } = useQuery<{ applications: ApplicationSummary[] }>({
    queryKey: ["applications"], queryFn: () => api.get("/api/applications"),
  });

  useEffect(() => {
    if (!selectedId && list?.applications.length) {
      const firstSubmitted = list.applications.find((a) => a.status !== "draft") || list.applications[0];
      setSelectedId(firstSubmitted.id);
    }
  }, [list, selectedId]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <TopBar right={<><DemoBadge /><AccountMenu portal="institution" title="Track" subtitle="Institution" /></>} />
      <PageShell>
        <button onClick={() => navigate("/institution")} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </button>
        <h1 className="mb-5 text-2xl font-extrabold text-navy-900">Track Application</h1>

        {listLoading ? <LoadingPanel /> : !list?.applications.length ? (
          <EmptyState icon={<FileText className="h-7 w-7" />} title="No applications to track"
            action={<button onClick={() => navigate("/institution/new")} className="btn-primary mt-2">New Application</button>} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
            <aside className="space-y-2">
              {list.applications.map((a) => (
                <button key={a.id} onClick={() => setSelectedId(a.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === a.id ? "border-brand-400 bg-brand-50/60 ring-1 ring-brand-200" : "border-navy-100 bg-white hover:border-navy-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-navy-900">{a.application_number || "Draft"}</span>
                    <Chip tone={statusTone(a.status)}>{a.status_label}</Chip>
                  </div>
                  <p className="mt-1 text-xs text-navy-500">{a.app_type_label} · {fmtAY(a.academic_year)}</p>
                </button>
              ))}
            </aside>
            {selectedId && <TrackDetail appId={selectedId} key={selectedId} />}
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}

function TrackDetail({ appId }: { appId: number }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery<ApplicationDetail>({ queryKey: ["application", appId], queryFn: () => api.get(`/api/applications/${appId}`) });
  const [preview, setPreview] = useState<AppDocument | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploaded, setUploaded] = useState<AppDocument[]>([]);

  if (isLoading || !data) return <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card"><LoadingPanel /></div>;
  if (data.status === "draft") {
    return (
      <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
        <Alert kind="info" title="This application is still a draft">It has not been submitted yet.</Alert>
        <button onClick={() => navigate(`/institution/application/${appId}`)} className="btn-primary mt-4">Continue editing</button>
      </div>
    );
  }

  const clar = data.clarification;
  const deadline = clar?.open ? relativeDeadline(clar.deadline) : null;

  async function uploadEvidence(file: File) {
    setBusy(true);
    try {
      const res = await uploadFile(appId, "additional_evidence", file);
      setUploaded((u) => [...u, res.document]);
      qc.invalidateQueries({ queryKey: ["application", appId] });
      toast({ kind: res.document.quality.verdict === "failed" ? "error" : "success", title: res.document.quality.verdict === "failed" ? "Quality insufficient — upload a clearer copy" : "Evidence attached" });
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Upload failed" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function respond() {
    if (message.trim().length < 10) { toast({ kind: "error", title: "Describe your response (min 10 characters)." }); return; }
    setBusy(true);
    try {
      await api.post(`/api/applications/${appId}/clarifications`, { message });
      await qc.invalidateQueries({ queryKey: ["application", appId] });
      await qc.invalidateQueries({ queryKey: ["applications"] });
      toast({ kind: "success", title: "Response submitted" });
      setMessage(""); setUploaded([]);
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Could not submit response" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-navy-900">{data.application_number}</h2>
            <p className="mt-0.5 text-sm text-navy-500">{data.app_type_label} · Academic Year {fmtAY(data.academic_year)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone={statusTone(data.status)}>{data.status_label}</Chip>
            <button onClick={() => window.open(`/api/applications/${appId}/acknowledgement.pdf`, "_blank")} className="btn-outline px-3 py-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Acknowledgement
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-navy-400">Last updated {fmtDateTime(data.last_updated)}</p>
        <div className="mt-3 rounded-xl bg-navy-50 px-4 py-3 text-sm text-navy-700">
          <span className="font-semibold text-navy-900">Next step: </span>{data.next_steps}
        </div>
      </div>

      {clar?.open && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-6 shadow-card">
          <div className="flex items-start gap-3">
            <MessageSquareWarning className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-amber-900">Clarification Required</h3>
                {deadline && <Chip tone={deadline.urgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}>
                  {clar.deadline ? `Respond by ${fmtDate(clar.deadline)} · ${deadline.label}` : deadline.label}
                </Chip>}
              </div>
              <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm text-navy-800">“{clar.request.message}”</p>
              <p className="mt-1 text-xs text-amber-700">Requested by {clar.request.actor} ({clar.request.actor_role}) on {fmtDateTime(clar.request.created_at)}</p>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="field-label">Attach supporting document(s)</p>
                  <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-outline">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Document
                  </button>
                  <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.pdf" className="sr-only"
                    onChange={(e) => e.target.files?.[0] && uploadEvidence(e.target.files[0])} />
                  {uploaded.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {uploaded.map((d) => (
                        <li key={d.id} className="flex items-center gap-2 text-xs text-navy-700">
                          <FileText className="h-3.5 w-3.5" /> {d.original_filename}
                          <Chip tone={d.quality.verdict === "failed" ? "bg-red-100 text-red-700" : d.quality.verdict === "warning" ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}>
                            {d.quality.verdict === "failed" ? "Rejected" : d.quality.verdict === "warning" ? "Review" : "Accepted"}
                          </Chip>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label htmlFor="resp" className="field-label">Your response</label>
                  <textarea id="resp" className="field-input min-h-[80px]" value={message} onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe what you have provided or clarified…" maxLength={2000} />
                </div>
                <button onClick={respond} disabled={busy} className="btn-primary">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <><Send className="h-4 w-4" /> Submit Response</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
          <h3 className="mb-4 text-base font-bold text-navy-900">Review Status</h3>
          <Timeline stages={data.stages} />
        </div>
        <div className="space-y-5">
          <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
            <h3 className="mb-3 text-base font-bold text-navy-900">Documents ({data.documents.length})</h3>
            <ul className="space-y-2">
              {data.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-navy-100 p-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-navy-300" />
                    <span className="truncate text-sm text-navy-700">{d.original_filename}</span>
                  </span>
                  <button onClick={() => setPreview(d)} className="text-xs font-semibold text-brand-600 hover:text-brand-700">View</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
            <h3 className="mb-3 text-base font-bold text-navy-900">Updates</h3>
            <ul className="space-y-3">
              {data.events.filter((e) => e.message).slice(0, 8).map((e) => (
                <li key={e.id} className="border-l-2 border-navy-100 pl-3">
                  <p className="text-sm text-navy-800">{e.message}</p>
                  <p className="text-[11px] text-navy-400">{e.actor} · {fmtDateTime(e.created_at)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
