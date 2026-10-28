import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import "./index.css";
import { ToastProvider } from "./components/ui";
import { useMe } from "./lib/session";
import type { ReactNode } from "react";

import Landing from "./pages/Landing";
import InstitutionLogin from "./pages/InstitutionLogin";
import OfficialLogin from "./pages/OfficialLogin";
import InstitutionDashboard from "./pages/InstitutionDashboard";
import NewApplication from "./pages/NewApplication";
import ApplicationWizard from "./pages/ApplicationWizard";
import SubmissionSuccess from "./pages/SubmissionSuccess";
import TrackApplication from "./pages/TrackApplication";
import OfficialDashboard from "./pages/OfficialDashboard";
import OfficialApplications from "./pages/OfficialApplications";
import CaseReview from "./pages/CaseReview";
import AuditTrail from "./pages/AuditTrail";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Guard({ portal, children }: { portal: "institution" | "official"; children: ReactNode }) {
  const { data, isLoading } = useMe();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  const session = portal === "institution" ? data?.institution : data?.official;
  if (!session) return <Navigate to={portal === "institution" ? "/login/institution" : "/login/official"} replace />;
  return <>{children}</>;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="flex min-h-screen flex-col"
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname.split("/").slice(0, 3).join("/")}>
        <Route path="/" element={<Page><Landing /></Page>} />
        <Route path="/login/institution" element={<Page><InstitutionLogin /></Page>} />
        <Route path="/login/official" element={<Page><OfficialLogin /></Page>} />

        <Route path="/institution" element={<Guard portal="institution"><Page><InstitutionDashboard /></Page></Guard>} />
        <Route path="/institution/new" element={<Guard portal="institution"><Page><NewApplication /></Page></Guard>} />
        <Route path="/institution/application/:id" element={<Guard portal="institution"><Page><ApplicationWizard /></Page></Guard>} />
        <Route path="/institution/application/:id/success" element={<Guard portal="institution"><Page><SubmissionSuccess /></Page></Guard>} />
        <Route path="/institution/track/:id" element={<Guard portal="institution"><Page><TrackApplication /></Page></Guard>} />
        <Route path="/institution/track" element={<Guard portal="institution"><Page><TrackApplication /></Page></Guard>} />

        <Route path="/official" element={<Guard portal="official"><Page><OfficialDashboard /></Page></Guard>} />
        <Route path="/official/applications" element={<Guard portal="official"><Page><OfficialApplications /></Page></Guard>} />
        <Route path="/official/case/:id" element={<Guard portal="official"><Page><CaseReview /></Page></Guard>} />
        <Route path="/official/audit" element={<Guard portal="official"><Page><AuditTrail /></Page></Guard>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
