import Icon from "./Icon.jsx";

// Accepts either a semantic icon name ("route") or one of the legacy emoji
// glyphs still passed by some pages, mapping both to the lucide set.
const EMOJI_TO_NAME = {
  "🗺️": "map", "🛣️": "route", "✨": "recommendations", "🚗": "ride",
  "🧳": "luggage", "🚨": "sos", "✅": "verified", "👤": "profile", "📋": "inbox"
};

export default function EmptyState({ icon = "inbox", title, hint, action }) {
  const name = EMOJI_TO_NAME[icon] || icon;
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden><Icon name={name} size={30} strokeWidth={1.8} /></span>
      <strong>{title}</strong>
      {hint && <small>{hint}</small>}
      {action}
    </div>
  );
}
