import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";
import { AccountMenu, DemoBadge, Footer, PageShell, TopBar } from "../components/layout";
import { Stepper } from "../components/Stepper";
import { Alert, LoadingPanel, useToast } from "../components/ui";
import { ApplicationForm, type FormValues } from "../components/ApplicationForms";
import { DocumentRow } from "../components/DocumentUploader";
import { Ring } from "../components/Ring";
import { ReviewStep } from "../components/ReviewStep";
import { api, ApiError } from "../lib/api";
import { fmtAY } from "../lib/format";
import type { ApplicationDetail } from "../lib/types";

export default function ApplicationWizard() {
  const { id } = useParams();
  const appId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<ApplicationDetail>({
    queryKey: ["application", appId],
    queryFn: () => api.get(`/api/applications/${appId}`),
  });

  const hasForm = data && data.app_type !== "eoa";
  const [step, setStep] = useState<0 | 1 | 2>(hasForm ? 0 : 1);
  const [values, setValues] = useState<FormValues>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [savingForm, setSavingForm] = useState(false);
  const loaded = useRef(false);
  const maxMb = 10;

  useEffect(() => {
    if (data && !loaded.current) {
      loaded.current = true;
      setValues({ ...(data.form_data as FormValues), _academic_year: fmtAY(data.academic_year) });
      setStep(data.app_type === "eoa" ? 1 : 0);
    }
  }, [data]);

  // Autosave form drafts (debounced) so a refresh never loses work.
  const saveTimer = useRef<number | undefined>(undefined);
  function changeField(name: string, value: string | number) {
    setValues((v) => ({ ...v, [name]: value }));
    setFormErrors((e) => { const { [name]: _drop, ...rest } = e; return rest; });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void persistDraft(false), 900);
  }

  async function persistDraft(validate: boolean): Promise<boolean> {
    if (!data || data.app_type === "eoa") return true;
    const payload = Object.fromEntries(Object.entries(values).filter(([k]) => !k.startsWith("_")));
    try {
      const res = await api.patch<ApplicationDetail>(`/api/applications/${appId}`, { form_data: payload, validate });
      qc.setQueryData(["application", appId], res);
      if (res.field_warnings) setFormErrors(res.field_warnings);
      else setFormErrors({});
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.details?.fields) {
        setFormErrors(err.details.fields);
        if (validate) toast({ kind: "error", title: "Please correct the highlighted fields." });
      } else if (validate) toast({ kind: "error", title: "Could not save the form." });
      return false;
    }
  }

  async function saveDraftExplicit() {
    setSavingForm(true);
    await persistDraft(false);
    setSavingForm(false);
    toast({ kind: "success", title: "Draft saved" });
  }

  async function continueFromForm() {
    setSavingForm(true);
    const ok = await persistDraft(true);
    setSavingForm(false);
    if (ok) setStep(1);
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ["application", appId] });
  function onUploaded(payload: { document: unknown; checklist: unknown }) {
    void payload; refresh();
  }

  if (isLoading || !data) {
    return (
      <div className="relative flex min-h-screen flex-col">
        <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" />
        <TopBar right={<AccountMenu portal="institution" title="Application" />} />
        <PageShell>{error ? <Alert kind="error" title="Could not load application">This application may not exist or you don't have access.</Alert> : <LoadingPanel />}</PageShell>
      </div>
    );
  }

  if (data.status !== "draft") {
    // Already submitted — send to tracking.
    navigate(`/institution/track/${appId}`, { replace: true });
    return null;
  }

  const cl = data.checklist;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <TopBar right={<><DemoBadge /><AccountMenu portal="institution" title="New Application" subtitle={data.app_type_label} /></>} />
      <PageShell>
        <button onClick={() => navigate("/institution/new")} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
          <ArrowLeft className="h-4 w-4" /> Change purpose
        </button>
        <div className="mb-6"><Stepper current={step} /></div>

        {step === 0 && hasForm && (
          <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
            <h1 className="text-xl font-bold text-navy-900">{data.app_type_label} — Details</h1>
            <p className="mt-1 text-sm text-navy-500">Complete the form below. Drafts are saved automatically.</p>
            <div className="mt-6"><ApplicationForm appType={data.app_type} values={values} errors={formErrors} onChange={changeField} /></div>
            <div className="mt-8 flex flex-col-reverse items-stretch gap-3 border-t border-navy-100 pt-6 sm:flex-row sm:justify-between">
              <button onClick={saveDraftExplicit} disabled={savingForm} className="btn-outline">
                <Save className="h-4 w-4" /> Save as Draft
              </button>
              <button onClick={continueFromForm} disabled={savingForm} className="btn-navy px-8">
                {savingForm ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
              <h1 className="text-xl font-bold text-navy-900">Upload Documents</h1>
              <p className="mt-1 text-sm text-navy-500">{data.app_type_label} · Academic Year {fmtAY(data.academic_year)}</p>
              <div className="mt-5 space-y-3">
                {cl.items.filter((i) => i.code !== "additional_evidence").map((item, i) => (
                  <DocumentRow key={item.code} appId={appId} item={item} index={i} maxMb={maxMb}
                    onUploaded={onUploaded} onRemoved={refresh} />
                ))}
              </div>
              <p className="mt-4 text-xs text-navy-400">
                Accepted: JPG, JPEG, PNG, PDF · up to {maxMb} MB. Uploaded images are checked for readability (blur, resolution, contrast) on the server. These checks assess legibility, not authenticity.
              </p>
            </div>

            <aside className="space-y-4">
              <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
                <h2 className="text-base font-bold text-navy-900">Document Checklist</h2>
                <div className="mt-4 flex items-center gap-4">
                  <Ring percent={cl.percent} />
                  <div>
                    <p className="text-sm font-bold text-navy-900">{cl.completed} of {cl.total} documents</p>
                    <p className="text-xs text-navy-500">completed</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-2">
                  {cl.items.filter((i) => i.code !== "additional_evidence").map((i) => (
                    <li key={i.code} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 text-navy-700">
                        <span className={`h-2.5 w-2.5 rounded-full ${i.state === "uploaded" ? "bg-teal-500" : i.state === "quality_review" ? "bg-amber-500" : i.state === "rejected" ? "bg-red-500" : "border border-navy-300"}`} />
                        <span className="truncate">{i.title}</span>
                      </span>
                      <span className={`chip ${i.state === "uploaded" ? "bg-teal-100 text-teal-800" : i.state === "quality_review" ? "bg-amber-100 text-amber-800" : i.state === "rejected" ? "bg-red-100 text-red-700" : "bg-navy-100 text-navy-500"}`}>
                        {i.state === "uploaded" ? "Uploaded" : i.state === "quality_review" ? "Review" : i.state === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </li>
                  ))}
                </ul>
                {cl.has_blocking && <div className="mt-3"><Alert kind="error">Replace rejected documents before you can submit.</Alert></div>}
                <div className="mt-5 space-y-2">
                  {hasForm && <button onClick={() => setStep(0)} className="btn-ghost w-full"><ArrowLeft className="h-4 w-4" /> Back to form</button>}
                  <button onClick={() => setStep(2)} disabled={!cl.ready} className="btn-primary w-full">
                    Review & Submit <ArrowRight className="h-4 w-4" />
                  </button>
                  {!cl.ready && <p className="text-center text-xs text-navy-400">Upload all required documents to continue.</p>}
                </div>
              </div>
              <p className="px-2 text-[11px] text-navy-400">{cl.handbook_note}</p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <ReviewStep app={data} onBack={() => setStep(1)}
            onSubmitted={(submitted) => navigate(`/institution/application/${submitted.id}/success`)} />
        )}
      </PageShell>
      <Footer />
    </div>
  );
}
