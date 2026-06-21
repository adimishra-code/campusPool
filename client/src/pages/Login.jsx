import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  login, register, verifyEmail, resendVerification, verifyLoginOtp,
  forgotPassword, resetPassword, clearAuthError, fetchMe
} from "../store/authSlice.js";
import { trackEvent } from "../services/tracking.js";
import Seo from "../components/Seo.jsx";
import Icon from "../components/Icon.jsx";

const HERO_POINTS = [
  { icon: "verified", title: "Verified students only", text: "College-email + ID checks before anyone rides." },
  { icon: "route", title: "Smart route matching", text: "Trips ranked by route, timing, hostel & trust." },
  { icon: "safety", title: "Safety built in", text: "Live location, SOS and emergency contacts." }
];

const EMPTY = { name: "", email: "", phone: "", password: "", hostel: "", studentId: "", role: "student", otp: "", resetToken: "" };

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const GOOGLE_ENABLED = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";

export default function Login() {
  const dispatch = useDispatch();
  const { authenticated, status, error } = useSelector((state) => state.auth);
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [info, setInfo] = useState(null); // { previewOtp, message }
  const [localError, setLocalError] = useState(null);

  // Handle OAuth success (?oauth=success) and password-reset links (?email=&token=).
  useEffect(() => {
    const t = params.get("token");
    const email = params.get("email");
    if (t && email) {
      // Password reset link (the token here is a reset token, not the session).
      setMode("reset-password");
      setForm((f) => ({ ...f, email, resetToken: t }));
      setParams({}, { replace: true });
    } else if (params.get("oauth") === "success") {
      // OAuth set the httpOnly session cookie server-side — hydrate the profile.
      dispatch(fetchMe());
      setParams({}, { replace: true });
    } else if (params.get("oauth") === "failed") {
      setLocalError("Google sign-in failed. Please try again or use email.");
      setParams({}, { replace: true });
    }
  }, [params, dispatch, setParams]);

  if (authenticated) return <Navigate to="/feed" replace />;

  const loading = status === "loading";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Per-mode client validation.
  const errors = {};
  if (mode === "register" && !form.name.trim()) errors.name = "Name is required";
  if (["login", "register", "forgot-password", "reset-password"].includes(mode) && !/^\S+@\S+\.\S+$/.test(form.email)) errors.email = "Enter a valid email";
  if (mode === "register" && !/^\d{10,15}$/.test(form.phone)) errors.phone = "Enter a 10–15 digit phone";
  if (["login", "register"].includes(mode) && form.password.length < 8) errors.password = "Min 8 characters";
  if (mode === "reset-password" && form.password.length < 8) errors.password = "Min 8 characters";
  if (["verify-email", "login-otp"].includes(mode) && !/^\d{4,8}$/.test(form.otp)) errors.otp = "Enter the code we sent";
  const isValid = Object.keys(errors).length === 0;

  const goto = (next, extra = {}) => { setMode(next); setTouched(false); setInfo(extra.info || null); setLocalError(null); dispatch(clearAuthError()); };

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    setLocalError(null);
    if (!isValid) return;

    try {
      if (mode === "login") {
        const data = await dispatch(login({ email: form.email, password: form.password })).unwrap();
        if (data.needsEmailVerification) return goto("verify-email", { info: { previewOtp: data.previewOtp, message: `Verify your email to continue. We sent a code to ${form.email}.` } });
        if (data.twoFactorRequired) return goto("login-otp", { info: { previewOtp: data.previewOtp, message: `Enter the login code we emailed to ${form.email}.` } });
        trackEvent("login");
      } else if (mode === "register") {
        const data = await dispatch(register(form)).unwrap();
        trackEvent("signup", { role: form.role });
        goto("verify-email", { info: { previewOtp: data.previewOtp, message: `Almost there! We sent a verification code to ${form.email}.` } });
      } else if (mode === "verify-email") {
        await dispatch(verifyEmail({ email: form.email, otp: form.otp })).unwrap();
        trackEvent("email_verified");
      } else if (mode === "login-otp") {
        await dispatch(verifyLoginOtp({ email: form.email, otp: form.otp })).unwrap();
        trackEvent("login", { twoFactor: true });
      } else if (mode === "forgot-password") {
        await dispatch(forgotPassword({ email: form.email })).unwrap();
        setInfo({ message: "If that account exists, we've emailed a reset link. Check your inbox." });
      } else if (mode === "reset-password") {
        await dispatch(resetPassword({ email: form.email, token: form.resetToken, password: form.password })).unwrap();
        goto("login", { info: { message: "Password updated — please log in." } });
      }
    } catch {
      /* error is surfaced via the slice's `error` state */
    }
  };

  const resend = async () => {
    setLocalError(null);
    try {
      const data = await dispatch(resendVerification({ email: form.email })).unwrap();
      setInfo({ previewOtp: data.previewOtp, message: "A new code is on its way." });
    } catch { /* surfaced via slice */ }
  };

  const titles = {
    login: "Welcome back",
    register: "Join your campus",
    "verify-email": "Verify your email",
    "login-otp": "Two-factor login",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password"
  };

  const shownError = localError || error;

  return (
    <main className="auth-page">
      <Seo title="Sign in" description="Sign in or create your verified CampusPool account." path="/login" />
      <section className="auth-hero" aria-hidden>
        <div className="auth-hero-inner">
          <div className="auth-brand light">
            <span className="brand-mark">CP</span>
            <strong>CampusPool</strong>
          </div>
          <h2 className="auth-hero-title">Your campus, <br />sharing the ride.</h2>
          <p className="auth-hero-sub">Cheaper trips, greener commutes, and a network you can trust — built for students.</p>
          <ul className="auth-hero-points">
            {HERO_POINTS.map((p) => (
              <li key={p.title}>
                <span className="auth-hero-ico"><Icon name={p.icon} size={18} /></span>
                <span><strong>{p.title}</strong><small>{p.text}</small></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand">
          <span className="brand-mark">CP</span>
          <div>
            <strong>CampusPool</strong>
            <small>Share rides with verified students</small>
          </div>
        </div>

        <h1 className="auth-title">{titles[mode]}</h1>

        {info?.message && <div className="alert info">{info.message}</div>}
        {info?.previewOtp && <div className="alert info">Dev code: <strong>{info.previewOtp}</strong></div>}

        {mode === "register" && (
          <label className="field">
            <span>Full name</span>
            <input value={form.name} onChange={set("name")} placeholder="Riya Sharma" autoComplete="name" />
            {touched && errors.name && <em className="field-error">{errors.name}</em>}
          </label>
        )}

        {["login", "register", "forgot-password"].includes(mode) && (
          <label className="field">
            <span>Email</span>
            <input value={form.email} onChange={set("email")} placeholder="you@college.edu" type="email" autoComplete="email" />
            {touched && errors.email && <em className="field-error">{errors.email}</em>}
          </label>
        )}

        {mode === "reset-password" && (
          <label className="field">
            <span>Email</span>
            <input value={form.email} onChange={set("email")} placeholder="you@college.edu" type="email" autoComplete="email" />
          </label>
        )}

        {mode === "register" && (
          <>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={set("phone")} placeholder="9999999999" inputMode="numeric" />
              {touched && errors.phone && <em className="field-error">{errors.phone}</em>}
            </label>

            <div className="form-grid">
              <label className="field">
                <span>Hostel (optional)</span>
                <input value={form.hostel} onChange={set("hostel")} placeholder="Block A" />
              </label>
              <label className="field">
                <span>Student ID (optional)</span>
                <input value={form.studentId} onChange={set("studentId")} placeholder="STU12345" />
              </label>
            </div>

            <label className="field">
              <span>I want to</span>
              <select value={form.role} onChange={set("role")}>
                <option value="student">Join rides as a student</option>
                <option value="host">Offer rides as a host</option>
              </select>
            </label>
          </>
        )}

        {["verify-email", "login-otp"].includes(mode) && (
          <label className="field">
            <span>Verification code</span>
            <input value={form.otp} onChange={set("otp")} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" />
            {touched && errors.otp && <em className="field-error">{errors.otp}</em>}
          </label>
        )}

        {(["login", "register"].includes(mode)) && (
          <label className="field">
            <span>Password</span>
            <input value={form.password} onChange={set("password")} placeholder="••••••••" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {touched && errors.password && <em className="field-error">{errors.password}</em>}
          </label>
        )}

        {mode === "reset-password" && (
          <label className="field">
            <span>New password</span>
            <input value={form.password} onChange={set("password")} placeholder="••••••••" type="password" autoComplete="new-password" />
            {touched && errors.password && <em className="field-error">{errors.password}</em>}
          </label>
        )}

        {shownError && <div className="alert error">{shownError}</div>}

        <button className="primary lg" type="submit" disabled={loading}>
          {loading ? "Please wait…" : (
            mode === "login" ? "Log in"
            : mode === "register" ? "Create account"
            : mode === "verify-email" ? "Verify email"
            : mode === "login-otp" ? "Verify & sign in"
            : mode === "forgot-password" ? "Send reset link"
            : "Update password"
          )}
        </button>

        {GOOGLE_ENABLED && ["login", "register"].includes(mode) && (
          <button type="button" className="secondary lg oauth-btn" onClick={() => { window.location.href = `${API_BASE}/auth/google`; }}>
            Continue with Google
          </button>
        )}

        {/* Mode switches */}
        {mode === "login" && (
          <>
            <button type="button" className="link-button" onClick={() => goto("forgot-password")}>Forgot password?</button>
            <button type="button" className="link-button" onClick={() => goto("register")}>New here? Create an account</button>
          </>
        )}
        {mode === "register" && (
          <button type="button" className="link-button" onClick={() => goto("login")}>Already have an account? Log in</button>
        )}
        {["verify-email"].includes(mode) && (
          <button type="button" className="link-button" onClick={resend}>Didn't get it? Resend code</button>
        )}
        {["verify-email", "login-otp", "forgot-password", "reset-password"].includes(mode) && (
          <button type="button" className="link-button" onClick={() => goto("login")}>Back to log in</button>
        )}

        <p className="auth-legal">
          By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </form>
    </main>
  );
}
