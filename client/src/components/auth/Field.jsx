import { useState } from "react";
import Icon from "../Icon.jsx";

// A polished labelled input: leading icon, accessible error wiring
// (aria-invalid + aria-describedby), and an optional password reveal toggle.
// Works for inputs and selects (pass `as="select"` with <option> children).
export default function Field({
  id,
  label,
  type = "text",
  icon,
  value,
  onChange,
  placeholder,
  error,
  hint,
  showError,
  autoComplete,
  inputMode,
  as = "input",
  children,
  ...rest
}) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword ? (reveal ? "text" : "password") : type;
  const visibleError = showError ? error : undefined;
  const describedBy = visibleError ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={`auth-field${visibleError ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="auth-input-wrap">
        {icon && (
          <span className="auth-input-ico">
            <Icon name={icon} size={17} />
          </span>
        )}
        {as === "select" ? (
          <select
            id={id}
            value={value}
            onChange={onChange}
            aria-invalid={visibleError ? "true" : undefined}
            aria-describedby={describedBy}
            {...rest}
          >
            {children}
          </select>
        ) : (
          <input
            id={id}
            type={inputType}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            aria-invalid={visibleError ? "true" : undefined}
            aria-describedby={describedBy}
            {...rest}
          />
        )}
        {isPassword && (
          <button
            type="button"
            className="auth-reveal"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
          >
            <Icon name={reveal ? "eye-off" : "eye"} size={16} />
          </button>
        )}
      </div>
      {visibleError ? (
        <em className="auth-field-msg error" id={`${id}-error`}>
          {visibleError}
        </em>
      ) : hint ? (
        <span className="auth-field-msg hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
