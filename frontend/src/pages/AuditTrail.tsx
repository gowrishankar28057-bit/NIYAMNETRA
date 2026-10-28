import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { OfficialNav } from "../components/OfficialNav";
import { Footer, PageShell } from "../components/layout";
import { Chip, LoadingPanel } from "../components/ui";
import { api } from "../lib/api";
import { fmtDateTime, titleCase } from "../lib/format";
import { useMe } from "../lib/session";
import type { AuditEntry, Pagination } from "../lib/types";

interface AuditData {
  entries: AuditEntry[];
  pagination: Pagination;
  actions: string[];
  roles: { value: string; label: string }[];
  can_export: boolean;
}

const ROLE_TONE: Record<string, string> = {
  system: "bg-navy-100 text-navy-600",
  institution_admin: "bg-brand-100 text-brand-700",
  scrutiny_member: "bg-teal-100 text-teal-800",
  reviewer: "bg-teal-100 text-teal-800",
  administrator: "bg-amber-100 text-amber-800",
};

export default function AuditTrail() {
  const { data: me } = useMe();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [action, setAction] = useState("");
  const [role, setRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  function onSearch(v: string) {
    setSearch(v); setPage(1);
    window.clearTimeout((onSearch as unknown as { t?: number }).t);
    (onSearch as unknown as { t?: number }).t = window.setTimeout(() => setDebounced(v), 300);
  }

  const params = new URLSearchParams({ page: String(page), page_size: "12" });
  if (debounced) params.set("search", debounced);
  if (action) params.set("action", action);
  if (role) params.set("role", role);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data, isLoading } = useQuery<AuditData>({
    queryKey: ["official", "audit", params.toString()],
    queryFn: () => api.get(`/api/official/audit?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  function exportCsv() {
    const p = new URLSearchParams(params); p.delete("page"); p.delete("page_size");
    window.open(`/api/official/audit/export?${p.toString()}`, "_blank");
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <OfficialNav session={me?.official} />
      <PageShell>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-navy-900">Audit Trail</h1>
            <p className="mt-0.5 text-sm text-navy-500">Complete, append-only history of actions and system events for transparency and accountability.</p>
          </div>
          {data?.can_export && <button onClick={exportCsv} className="btn-outline"><Download className="h-4 w-4" /> Export Audit Log (CSV)</button>}
        </div>

        <div className="rounded-3xl border border-navy-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input className="field-input pl-10" placeholder="Search user, application ID, institution…" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search audit log" />
            </div>
            <select className="field-input w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} aria-label="Filter action">
              <option value="">All Actions</option>
              {data?.actions.map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
            </select>
            <select className="field-input w-auto" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Filter role">
              <option value="">All Roles</option>
              {data?.roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <input type="date" className="field-input w-auto" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="From date" />
            <input type="date" className="field-input w-auto" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="To date" />
          </div>

          <div className="mt-4 overflow-x-auto">
            {isLoading && !data ? <LoadingPanel /> : (
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead>
                  <tr className="border-b border-navy-100 text-xs uppercase tracking-wide text-navy-400">
                    <th className="pb-3 pr-4 font-semibold">Timestamp</th>
                    <th className="pb-3 pr-4 font-semibold">User</th>
                    <th className="pb-3 pr-4 font-semibold">Role</th>
                    <th className="pb-3 pr-4 font-semibold">Action</th>
                    <th className="pb-3 pr-4 font-semibold">Application</th>
                    <th className="pb-3 pr-4 font-semibold">Institution</th>
                    <th className="pb-3 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.entries.map((e) => (
                    <tr key={e.id} className="border-b border-navy-50 last:border-0 align-top hover:bg-navy-50/50">
                      <td className="py-3 pr-4 whitespace-nowrap text-navy-500">{fmtDateTime(e.created_at)}</td>
                      <td className="py-3 pr-4 font-medium text-navy-800">{e.user}</td>
                      <td className="py-3 pr-4"><Chip tone={ROLE_TONE[e.role] || "bg-navy-100 text-navy-600"}>{e.role_label}</Chip></td>
                      <td className="py-3 pr-4"><span className="font-semibold text-navy-900">{titleCase(e.action)}</span></td>
                      <td className="py-3 pr-4 text-navy-600">{e.application_number || "—"}</td>
                      <td className="py-3 pr-4 text-navy-600">{e.institution || "—"}</td>
                      <td className="py-3 text-navy-500">
                        <span className="line-clamp-2 max-w-[260px]">{e.details}</span>
                        {e.seeded && <span className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">seeded demo</span>}
                      </td>
                    </tr>
                  ))}
                  {data && data.entries.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-navy-400">No audit events match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {data && data.pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4 text-sm">
              <p className="text-navy-500">{data.pagination.total} events</p>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-40" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-3 font-semibold text-navy-700">{data.pagination.page} / {data.pagination.pages}</span>
                <button disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-40" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      </PageShell>
      <Footer />
    </div>
  );
}
