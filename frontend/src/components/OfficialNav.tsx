import { NavLink } from "react-router-dom";
import { ClipboardList, LayoutDashboard, ScrollText } from "lucide-react";
import clsx from "clsx";
import { AccountMenu, BrandMark, DemoBadge } from "./layout";
import type { Session } from "../lib/types";

const TABS = [
  { to: "/official", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/official/applications", label: "Applications", icon: ClipboardList, end: false },
  { to: "/official/audit", label: "Audit Trail", icon: ScrollText, end: false },
];

export function OfficialNav({ session }: { session: Session | null | undefined }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-8 sm:h-9" />
            <span className="hidden rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700 md:inline">AICTE Official Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <DemoBadge />
            {session && <AccountMenu portal="official" title={session.user.display_name} subtitle={session.user.role_label} role={session.user.role_label} />}
          </div>
        </div>
        <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Official sections">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <NavLink key={t.to} to={t.to} end={t.end}
                className={({ isActive }) => clsx("tab whitespace-nowrap", isActive && "tab-active")}>
                <Icon className="h-4 w-4" /> {t.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
