import { useEffect } from "react";

// Mobile bottom sheet: a dimmed backdrop + a panel that slides up from the
// bottom. Used for the nav overflow menu and the feed filters on small screens.
export default function Sheet({ open, onClose, title, children }) {
  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden />
        {title && (
          <div className="sheet-head">
            <strong>{title}</strong>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
