import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BarChart3, Check, Download, LayoutDashboard } from "lucide-react";
import { AccountMenu, DemoBadge, Footer, PageShell, TopBar } from "../components/layout";
import { LoadingPanel } from "../components/ui";
import { api } from "../lib/api";
import { fmtAY, fmtDateTime } from "../lib/format";
import type { ApplicationDetail } from "../lib/types";

export default function SubmissionSuccess() {
  const { id } = useParams();
  const appId = Number(id);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery<ApplicationDetail>({ queryKey: ["application", appId], queryFn: () => api.get(`/api/applications/${appId}`) });

  function downloadAck() {
    window.open(`/api/applications/${appId}/acknowledgement.pdf`, "_blank");
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 -z-10 bg-gradient-to-b from-teal-50 via-white to-navy-50" aria-hidden />
      <TopBar right={<><DemoBadge /><AccountMenu portal="institution" title="Submitted" subtitle="Institution" /></>} />
      <PageShell>
        {isLoading || !data ? <LoadingPanel /> : (
          <div className="mx-auto max-w-2xl">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-3xl border border-teal-100 bg-white shadow-card">
              <div className="flex flex-col items-center bg-gradient-to-b from-teal-50 to-white px-6 py-10 text-center">
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.1 }}
                  className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-teal-500 text-white shadow-pop">
                  <motion.span initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}>
                    <Check className="h-10 w-10" strokeWidth={3} />
                  </motion.span>
                </motion.span>
                <h1 className="text-2xl font-extrabold text-navy-900">Application Submitted Successfully!</h1>
                <p className="mt-2 text-sm text-navy-500">Your application has been recorded and is now visible to AICTE officials for review.</p>
                <div className="mt-4 rounded-xl bg-navy-900 px-5 py-2.5 text-center">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-navy-300">Application ID</p>
                  <p className="text-xl font-extrabold tracking-wide text-white">{data.application_number}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-px bg-navy-100 sm:grid-cols-4">
                <Cell label="Type" value={data.app_type_label} />
                <Cell label="Academic Year" value={fmtAY(data.academic_year)} />
                <Cell label="Documents" value={String(data.documents.length)} />
                <Cell label="Status" value={data.status_label} />
              </dl>
              <div className="bg-white px-6 py-4 text-center">
                <p className="text-xs text-navy-500">Submitted on {fmtDateTime(data.submitted_at)}</p>
              </div>

              <div className="grid gap-3 border-t border-navy-100 p-6 sm:grid-cols-3">
                <button onClick={() => navigate(`/institution/track/${appId}`)} className="btn-primary">
                  <BarChart3 className="h-4 w-4" /> Track Application
                </button>
                <button onClick={() => navigate("/institution")} className="btn-ghost">
                  <LayoutDashboard className="h-4 w-4" /> Go to Dashboard
                </button>
                <button onClick={downloadAck} className="btn-outline">
                  <Download className="h-4 w-4" /> Acknowledgement
                </button>
              </div>
            </motion.div>
            <p className="mt-4 text-center text-xs text-navy-400">
              The acknowledgement is a demonstration PDF generated from your stored application details — not an official AICTE document.
            </p>
          </div>
        )}
      </PageShell>
      <Footer />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3 text-center">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-navy-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-navy-900">{value}</dd>
    </div>
  );
}
