import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, FileCheck2, GraduationCap, Loader2, Settings2, UsersRound } from "lucide-react";
import { AccountMenu, DemoBadge, Footer, PageShell, TopBar } from "../components/layout";
import { Stepper } from "../components/Stepper";
import { LoadingPanel, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { fmtAY } from "../lib/format";
import type { AppTypeCode, ApplicationDetail } from "../lib/types";

interface TypesResponse {
  types: { code: AppTypeCode; title: string; short: string; description: string; has_form: boolean }[];
  academic_years: string[];
  default_academic_year: string;
}

const ICONS: Record<AppTypeCode, typeof FileCheck2> = {
  eoa: FileCheck2, intake: UsersRound, new_course: GraduationCap, other: Settings2,
};
const ACCENT: Record<AppTypeCode, string> = {
  eoa: "bg-brand-100 text-brand-600",
  intake: "bg-purple-100 text-purple-600",
  new_course: "bg-teal-100 text-teal-600",
  other: "bg-amber-100 text-amber-600",
};

export default function NewApplication() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useQuery<TypesResponse>({ queryKey: ["application-types"], queryFn: () => api.get("/api/application-types") });
  const [selected, setSelected] = useState<AppTypeCode | null>(null);
  const [year, setYear] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const academicYear = year || data?.default_academic_year || "";

  async function proceed() {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.post<{ application: ApplicationDetail; resumed: boolean }>("/api/applications", {
        app_type: selected, academic_year: academicYear,
      });
      if (res.resumed) toast({ kind: "info", title: "Resumed your existing draft" });
      navigate(`/institution/application/${res.application.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "duplicate_eoa" && err.details?.application_id) {
          toast({ kind: "info", title: err.message });
          navigate(`/institution/track/${err.details.application_id}`);
        } else toast({ kind: "error", title: err.message });
      } else toast({ kind: "error", title: "Could not start the application." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <TopBar right={<><DemoBadge /><AccountMenu portal="institution" title="New Application" subtitle="Institution" /></>} />
      <PageShell>
        <button onClick={() => navigate("/institution")} className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </button>

        {isLoading || !data ? <LoadingPanel /> : (
          <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card sm:p-8">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-extrabold text-navy-900">Select Application Purpose</h1>
              <p className="mt-1 text-sm text-navy-500">Choose the type of approval or institutional change you wish to apply for.</p>
            </div>
            <div className="mb-8"><Stepper current={0} /></div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.types.map((t, i) => {
                const Icon = ICONS[t.code];
                const active = selected === t.code;
                return (
                  <motion.button
                    key={t.code}
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    onClick={() => setSelected(t.code)} whileHover={{ y: -4 }}
                    className={`relative flex flex-col rounded-2xl border-2 p-5 text-left transition ${active ? "border-brand-500 bg-brand-50/60 shadow-card" : "border-navy-100 bg-white hover:border-navy-200"}`}
                    aria-pressed={active}
                  >
                    {active && (
                      <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${ACCENT[t.code]}`}>
                      <Icon className="h-7 w-7" />
                    </span>
                    <h3 className="text-base font-bold leading-snug text-navy-900">{t.title}</h3>
                    <p className="mt-2 text-xs text-navy-500">{t.description}</p>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-col items-stretch gap-4 border-t border-navy-100 pt-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <label htmlFor="ay" className="field-label">Academic Year</label>
                <select id="ay" className="field-input w-56" value={academicYear} onChange={(e) => setYear(e.target.value)}>
                  {data.academic_years.map((y) => <option key={y} value={y}>{fmtAY(y)}</option>)}
                </select>
              </div>
              <button onClick={proceed} disabled={!selected || busy} className="btn-navy px-8 py-3 text-base">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}
