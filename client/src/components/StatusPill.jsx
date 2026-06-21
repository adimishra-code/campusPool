// Consistent labels/colors for trip and passenger statuses across the app.
const TRIP_STATUS = {
  offered: { label: "Open", tone: "ok" },
  open: { label: "Open", tone: "ok" },
  full: { label: "Full", tone: "warn" },
  departed: { label: "In progress", tone: "info" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "bad" },
  no_show: { label: "No show", tone: "bad" },
  draft: { label: "Draft", tone: "muted" }
};

const PASSENGER_STATUS = {
  pending: { label: "Pending", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "muted" },
  completed: { label: "Completed", tone: "muted" }
};

export default function StatusPill({ status, kind = "trip" }) {
  const map = kind === "passenger" ? PASSENGER_STATUS : TRIP_STATUS;
  const meta = map[status] || { label: status || "—", tone: "muted" };
  return <span className={`pill ${meta.tone}`}>{meta.label}</span>;
}
