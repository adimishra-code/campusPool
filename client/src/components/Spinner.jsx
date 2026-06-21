export default function Spinner({ label = "Loading…" }) {
  return (
    <div className="spinner-wrap" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <small>{label}</small>
    </div>
  );
}
