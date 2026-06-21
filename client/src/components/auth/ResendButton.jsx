import { useEffect, useState } from "react";

// "Resend code" with a calm countdown so users aren't left guessing and we don't
// hammer the endpoint. Starts the cooldown after a successful resend.
export default function ResendButton({ onResend, seconds = 30, children = "Resend code" }) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const click = async () => {
    if (left > 0) return;
    try {
      await onResend();
      setLeft(seconds);
    } catch {
      /* error is surfaced by the parent's auth state */
    }
  };

  return (
    <button type="button" className="auth-link" onClick={click} disabled={left > 0}>
      {left > 0 ? `Resend code in ${left}s` : children}
    </button>
  );
}
