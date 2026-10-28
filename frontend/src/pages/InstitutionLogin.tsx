import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, Eye, EyeOff, Loader2 } from "lucide-react";
import { Background, BrandMark, Footer } from "../components/layout";
import { Alert, useToast } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAppConfig, useRefreshSession } from "../lib/session";

export default function InstitutionLogin() {
  const navigate = useNavigate();
  const toast = useToast();
  const refresh = useRefreshSession();
  const { data: config } = useAppConfig();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!loginId.trim()) next.login_id = "Institution Login ID is required.";
    if (!password.trim()) next.password = "Password is required.";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.post("/api/auth/demo-login", { portal: "institution", login_id: loginId, password });
      await refresh();
      toast({ kind: "success", title: "Signed in", desc: "Welcome to NeyamNetra" });
      navigate("/institution");
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
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
              <Building2 className="h-7 w-7" />
            </span>
            <BrandMark className="mb-2 h-8" withWordmark />
            <h1 className="text-xl font-bold text-navy-900">Institution Login</h1>
            <p className="mt-1 text-sm text-navy-500">Apply for EoA, new courses and intake changes</p>
          </div>

          {formError && <div className="mb-4"><Alert kind="error">{formError}</Alert></div>}

          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label htmlFor="loginId" className="field-label">Institution Login ID</label>
              <input
                id="loginId" className="field-input" value={loginId} autoComplete="username"
                onChange={(e) => setLoginId(e.target.value)} placeholder="e.g. 1-4261798"
                aria-invalid={!!errors.login_id} aria-describedby={errors.login_id ? "loginId-err" : undefined}
              />
              {errors.login_id && <p id="loginId-err" className="field-error" role="alert">{errors.login_id}</p>}
            </div>
            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <div className="relative">
                <input
                  id="password" type={show ? "text" : "password"} className="field-input pr-11" value={password}
                  autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} placeholder="Enter password"
                  aria-invalid={!!errors.password} aria-describedby={errors.password ? "pw-err" : undefined}
                />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-700">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p id="pw-err" className="field-error" role="alert">{errors.password}</p>}
            </div>
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : "Login"}
            </button>
          </form>

          {config?.demo_mode && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-center text-xs font-medium text-amber-800">
              <span className="font-bold">Demo Access.</span> Any non-empty ID and password sign you in as the demonstration institution (MAIT). Passwords are never stored.
            </div>
          )}
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
