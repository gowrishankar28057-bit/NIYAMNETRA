import { AlertTriangle, Check, Circle, Clock } from "lucide-react";
import clsx from "clsx";
import { fmtDateTime } from "../lib/format";
import type { Stage } from "../lib/types";

export function Timeline({ stages }: { stages: Stage[] }) {
  return (
    <ol className="relative space-y-0">
      {stages.map((s, i) => {
        const last = i === stages.length - 1;
        const tone =
          s.state === "completed" ? "bg-teal-500 text-white border-teal-500"
          : s.state === "current" ? "bg-brand-600 text-white border-brand-600 ring-4 ring-brand-100"
          : s.state === "attention" ? "bg-amber-500 text-white border-amber-500 ring-4 ring-amber-100"
          : "bg-white text-navy-300 border-navy-200";
        const Icon = s.state === "completed" ? Check : s.state === "attention" ? AlertTriangle : s.state === "current" ? Clock : Circle;
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span className={clsx("absolute left-[15px] top-8 h-full w-0.5", s.state === "completed" ? "bg-teal-300" : "bg-navy-200")} />}
            <span className={clsx("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2", tone)}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={clsx("text-sm font-bold", s.state === "upcoming" ? "text-navy-400" : "text-navy-900")}>{s.title}</p>
                {s.at && <span className="text-xs text-navy-400">{fmtDateTime(s.at)}</span>}
              </div>
              {s.note && <p className={clsx("mt-0.5 text-xs", s.state === "attention" ? "font-semibold text-amber-700" : "text-navy-500")}>{s.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
