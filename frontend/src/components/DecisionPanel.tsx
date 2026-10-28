import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileCheck2, Loader2, MapPinned, MessagesSquare, Send, TriangleAlert } from "lucide-react";
import { Alert, useToast } from "./ui";
import { api, ApiError } from "../lib/api";
import type { AllowedAction, CaseDetail } from "../lib/types";

const ACTION_META: Record<string, { icon: typeof MessagesSquare; tone: string; desc: string }> = {
  request_clarification: { icon: MessagesSquare, tone: "brand", desc: "Ask the institution for additional information or documents." },
  mark_field_verification: { icon: MapPinned, tone: "purple", desc: "Flag for physical verification by the concerned authority." },
  forward_review: { icon: Send, tone: "amber", desc: "Send to final review for a decision." },
  record_approval: { icon: FileCheck2, tone: "teal", desc: "Record a demonstration approval decision after reviewing the evidence." },
  record_escalation: { icon: TriangleAlert, tone: "red", desc: "Escalate for suspension / escalation review. No automatic suspension is applied." },
};
const TONE: Record<string, { ring: string; icon: string; chip: string }> = {
  brand: { ring: "border-brand-400 bg-brand-50/60 ring-brand-200", icon: "bg-brand-100 text-brand-600", chip: "text-brand-700" },
  purple: { ring: "border-purple-400 bg-purple-50/60 ring-purple-200", icon: "bg-purple-100 text-purple-600", chip: "text-purple-700" },
  amber: { ring: "border-amber-400 bg-amber-50/60 ring-amber-200", icon: "bg-amber-100 text-amber-600", chip: "text-amber-700" },
  teal: { ring: "border-teal-400 bg-teal-50/60 ring-teal-200", icon: "bg-teal-100 text-teal-600", chip: "text-teal-700" },
  red: { ring: "border-red-400 bg-red-50/60 ring-red-200", icon: "bg-red-100 text-red-600", chip: "text-red-700" },
};

export function DecisionPanel({ data }: { data: CaseDetail }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [deadline, setDeadline] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const enabledActions = data.allowed_actions;
  const anyEnabled = enabledActions.some((a) => a.enabled);
  const current = enabledActions.find((a) => a.action === selected);

  async function submit() {
    if (!selected || !current?.enabled) return;
    if (comment.trim().length < 10) { toast({ kind: "error", title: "Add a comment of at least 10 characters." }); return; }
    if (selected === "record_approval" && !confirm) { toast({ kind: "error", title: "Confirm the demonstration decision." }); return; }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { action: selected, comment };
      if (selected === "request_clarification" && deadline) body.deadline = deadline;
      if (selected === "record_approval") body.confirm = true;
      const res = await api.post<{ message: string }>(`/api/official/applications/${data.id}/actions`, body);
      await qc.invalidateQueries({ queryKey: ["official", "case", data.id] });
      await qc.invalidateQueries({ queryKey: ["official", "dashboard"] });
      await qc.invalidateQueries({ queryKey: ["official", "applications"] });
      toast({ kind: "success", title: res.message });
      setSelected(null); setComment(""); setDeadline(""); setConfirm(false);
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Could not record action" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-navy-100 bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold text-navy-900">Take Action</h2>
      <p className="mt-0.5 text-sm text-navy-500">Record your review decision and add comments for the institution.</p>

      {!anyEnabled && (
        <div className="mt-4"><Alert kind="info" title="No actions available in the current state">
          This case is <b>{data.status_label}</b>. {data.status === "approved" ? "A decision has already been recorded." : "Your role cannot act on it at this stage."}
        </Alert></div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {enabledActions.map((a: AllowedAction) => {
          const meta = ACTION_META[a.action];
          const Icon = meta.icon;
          const tone = TONE[meta.tone];
          const active = selected === a.action;
          return (
            <button key={a.action} disabled={!a.enabled} onClick={() => setSelected(a.action)}
              className={`relative rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? `${tone.ring} ring-1` : "border-navy-100 bg-white hover:border-navy-200"}`}
              title={a.reason || undefined} aria-pressed={active}>
              {active && <span className="absolute right-3 top-3 text-brand-600"><CheckCircle2 className="h-5 w-5" /></span>}
              <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-lg ${tone.icon}`}><Icon className="h-4.5 w-4.5" /></span>
              <p className="text-sm font-bold text-navy-900">{a.label}</p>
              <p className="mt-0.5 text-xs text-navy-500">{meta.desc}</p>
              {!a.enabled && a.reason && <p className="mt-1 text-[11px] font-medium text-navy-400">{a.reason}</p>}
            </button>
          );
        })}
      </div>

      {current?.enabled && (
        <div className="mt-5 space-y-3 rounded-2xl border border-navy-100 bg-navy-50/50 p-4">
          <div>
            <label htmlFor="comment" className="field-label">Comments <span className="text-red-500">*</span></label>
            <textarea id="comment" className="field-input min-h-[88px]" maxLength={500} value={comment}
              onChange={(e) => setComment(e.target.value)} placeholder="Enter your observations or clarification points for the institution…" />
            <p className="mt-1 text-right text-xs text-navy-400">{comment.length}/500</p>
          </div>
          {selected === "request_clarification" && (
            <div>
              <label htmlFor="deadline" className="field-label">Response Deadline (optional)</label>
              <input id="deadline" type="date" className="field-input w-56" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          )}
          {selected === "record_approval" && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-navy-600">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-navy-300 text-teal-600 focus:ring-teal-400" />
              I confirm this is a demonstration decision based on my review of the submitted evidence.
            </label>
          )}
          <button onClick={submit} disabled={busy} className="btn-navy w-full sm:w-auto">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</> : <>Submit Action <Send className="h-4 w-4" /></>}
          </button>
        </div>
      )}
    </div>
  );
}
