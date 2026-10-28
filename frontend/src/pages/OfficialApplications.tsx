import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { OfficialNav } from "../components/OfficialNav";
import { Footer, PageShell } from "../components/layout";
import { Chip, LoadingPanel } from "../components/ui";
import { api } from "../lib/api";
import { fmtAY, fmtDate, statusTone } from "../lib/format";
import { useMe } from "../lib/session";
import type { ApplicationSummary, Pagination } from "../lib/types";

interface ListData {
  applications: ApplicationSummary[];
  pagination: Pagination;
  statuses: { value: string; label: string }[];
  types: { value: string; label: string }[];
}

export default function OfficialApplications() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);

  function onSearch(v: string) {
    setSearch(v);
    setPage(1);
    window.clearTimeout((onSearch as unknown as { t?: number }).t);
    (onSearch as unknown as { t?: number }).t = window.setTimeout(() => setDebounced(v), 300);
  }

  const params = new URLSearchParams({ page: String(page), page_size: "8", sort });
  if (debounced) params.set("search", debounced);
  if (type) params.set("type", type);
  if (status) params.set("status", status);

  const { data, isLoading } = useQuery<ListData>({
    queryKey: ["official", "applications", params.toString()],
    queryFn: () => api.get(`/api/official/applications?${params.toString()}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-navy-50 via-white to-navy-50" aria-hidden />
      <OfficialNav session={me?.official} />
      <PageShell>
        <div className="mb-5">
          <h1 className="text-2xl font-extrabold text-navy-900">Applications for Review</h1>
          <p className="mt-0.5 text-sm text-navy-500">Review submitted applications, analyse verification results and take action.</p>
        </div>

        <div className="rounded-3xl border border-navy-100 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
              <input className="field-input pl-10" placeholder="Search by institution name or application ID…"
                value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search applications" />
            </div>
            <select className="field-input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Filter by type">
              <option value="">All Types</option>
              {data?.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="field-input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
              <option value="">All Status</option>
              {data?.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="field-input w-auto" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} aria-label="Sort">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <div className="mt-4 overflow-x-auto">
            {isLoading && !data ? <LoadingPanel /> : (
              <table className="w-full min-w-[840px] text-left text-sm">
                <thead>
                  <tr className="border-b border-navy-100 text-xs uppercase tracking-wide text-navy-400">
                    <th className="pb-3 pr-4 font-semibold">Application ID</th>
                    <th className="pb-3 pr-4 font-semibold">Institution</th>
                    <th className="pb-3 pr-4 font-semibold">Type</th>
                    <th className="pb-3 pr-4 font-semibold">Academic Year</th>
                    <th className="pb-3 pr-4 font-semibold">Submitted</th>
                    <th className="pb-3 pr-4 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.applications.map((a) => (
                    <tr key={a.id} className="border-b border-navy-50 last:border-0 hover:bg-navy-50/50">
                      <td className="py-3 pr-4 font-semibold text-navy-900">{a.application_number}</td>
                      <td className="py-3 pr-4 text-navy-700">{a.institution.name}<span className="block text-xs text-navy-400">{a.institution.state}</span></td>
                      <td className="py-3 pr-4 text-navy-600">{a.app_type_label}</td>
                      <td className="py-3 pr-4 text-navy-600">{fmtAY(a.academic_year)}</td>
                      <td className="py-3 pr-4 text-navy-500">{fmtDate(a.submitted_at)}</td>
                      <td className="py-3 pr-4"><Chip tone={statusTone(a.status)}>{a.status_label}</Chip></td>
                      <td className="py-3">
                        <button onClick={() => navigate(`/official/case/${a.id}`)} className="btn-primary px-4 py-1.5 text-xs">
                          {a.status === "approved" ? "View" : "Review"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {data && data.applications.length === 0 && (
                    <tr><td colSpan={7} className="py-12 text-center text-sm text-navy-400">
                      <SlidersHorizontal className="mx-auto mb-2 h-6 w-6 text-navy-300" />
                      No applications match your filters.
                    </td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {data && data.pagination.total > 0 && (
            <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4 text-sm">
              <p className="text-navy-500">
                Showing {(data.pagination.page - 1) * data.pagination.page_size + 1}–
                {Math.min(data.pagination.page * data.pagination.page_size, data.pagination.total)} of {data.pagination.total}
              </p>
              <div className="flex items-center gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
                <span className="px-3 font-semibold text-navy-700">{data.pagination.page} / {data.pagination.pages}</span>
                <button disabled={page >= data.pagination.pages} onClick={() => setPage((p) => p + 1)} className="btn-ghost px-2 py-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      </PageShell>
      <Footer />
    </div>
  );
}
