import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Loader2, ScrollText, ShieldCheck, UserCog } from "lucide-react";
import { Background, BrandMark, Footer } from "../components/layout";
import { Alert, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAppConfig, useRefreshSession } from "../lib/session";
import type { OfficialRole } from "../lib/types";

const ROLES: { value: OfficialRole; label: string; desc: string; icon: typeof ShieldCheck }[] = [
  { value: "scrutiny_member", label: "Scrutiny Member", desc: "Review documents, request clarification, flag for verification", icon: ScrollText },
  { value: "reviewer", label: "Reviewer", desc: "Review evidence and record demonstration decisions", icon: ShieldCheck },
  { value: "administrator", label: "Administrator", desc: "Dashboards, audit trail and report exports", icon: UserCog },
];

export default function OfficialLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshSession();
  const { data: config } = useAppConfig();
  const [officialId, setOfficialId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<OfficialRole>("scrutiny_member");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!officialId.trim()) next.login_id = "Official ID is required.";
    if (!password.trim()) next.password = "Password is required.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.post("/api/auth/demo-login", { portal: "official", login_id: officialId, password, role });
      await refresh();
      toast({ kind: "success", title: "Signed in", desc: ROLES.find((r) => r.value === role)!.label });
      navigate("/official");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.fields) setErrors(err.details.fields);
        else setFormError(err.message);
      } else setFormError("Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <Background dim />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-strong w-full max-w-md rounded-3xl p-8"
        >
          <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-navy-500 hover:text-navy-800">
            <ArrowLeft className="h-4 w-4" /> Back to role selection
          </Link>
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-600">
              <ShieldCheck className="h-7 w-7" />
            </span>
            <BrandMark className="mb-2 h-8" />
            <h1 className="text-xl font-bold text-navy-900">AICTE Officials Login</h1>
            <p className="mt-1 text-sm text-navy-500">Review applications and record decisions</p>
          </div>

          {formError && <div className="mb-4"><Alert kind="error">{formError}</Alert></div>}

          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label htmlFor="officialId" className="field-label">Official ID</label>
              <input id="officialId" className="field-input" value={officialId} autoComplete="username"
                onChange={(e) => setOfficialId(e.target.value)} placeholder="e.g. AICTE-SM-1024"
                aria-invalid={!!errors.login_id} />
              {errors.login_id && <p className="field-error" role="alert">{errors.login_id}</p>}
            </div>
            <div>
              <label htmlFor="opassword" className="field-label">Password</label>
              <div className="relative">
                <input id="opassword" type={show ? "text" : "password"} className="field-input pr-11" value={password}
                  autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="Enter password"
                  aria-invalid={!!errors.password} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-700">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="field-error" role="alert">{errors.password}</p>}
            </div>

            <fieldset>
              <legend className="field-label">Role</legend>
              <div className="space-y-2">
                {ROLES.map((r) => {
                  const Icon = r.icon;
                  const active = role === r.value;
                  return (
                    <label key={r.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${active ? "border-teal-400 bg-teal-50 ring-1 ring-teal-300" : "border-navy-200 bg-white hover:border-navy-300"}`}>
                      <input type="radio" name="role" value={r.value} checked={active}
                        onChange={() => setRole(r.value)} className="sr-only" />
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-teal-600 text-white" : "bg-navy-100 text-navy-500"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-navy-900">{r.label}</span>
                        <span className="block text-xs text-navy-500">{r.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.role && <p className="field-error" role="alert">{errors.role}</p>}
            </fieldset>

            <button type="submit" disabled={busy} className="btn-teal w-full py-3">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : "Login"}
            </button>
          </form>

          {config?.demo_mode && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-center text-xs font-medium text-amber-800">
              <span className="font-bold">Demo Access.</span> The selected role determines permissions, enforced on the backend. Passwords are never stored.
            </div>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
