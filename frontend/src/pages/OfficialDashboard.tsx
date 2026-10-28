import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Building2, CheckCircle2, ClipboardList, FileText, FolderCheck, Hourglass, ScanSearch, TriangleAlert } from "lucide-react";
import { OfficialNav } from "../components/OfficialNav";
import { Footer, PageShell } from "../components/layout";
import { Chip, LoadingPanel } from "../components/ui";
import { api } from "../lib/api";
import { fmtDate, fmtDateTime, statusTone } from "../lib/format";
import { useMe } from "../lib/session";
import type { ApplicationSummary } from "../lib/types";

interface DashData {
  period: { from: string; to: string; basis: string };
  role: string;
  user: string;
  totals: Record<string, number>;
  buckets: { key: string; label: string; count: number }[];
  by_status: { status: string; label: string; count: number }[];
  recent: ApplicationSummary[];
}

const DONUT_COLORS: Record<string, string> = {
  pending_review: "#3b64f5",
  under_verification: "#608afa",
  needs_clarification: "#f59e0b",
  approved: "#12b783",
  escalated: "#ef4444",
};

const STAT_CARDS: { key: string; label: string; icon: typeof Building2; tone: string }[] = [
  { key: "institutions", label: "Institutions", icon: Building2, tone: "bg-navy-100 text-navy-600" },
  { key: "applications", label: "Applications", icon: ClipboardList, tone: "bg-brand-100 text-brand-600" },
  { key: "documents", label: "Documents", icon: FileText, tone: "bg-navy-100 text-navy-600" },
  { key: "pending_review", label: "Pending Review", icon: Hourglass, tone: "bg-amber-100 text-amber-600" },
  { key: "under_verification", label: "Under Verification", icon: ScanSearch, tone: "bg-brand-100 text-brand-600" },
  { key: "approved", label: "Approved", icon: FolderCheck, tone: "bg-teal-100 text-teal-600" },
];

export default function OfficialDashboard() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data, isLoading } = useQuery<DashData>({ queryKey: ["official", "dashboard"], queryFn: () => api.get("/api/official/dashboard") });

  const donut = data?.buckets.filter((b) => b.count > 0) || [];

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <OfficialNav session={me?.official} />
      <PageShell>
        {isLoading || !data ? <LoadingPanel /> : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-navy-900">Welcome, {data.user}</h1>
                <p className="mt-0.5 text-sm text-navy-500">Overview of applications and verification activity.</p>
              </div>
              <Chip tone="bg-white text-navy-600 ring-1 ring-navy-100">
                Reporting period: {fmtDate(data.period.from)} – {fmtDate(data.period.to)} (by submission date)
              </Chip>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {STAT_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.key} className="rounded-2xl border border-navy-100 bg-white p-4 shadow-card">
                    <span className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.tone}`}><Icon className="h-4.5 w-4.5" /></span>
                    <p className="text-2xl font-extrabold text-navy-900">{data.totals[c.key]}</p>
                    <p className="text-xs font-medium text-navy-500">{c.label}</p>
                  </div>
                );
              })}
            </div>

            <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
              <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
                <h2 className="text-base font-bold text-navy-900">Application Status</h2>
                <p className="text-xs text-navy-400">Mutually exclusive buckets · total {data.totals.applications}</p>
                <div className="relative mt-2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none" isAnimationActive={false}>
                        {donut.map((b) => <Cell key={b.key} fill={DONUT_COLORS[b.key]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n) => [`${v}`, n]} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
                    <p className="text-3xl font-extrabold text-navy-900">{data.totals.applications}</p>
                    <p className="text-xs text-navy-400">Applications</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-base font-bold text-navy-900">Recent Activity</h2>
                  <button onClick={() => navigate("/official/applications")} className="text-sm font-semibold text-brand-600 hover:text-brand-700">View all applications</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-navy-100 text-xs uppercase tracking-wide text-navy-400">
                        <th className="pb-2.5 pr-4 font-semibold">Application</th>
                        <th className="pb-2.5 pr-4 font-semibold">Institution</th>
                        <th className="pb-2.5 pr-4 font-semibold">Updated</th>
                        <th className="pb-2.5 pr-4 font-semibold">Status</th>
                        <th className="pb-2.5 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((a) => (
                        <tr key={a.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50">
                          <td className="py-2.5 pr-4 font-semibold text-navy-900">{a.application_number}</td>
                          <td className="py-2.5 pr-4 text-navy-600">{a.institution.name}</td>
                          <td className="py-2.5 pr-4 text-navy-400">{fmtDateTime(a.status_changed_at).replace(" IST", "")}</td>
                          <td className="py-2.5 pr-4"><Chip tone={statusTone(a.status)}>{a.status_label}</Chip></td>
                          <td className="py-2.5">
                            <button onClick={() => navigate(`/official/case/${a.id}`)} className="btn-outline px-3 py-1 text-xs">Review</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {me?.official?.user.role === "scrutiny_member" && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-navy-400"><TriangleAlert className="h-3.5 w-3.5 text-amber-500" /> Approvals are recorded by Reviewers; your role can request clarification and flag for verification.</p>
                )}
                {me?.official?.user.role === "administrator" && (
                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-navy-400"><CheckCircle2 className="h-3.5 w-3.5 text-teal-500" /> Administrators can export the audit log and reset the demo scenario.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}
