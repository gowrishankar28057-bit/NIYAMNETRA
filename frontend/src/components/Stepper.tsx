import { Check } from "lucide-react";
import clsx from "clsx";

const STEPS = ["Select Purpose", "Upload Documents", "Review & Submit"];

export function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-4">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className={clsx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition",
                done && "bg-teal-600 text-white",
                active && "bg-brand-600 text-white ring-4 ring-brand-100",
                !done && !active && "border-2 border-navy-200 bg-white text-navy-400",
              )}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={clsx("hidden text-sm font-semibold sm:block", active ? "text-brand-700" : done ? "text-teal-700" : "text-navy-400")}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className={clsx("h-0.5 w-8 rounded sm:w-16", done ? "bg-teal-400" : "bg-navy-200")} />}
          </li>
        );
      })}
    </ol>
  );
}
