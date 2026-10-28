import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { fileUrl, previewUrl } from "../lib/api";
import type { AppDocument } from "../lib/types";

export function DocumentViewer({ doc }: { doc: AppDocument | null }) {
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const isPdf = doc?.content_type === "application/pdf";
  const pages = doc?.page_count || 1;

  if (!doc) {
    return <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-navy-200 text-sm text-navy-400">Select a document to preview</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 rounded-t-xl border border-navy-100 bg-navy-50 px-3 py-2">
        <div className="flex items-center gap-1">
          {isPdf && (
            <>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost px-2 py-1 text-xs disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 text-xs font-semibold text-navy-600">{page} / {pages}</span>
              <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages} className="btn-ghost px-2 py-1 text-xs disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setScale((s) => Math.max(0.6, s - 0.2))} className="btn-ghost px-2 py-1 text-xs" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
          <span className="w-10 text-center text-xs font-semibold text-navy-600">{Math.round(scale * 71)}%</span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.2))} className="btn-ghost px-2 py-1 text-xs" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
          <a href={fileUrl(doc.id)} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs" aria-label="Open in new tab"><ExternalLink className="h-4 w-4" /></a>
          <a href={fileUrl(doc.id, { download: true })} className="btn-ghost px-2 py-1 text-xs" aria-label="Download"><Download className="h-4 w-4" /></a>
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-b-xl border border-t-0 border-navy-100 bg-navy-100/60 p-3">
        <img
          key={`${doc.id}-${page}`}
          src={isPdf ? previewUrl(doc.id, page, Math.min(scale * 1.4, 3)) : fileUrl(doc.id)}
          alt={`${doc.original_filename}${isPdf ? ` page ${page}` : ""}`}
          className="mx-auto rounded bg-white shadow-card"
          style={{ width: `${Math.round(scale * 100)}%`, maxWidth: isPdf ? "900px" : undefined }}
        />
      </div>
    </div>
  );
}
