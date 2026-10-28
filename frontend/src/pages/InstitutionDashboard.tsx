import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, CalendarCheck2, CalendarClock, CheckCircle2, FilePlus2, Info, MapPin, ArrowRight, Building2 } from "lucide-react";
import { AccountMenu, DemoBadge, Footer, PageShell, TopBar } from "../components/layout";
import { Chip, EmptyState, LoadingPanel } from "../components/ui";
import { api } from "../lib/api";
import { fmtAY, fmtDate, statusTone } from "../lib/format";
import type { ApplicationSummary, Institution } from "../lib/types";

interface DashboardData {
  institution: Institution;
  next_cycle: { academic_year: string; label: string; schedule: string };
  counts: { total: number; drafts: number; action_required: number };
  applications: ApplicationSummary[];
}

export default function InstitutionDashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["institution", "dashboard"],
    queryFn: () => api.get<DashboardData>("/api/institution/dashboard"),
  });

  const inst = data?.institution;
  const ref = inst?.reference_approval;

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <TopBar right={<>
        <DemoBadge />
        {inst && <AccountMenu portal="institution" title={inst.short_name || inst.name} subtitle="Institution" role={inst.name} />}
      </>} />

      <PageShell>
        {isLoading || !inst ? <LoadingPanel label="Loading dashboard…" /> : (
          <div className="space-y-6">
            {/* Welcome banner */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-3xl border border-navy-100 bg-white shadow-card">
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-400">Welcome back,</p>
                  <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">{inst.name}</h1>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Chip tone="bg-teal-100 text-teal-800"><CheckCircle2 className="h-3.5 w-3.5" /> {inst.is_reference_profile ? "Reference-Profile Institution" : "Institution"}</Chip>
                    <Chip tone="bg-navy-100 text-navy-700">Institution ID : {inst.permanent_id}</Chip>
                    <Chip tone="bg-navy-100 text-navy-700"><MapPin className="h-3.5 w-3.5" /> {inst.city}</Chip>
                    <Chip tone="bg-navy-100 text-navy-700">Type: {inst.institution_type}</Chip>
                  </div>
                  <p className="mt-3 max-w-xl text-sm text-navy-500">
                    Apply for EoA, new courses, new seats and manage your applications with NeyamNetra — readability checks and transparent review.
                  </p>
                  {inst.affiliating_university && (
                    <p className="mt-1 text-xs text-navy-400">Affiliating University: {inst.affiliating_university}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center justify-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-navy-800 text-white shadow-pop sm:h-28 sm:w-28">
                    <Building2 className="h-12 w-12" strokeWidth={1.5} />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Approval + actions */}
            <div className="grid gap-5 lg:grid-cols-3">
              <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card lg:col-span-2">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-600"><CalendarCheck2 className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-navy-500">Last Approved EoA Year</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xl font-extrabold text-navy-900">
                        {ref ? fmtAY(ref.academic_year) : "—"}
                        {ref && <Chip tone="bg-teal-100 text-teal-800">Approved</Chip>}
                      </p>
                      {ref && <p className="mt-1 text-xs text-navy-400">Approval date: {fmtDate(ref.approval_date)}</p>}
                      {ref?.record_kind === "published_reference" && (
                        <p className="mt-1 text-[11px] text-navy-400">Published reference{ref.source_url ? "" : ""} — verify before external use.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600"><CalendarClock className="h-5 w-5" /></span>
                    <div>
                      <p className="text-sm font-semibold text-navy-500">Next Application Cycle</p>
                      <p className="mt-0.5 text-xl font-extrabold text-navy-900">{fmtAY(data.next_cycle.academic_year)}</p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Info className="h-3.5 w-3.5" /> {data.next_cycle.schedule}
                      </p>
                      <p className="mt-0.5 text-[11px] text-navy-400">{data.next_cycle.label}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={() => navigate("/institution/new")}
                  className="group flex items-center justify-between rounded-2xl bg-brand-600 px-6 py-5 text-left text-white shadow-card transition hover:bg-brand-700">
                  <span className="flex items-center gap-3">
                    <FilePlus2 className="h-6 w-6" />
                    <span className="text-lg font-bold">New Application</span>
                  </span>
                  <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
                </button>
                <button onClick={() => navigate("/institution/track")}
                  className="group flex items-center justify-between rounded-2xl border border-navy-200 bg-white px-6 py-5 text-left text-navy-900 shadow-card transition hover:bg-navy-50">
                  <span className="flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-brand-600" />
                    <span className="text-lg font-bold">Track Application</span>
                  </span>
                  <ArrowRight className="h-5 w-5 text-navy-400 transition group-hover:translate-x-1" />
                </button>
              </div>
            </div>

            {/* Recent applications */}
            <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy-900">Recent Applications</h2>
                <button onClick={() => navigate("/institution/track")} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
                  View all <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              {data.applications.length === 0 ? (
                <EmptyState icon={<FilePlus2 className="h-7 w-7" />} title="No applications yet"
                  desc="Start a new application to apply for EoA, intake changes or a new programme."
                  action={<button onClick={() => navigate("/institution/new")} className="btn-primary mt-2">New Application</button>} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 text-xs uppercase tracking-wide text-navy-400">
                        <th className="pb-3 pr-4 font-semibold">Application ID</th>
                        <th className="pb-3 pr-4 font-semibold">Type</th>
                        <th className="pb-3 pr-4 font-semibold">Academic Year</th>
                        <th className="pb-3 pr-4 font-semibold">Submitted</th>
                        <th className="pb-3 pr-4 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.applications.map((a) => (
                        <tr key={a.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50">
                          <td className="py-3 pr-4 font-semibold text-navy-900">{a.application_number || <span className="text-navy-400">Draft</span>}</td>
                          <td className="py-3 pr-4 text-navy-700">{a.app_type_label}</td>
                          <td className="py-3 pr-4 text-navy-700">{fmtAY(a.academic_year)}</td>
                          <td className="py-3 pr-4 text-navy-500">{a.submitted_at ? fmtDate(a.submitted_at) : "—"}</td>
                          <td className="py-3 pr-4"><Chip tone={statusTone(a.status)}>{a.status_label}</Chip></td>
                          <td className="py-3">
                            <button
                              onClick={() => navigate(a.status === "draft" ? `/institution/application/${a.id}` : `/institution/track/${a.id}`)}
                              className="btn-outline px-3.5 py-1.5 text-xs">
                              {a.status === "draft" ? "Resume" : "View"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}
