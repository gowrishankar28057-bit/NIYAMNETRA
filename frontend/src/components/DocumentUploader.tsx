import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, FileText, Loader2, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import clsx from "clsx";
import { Alert, Modal, useToast } from "./ui";
import { api, fileUrl, previewUrl, uploadFile, ApiError } from "../lib/api";
import { fmtBytes } from "../lib/format";
import type { AppDocument, ChecklistItem } from "../lib/types";

const STATE_META = {
  pending: { label: "Pending", cls: "bg-navy-100 text-navy-500" },
  uploaded: { label: "Uploaded", cls: "bg-teal-100 text-teal-800" },
  quality_review: { label: "Quality Review", cls: "bg-amber-100 text-amber-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700" },
} as const;

interface Props {
  appId: number;
  item: ChecklistItem;
  index: number;
  disabled?: boolean;
  onUploaded: (data: { document: AppDocument; checklist: unknown }) => void;
  onRemoved: (checklist: unknown) => void;
  maxMb: number;
}

export function DocumentRow({ appId, item, index, disabled, onUploaded, onRemoved, maxMb }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [status, setStatus] = useState<"idle" | "uploading" | "checking">("idle");
  const [preview, setPreview] = useState<AppDocument | null>(null);
  const doc = item.document;
  const meta = STATE_META[item.state];

  async function handleFile(file: File) {
    if (file.size > maxMb * 1024 * 1024) {
      toast({ kind: "error", title: "File too large", desc: `Maximum ${maxMb} MB.` });
      return;
    }
    setStatus("uploading");
    await new Promise((r) => setTimeout(r, 150));
    setStatus("checking");
    try {
      const data = await uploadFile(appId, item.code, file);
      onUploaded(data);
      const v = data.document.quality.verdict;
      if (v === "failed") toast({ kind: "error", title: "Document quality insufficient", desc: "Upload a clearer copy." });
      else if (v === "warning") toast({ kind: "info", title: "Uploaded — needs legibility review" });
      else toast({ kind: "success", title: `${item.title} uploaded` });
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Upload failed" });
    } finally {
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!doc) return;
    try {
      const data = await api_delete(doc.id);
      onRemoved(data.checklist);
      toast({ kind: "info", title: "Document removed" });
    } catch (err) {
      toast({ kind: "error", title: err instanceof ApiError ? err.message : "Could not remove" });
    }
  }

  const busy = status !== "idle";
  const failed = doc?.status === "quality_failed";

  return (
    <div className={clsx("rounded-2xl border p-4 transition", failed ? "border-red-200 bg-red-50/40" : "border-navy-100 bg-white")}>
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-sm font-bold text-navy-400">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="mt-0.5 hidden shrink-0 text-navy-300 sm:block"><FileText className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold text-navy-900">{item.title}</h4>
            <span className={clsx("chip", item.required ? "bg-red-50 text-red-600" : "bg-navy-100 text-navy-500")}>
              {item.required ? "Required" : "Optional"}
            </span>
            <span className={clsx("chip", meta.cls)}>{meta.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-navy-500">{item.description}</p>

          {doc && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-navy-500">
              <span className="font-semibold text-navy-700">{doc.original_filename}</span>
              <span>{fmtBytes(doc.size_bytes)}</span>
              {doc.page_count ? <span>{doc.page_count} page(s)</span> : null}
              {doc.is_synthetic_sample && <span className="chip bg-amber-100 text-amber-800">Synthetic sample</span>}
            </div>
          )}

          {doc && doc.quality.verdict === "failed" && (
            <div className="mt-2">
              <Alert kind="error" title="Document quality insufficient">
                <p>{doc.quality.message}</p>
                <ul className="mt-1 list-disc pl-4">
                  {doc.quality.reasons.filter((r) => r.severity === "fail").map((r, i) => <li key={i}>{r.message}</li>)}
                </ul>
              </Alert>
            </div>
          )}
          {doc && doc.quality.verdict === "warning" && (
            <div className="mt-2">
              <Alert kind="warning" title="Needs legibility review">
                <ul className="list-disc pl-4">{doc.quality.reasons.map((r, i) => <li key={i}>{r.message}</li>)}</ul>
              </Alert>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {!doc && !busy && (
            <button onClick={() => inputRef.current?.click()} disabled={disabled} className="btn-outline px-4 py-2 text-xs">
              <Upload className="h-4 w-4" /> Choose File
            </button>
          )}
          {busy && (
            <span className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
              <Loader2 className="h-4 w-4 animate-spin" /> {status === "uploading" ? "Uploading…" : "Checking quality…"}
            </span>
          )}
          {doc && !busy && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPreview(doc)} className="btn-ghost px-3 py-2 text-xs" aria-label="Preview"><Eye className="h-4 w-4" /></button>
              {!disabled && (
                <button onClick={() => inputRef.current?.click()} className="btn-ghost px-3 py-2 text-xs">
                  <RefreshCw className="h-4 w-4" /> {failed ? "Replace Document" : "Replace"}
                </button>
              )}
              {!disabled && (
                <button onClick={remove} className="rounded-xl border border-red-100 bg-white px-2.5 py-2 text-red-500 hover:bg-red-50" aria-label="Remove">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          {doc && !busy && !failed && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600">
              {doc.status === "accepted" ? <><CheckCircle2 className="h-3.5 w-3.5" /> Accepted</> : <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Review</>}
            </span>
          )}
          {failed && !busy && <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><XCircle className="h-3.5 w-3.5" /> Rejected</span>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" className="sr-only"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      <DocumentPreviewModal doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function api_delete(docId: number) {
  return api.del<{ checklist: unknown }>(`/api/documents/${docId}`);
}

export function DocumentPreviewModal({ doc, onClose }: { doc: AppDocument | null; onClose: () => void }) {
  return (
    <Modal open={!!doc} onClose={onClose} title={doc?.original_filename || "Preview"}>
      {doc && (
        <div className="space-y-3">
          <div className="max-h-[60vh] overflow-auto rounded-xl border border-navy-100 bg-navy-50 p-2">
            {doc.content_type === "application/pdf" ? (
              <img src={previewUrl(doc.id, 1, 1.6)} alt={`${doc.original_filename} page 1`} className="mx-auto w-full rounded" />
            ) : (
              <img src={fileUrl(doc.id)} alt={doc.original_filename} className="mx-auto max-h-[58vh] w-auto rounded" />
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-navy-500">
            <span>{fmtBytes(doc.size_bytes)} · {doc.content_type}</span>
            <a href={fileUrl(doc.id, { download: true })} className="font-semibold text-brand-600 hover:text-brand-700">Download original</a>
          </div>
        </div>
      )}
    </Modal>
  );
}
