import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  login,
  register,
  verifyEmail,
  resendVerification,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  clearAuthError,
  fetchMe
} from "../store/authSlice.js";
import { trackEvent } from "../services/tracking.js";
import Seo from "../components/Seo.jsx";
import Icon from "../components/Icon.jsx";
import AuthLayout from "../components/auth/AuthLayout.jsx";
import Field from "../components/auth/Field.jsx";
import OtpField from "../components/auth/OtpField.jsx";
import ResendButton from "../components/auth/ResendButton.jsx";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  password: "",
  hostel: "",
  studentId: "",
  role: "student",
  otp: "",
  resetToken: ""
};

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const GOOGLE_ENABLED = import.meta.env.VITE_GOOGLE_OAUTH_ENABLED === "true";

// Official Google "G" so the OAuth button reads as first-class, not an afterthought.
function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function Login() {
  const dispatch = useDispatch();
  const { authenticated, status, error, user } = useSelector((state) => state.auth);
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState("login");
  // Cosmetic login segmentation. Role is ALWAYS decided server-side by the
  // account — this only adjusts copy and where the user lands after sign-in.
  const [loginAs, setLoginAs] = useState("student");
  const [step, setStep] = useState(1); // register-only progressive disclosure
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

  if (authenticated)
    return <Navigate to={user?.role === "admin" ? "/admin/verifications" : "/feed"} replace />;

  const loading = status === "loading";
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setOtp = (v) => setForm({ ...form, otp: v });

  // Per-mode client validation (unchanged rules).
  const errors = {};
  if (mode === "register" && !form.name.trim()) errors.name = "Name is required";
  if (
    ["login", "register", "forgot-password", "reset-password"].includes(mode) &&
    !/^\S+@\S+\.\S+$/.test(form.email)
  )
    errors.email = "Enter a valid email";
  if (mode === "register" && !/^\d{10,15}$/.test(form.phone))
    errors.phone = "Enter a 10–15 digit phone";
  if (["login", "register"].includes(mode) && form.password.length < 8)
    errors.password = "Min 8 characters";
  if (mode === "reset-password" && form.password.length < 8) errors.password = "Min 8 characters";
  if (["verify-email", "login-otp"].includes(mode) && !/^\d{4,8}$/.test(form.otp))
    errors.otp = "Enter the code we sent";
  const isValid = Object.keys(errors).length === 0;
  // Register step 1 (account setup) only depends on these three fields.
  const step1Valid = !errors.name && !errors.email && !errors.password;

  const goto = (next, extra = {}) => {
    setMode(next);
    setStep(1);
    setTouched(false);
    setInfo(extra.info || null);
    setLocalError(null);
    dispatch(clearAuthError());
  };

  const submit = async (event) => {
    event.preventDefault();
    setTouched(true);
    setLocalError(null);

    // Register is a guided 2-step flow; step 1 just advances locally.
    if (mode === "register" && step === 1) {
      if (step1Valid) {
        setStep(2);
        setTouched(false);
      }
      return;
    }
    if (!isValid) return;

    try {
      if (mode === "login") {
        const data = await dispatch(login({ email: form.email, password: form.password })).unwrap();
        if (data.needsEmailVerification)
          return goto("verify-email", {
            info: {
              previewOtp: data.previewOtp,
              message: `Verify your email to continue. We sent a code to ${form.email}.`
            }
          });
        if (data.twoFactorRequired)
          return goto("login-otp", {
            info: {
              previewOtp: data.previewOtp,
              message: `Enter the login code we emailed to ${form.email}.`
            }
          });
        trackEvent("login");
      } else if (mode === "register") {
        const data = await dispatch(register(form)).unwrap();
        trackEvent("signup", { role: form.role });
        goto("verify-email", {
          info: {
            previewOtp: data.previewOtp,
            message: `Almost there! We sent a verification code to ${form.email}.`
          }
        });
      } else if (mode === "verify-email") {
        await dispatch(verifyEmail({ email: form.email, otp: form.otp })).unwrap();
        trackEvent("email_verified");
      } else if (mode === "login-otp") {
        await dispatch(verifyLoginOtp({ email: form.email, otp: form.otp })).unwrap();
        trackEvent("login", { twoFactor: true });
      } else if (mode === "forgot-password") {
        await dispatch(forgotPassword({ email: form.email })).unwrap();
        setInfo({
          message: "If that account exists, we've emailed a reset link. Check your inbox.",
          tone: "success"
        });
      } else if (mode === "reset-password") {
        await dispatch(
          resetPassword({ email: form.email, token: form.resetToken, password: form.password })
        ).unwrap();
        goto("login", { info: { message: "Password updated — please log in.", tone: "success" } });
      }
    } catch {
      /* error is surfaced via the slice's `error` state */
    }
  };

  const resend = async () => {
    setLocalError(null);
    const data = await dispatch(resendVerification({ email: form.email })).unwrap();
    setInfo({ previewOtp: data.previewOtp, message: "A new code is on its way." });
  };

  const titles = {
    login: "Welcome back",
    register: "Join your campus",
    "verify-email": "Verify your email",
    "login-otp": "Two-factor login",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password"
  };
  const subtitles = {
    login: "Sign in to your verified CampusPool account.",
    register:
      step === 1
        ? "Step 1 of 2 — set up your account."
        : "Step 2 of 2 — tell us about your campus.",
    "verify-email": `Enter the code we emailed to ${form.email || "your inbox"}.`,
    "login-otp": `Enter the login code we emailed to ${form.email || "your inbox"}.`,
    "forgot-password": "We'll email you a secure link to reset it.",
    "reset-password": "Pick a strong password to secure your account."
  };

  const submitLabels = {
    login: "Log in",
    register: step === 1 ? "Continue" : "Create account",
    "verify-email": "Verify email",
    "login-otp": "Verify & sign in",
    "forgot-password": "Send reset link",
    "reset-password": "Update password"
  };

  const shownError = localError || error;
  const isOtpMode = mode === "verify-email" || mode === "login-otp";

  return (
    <AuthLayout>
      <Seo
        title="Sign in"
        description="Sign in or create your verified CampusPool account."
        path="/login"
      />
      <form className="auth-card2" onSubmit={submit} noValidate>
        <header className="auth-card-head">
          <span className="brand-mark" aria-hidden="true">
            CP
          </span>
          <h1 className="auth-h1">{titles[mode]}</h1>
          <p className="auth-sub">{subtitles[mode]}</p>
        </header>

        {mode === "register" && (
          <ol className="auth-steps" aria-label="Registration progress">
            <li className={step >= 1 ? "active" : ""}>
              <span>{step > 1 ? <Icon name="check" size={14} /> : "1"}</span> Account
            </li>
            <li className={step >= 2 ? "active" : ""}>
              <span>2</span> Campus profile
            </li>
          </ol>
        )}

        {info?.message && (
          <div
            className={`auth-alert ${info.tone === "success" ? "success" : "info"}`}
            role="status"
          >
            <Icon name={info.tone === "success" ? "check" : "mail"} size={16} />
            <span>{info.message}</span>
          </div>
        )}
        {info?.previewOtp && (
          <div className="auth-alert info" role="status">
            <Icon name="lock" size={16} />
            <span>
              Dev code: <strong>{info.previewOtp}</strong>
            </span>
          </div>
        )}

        {/* ---- LOGIN ---- */}
        {mode === "login" && (
          <>
            <div className="auth-role-tabs" role="tablist" aria-label="Sign in as">
              {[
                { k: "student", label: "Student" },
                { k: "host", label: "Host" },
                { k: "admin", label: "Admin" }
              ].map((t) => (
                <button
                  key={t.k}
                  type="button"
                  role="tab"
                  aria-selected={loginAs === t.k}
                  className={`auth-role-tab ${loginAs === t.k ? "active" : ""}`}
                  onClick={() => setLoginAs(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {loginAs === "admin" && (
              <p className="auth-role-note">
                Admin access is granted by your campus team — sign in with your normal credentials.
              </p>
            )}
            <Field
              id="email"
              label="Email"
              icon="mail"
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              value={form.email}
              onChange={set("email")}
              error={errors.email}
              showError={touched}
            />
            <Field
              id="password"
              label="Password"
              icon="lock"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={set("password")}
              error={errors.password}
              showError={touched}
            />
          </>
        )}

        {/* ---- REGISTER (2 steps) ---- */}
        {mode === "register" && step === 1 && (
          <>
            <Field
              id="name"
              label="Full name"
              icon="profile"
              autoComplete="name"
              placeholder="Riya Sharma"
              value={form.name}
              onChange={set("name")}
              error={errors.name}
              showError={touched}
            />
            <Field
              id="email"
              label="College email"
              icon="mail"
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              value={form.email}
              onChange={set("email")}
              error={errors.email}
              showError={touched}
              hint={!touched ? "Use your college email to get verified faster." : undefined}
            />
            <Field
              id="password"
              label="Password"
              icon="lock"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={set("password")}
              error={errors.password}
              showError={touched}
            />
          </>
        )}
        {mode === "register" && step === 2 && (
          <>
            <Field
              id="phone"
              label="Phone"
              icon="phone"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="9999999999"
              value={form.phone}
              onChange={set("phone")}
              error={errors.phone}
              showError={touched}
            />
            <div className="form-grid">
              <Field
                id="hostel"
                label="Hostel (optional)"
                icon="home"
                placeholder="Block A"
                value={form.hostel}
                onChange={set("hostel")}
              />
              <Field
                id="studentId"
                label="Student ID (optional)"
                icon="verify"
                placeholder="STU12345"
                value={form.studentId}
                onChange={set("studentId")}
              />
            </div>
            <Field
              id="role"
              label="I want to"
              icon="users"
              as="select"
              value={form.role}
              onChange={set("role")}
            >
              <option value="student">Join trips as a student</option>
              <option value="host">Offer trips as a host</option>
            </Field>
            <p className="auth-role-note">
              Admin accounts aren&apos;t self-served — they&apos;re provisioned by your campus team.
            </p>
          </>
        )}

        {/* ---- EMAIL / 2FA CODE ---- */}
        {isOtpMode && (
          <div className="auth-field">
            <label htmlFor="otp">Verification code</label>
            <OtpField
              id="otp"
              value={form.otp}
              onChange={setOtp}
              error={errors.otp}
              showError={touched}
            />
            {touched && errors.otp && (
              <em className="auth-field-msg error" id="otp-error">
                {errors.otp}
              </em>
            )}
          </div>
        )}

        {/* ---- FORGOT PASSWORD ---- */}
        {mode === "forgot-password" && (
          <Field
            id="email"
            label="Email"
            icon="mail"
            type="email"
            autoComplete="email"
            placeholder="you@college.edu"
            value={form.email}
            onChange={set("email")}
            error={errors.email}
            showError={touched}
          />
        )}

        {/* ---- RESET PASSWORD ---- */}
        {mode === "reset-password" && (
          <>
            <Field
              id="email"
              label="Email"
              icon="mail"
              type="email"
              autoComplete="email"
              placeholder="you@college.edu"
              value={form.email}
              onChange={set("email")}
              readOnly
            />
            <Field
              id="password"
              label="New password"
              icon="lock"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={set("password")}
              error={errors.password}
              showError={touched}
            />
          </>
        )}

        {shownError && (
          <div className="auth-alert error" role="alert">
            <Icon name="alert" size={16} />
            <span>{shownError}</span>
          </div>
        )}

        <div className="auth-actions">
          {mode === "register" && step === 2 ? (
            <div className="auth-row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setStep(1);
                  setTouched(false);
                }}
              >
                <Icon name="back" size={16} /> Back
              </button>
              <button className="primary" type="submit" disabled={loading}>
                {loading ? "Please wait…" : submitLabels[mode]}
              </button>
            </div>
          ) : (
            <button className="primary auth-submit" type="submit" disabled={loading}>
              {loading ? "Please wait…" : submitLabels[mode]}
            </button>
          )}

          {GOOGLE_ENABLED &&
            ["login", "register"].includes(mode) &&
            step === 1 &&
            !(mode === "login" && loginAs === "admin") && (
            <>
              <div className="auth-divider">or</div>
              <button
                type="button"
                className="auth-google"
                onClick={() => {
                  window.location.href = `${API_BASE}/auth/google`;
                }}
              >
                <GoogleG /> Continue with Google
              </button>
            </>
          )}
        </div>

        {/* Mode switches */}
        <div className="auth-links">
          {mode === "login" && (
            <>
              <button type="button" className="auth-link" onClick={() => goto("forgot-password")}>
                Forgot password?
              </button>
              <button type="button" className="auth-link" onClick={() => goto("register")}>
                New here? Create an account
              </button>
            </>
          )}
          {mode === "register" && (
            <button type="button" className="auth-link" onClick={() => goto("login")}>
              Already have an account? Log in
            </button>
          )}
          {mode === "verify-email" && (
            <ResendButton onResend={resend}>Didn't get it? Resend code</ResendButton>
          )}
          {["verify-email", "login-otp", "forgot-password", "reset-password"].includes(mode) && (
            <button type="button" className="auth-link" onClick={() => goto("login")}>
              Back to log in
            </button>
          )}
        </div>

        <p className="auth-legal2">
          By continuing you agree to our <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
