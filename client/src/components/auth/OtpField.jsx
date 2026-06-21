import { useRef } from "react";

// Focused one-time-code entry: N single-digit boxes that behave like one field.
// Handles auto-advance, backspace-to-previous, arrow nav, and pasting a full
// code. The value stays a plain string so the parent's existing validation and
// thunks are untouched.
export default function OtpField({
  id = "otp",
  length = 6,
  value = "",
  onChange,
  error,
  showError
}) {
  const refs = useRef([]);
  const chars = Array.from({ length }, (_, i) => value[i] || "");
  const invalid = showError && error;

  const focus = (i) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const handleChange = (i) => (e) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      const next = chars.slice();
      next[i] = "";
      onChange(next.join(""));
      return;
    }
    if (digits.length > 1) {
      // Pasted / autofilled multi-digit code — fill from this box onward.
      const merged = (value.slice(0, i) + digits).replace(/\D/g, "").slice(0, length);
      onChange(merged);
      focus(merged.length);
      return;
    }
    const next = chars.slice();
    next[i] = digits;
    onChange(next.join(""));
    if (i < length - 1) focus(i + 1);
  };

  const handleKey = (i) => (e) => {
    if (e.key === "Backspace" && !chars[i] && i > 0) focus(i - 1);
    else if (e.key === "ArrowLeft") focus(i - 1);
    else if (e.key === "ArrowRight") focus(i + 1);
  };

  return (
    <div
      className={`auth-otp${invalid ? " has-error" : ""}`}
      role="group"
      aria-label="Verification code"
      aria-describedby={invalid ? `${id}-error` : undefined}
    >
      {chars.map((c, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="auth-otp-box"
          type="text"
          inputMode="numeric"
          maxLength={length}
          value={c}
          onChange={handleChange(i)}
          onKeyDown={handleKey(i)}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
