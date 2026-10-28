import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import clsx from "clsx";

/* ---- Spinner ---- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className)} aria-hidden />;
}

export function LoadingPanel({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-navy-500" role="status">
      <Spinner className="h-7 w-7 text-brand-500" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

/* ---- Toasts ---- */
type Toast = { id: number; kind: "success" | "error" | "info"; title: string; desc?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_ICON = { success: CheckCircle2, error: XCircle, info: Info };
const TOAST_TONE = {
  success: "border-teal-200 bg-teal-50 text-teal-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-brand-200 bg-brand-50 text-brand-900",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2.5">
          <AnimatePresence>
            {toasts.map((t) => {
              const Icon = TOAST_ICON[t.kind];
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24 }}
                  className={clsx("pointer-events-auto flex items-start gap-3 rounded-xl border p-3.5 shadow-pop", TOAST_TONE[t.kind])}
                  role="alert"
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{t.title}</p>
                    {t.desc && <p className="mt-0.5 text-xs opacity-90">{t.desc}</p>}
                  </div>
                  <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="opacity-60 hover:opacity-100">
                    <X className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ---- Chip ---- */
export function Chip({ tone, children, className }: { tone: string; children: ReactNode; className?: string }) {
  return <span className={clsx("chip", tone, className)}>{children}</span>;
}

/* ---- Modal / confirm dialog ---- */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-navy-950/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-pop outline-none"
          >
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-lg font-bold text-navy-900">{title}</h3>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-sm text-navy-700">{children}</div>
            {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ---- Empty state ---- */
export function EmptyState({ icon, title, desc, action }: { icon: ReactNode; title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-navy-200 bg-white/60 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-400">{icon}</div>
      <h3 className="text-base font-bold text-navy-800">{title}</h3>
      {desc && <p className="max-w-sm text-sm text-navy-500">{desc}</p>}
      {action}
    </div>
  );
}

/* ---- Inline alert ---- */
const ALERT_TONE = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-brand-200 bg-brand-50 text-brand-900",
  success: "border-teal-200 bg-teal-50 text-teal-900",
};
const ALERT_ICON = { warning: AlertTriangle, error: XCircle, info: Info, success: CheckCircle2 };
export function Alert({ kind, title, children }: { kind: keyof typeof ALERT_TONE; title?: string; children: ReactNode }) {
  const Icon = ALERT_ICON[kind];
  return (
    <div className={clsx("flex items-start gap-3 rounded-xl border p-3.5 text-sm", ALERT_TONE[kind])} role="note">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}

/* ---- Field (label + input + error) ---- */
export function Field({ label, error, hint, required, children }: {
  label: string; error?: string; hint?: string; required?: boolean; children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children(id)}
      {hint && !error && <p className="mt-1 text-xs text-navy-400">{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function SimulatedBadge() {
  return (
    <Chip tone="bg-amber-100 text-amber-800 ring-1 ring-amber-200">
      <Info className="h-3.5 w-3.5" /> Simulated Analysis
    </Chip>
  );
}
