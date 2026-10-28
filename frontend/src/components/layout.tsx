import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

export function Background({ dim = false }: { dim?: boolean }) {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <img
        src="/images/aicte-building.jpg"
        alt=""
        className="h-full w-full object-cover"
        style={{ filter: dim ? "blur(3px)" : "blur(1.5px)" }}
      />
      <div className={dim ? "absolute inset-0 bg-gradient-to-b from-navy-50/88 via-navy-100/85 to-navy-200/90" : "absolute inset-0 bg-gradient-to-b from-navy-950/35 via-navy-900/30 to-navy-950/45"} />
    </div>
  );
}

export function BrandMark({ className = "h-9", withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return withWordmark ? (
    <img src="/brand/neyamnetra-logo.svg" alt="NeyamNetra" className={className} />
  ) : (
    <img src="/brand/neyamnetra-mark.svg" alt="NeyamNetra" className={className} />
  );
}

export function Footer({ light = false }: { light?: boolean }) {
  return (
    <footer className={`mt-auto w-full py-5 text-center text-xs ${light ? "text-white/80" : "text-navy-500"}`}>
      <p className="font-medium">SIH 2026 Prototype • NeyamNetra by Neural Nexus • Not an official AICTE service</p>
    </footer>
  );
}

export function AccountMenu({
  portal, title, subtitle, role,
}: { portal: "institution" | "official"; title: string; subtitle?: string; role?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function logout() {
    try {
      await api.post("/api/auth/logout", { portal });
    } finally {
      // Hard navigation to the landing page: clears all client state cleanly and
      // avoids a guarded-route redirect racing the SPA transition on sign-out.
      window.location.assign("/");
    }
  }

  const Icon = portal === "institution" ? Building2 : ShieldCheck;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl border border-white/60 bg-white/85 px-3 py-2 text-left shadow-card backdrop-blur transition hover:bg-white"
        aria-haspopup="menu" aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-800 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <span className="hidden sm:block">
          {subtitle && <span className="block text-[11px] font-medium leading-tight text-navy-400">{subtitle}</span>}
          <span className="block max-w-[11rem] truncate text-sm font-bold leading-tight text-navy-900">{title}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-navy-400" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-navy-100 bg-white shadow-pop"
            role="menu"
          >
            <div className="border-b border-navy-50 px-4 py-3">
              <p className="text-sm font-bold text-navy-900">{title}</p>
              {role && <p className="text-xs text-navy-500">{role}</p>}
            </div>
            <button onClick={logout} role="menuitem" className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function TopBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/" aria-label="NeyamNetra home"><BrandMark className="h-8 sm:h-9" /></Link>
          {children}
        </div>
        <div className="flex items-center gap-3">{right}</div>
      </div>
    </header>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>;
}

export function DemoBadge() {
  return (
    <span className="hidden items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200 md:inline-flex">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" /> Demo Access
    </span>
  );
}
