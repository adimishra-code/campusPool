import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";

// Native-app-style bottom tab bar (mobile only — hidden ≥981px via CSS).
// The middle item ("Offer") is rendered as a raised FAB.
const TABS = [
  { to: "/feed", label: "Feed", icon: "feed" },
  { to: "/recommendations", label: "For You", icon: "recommendations" },
  { to: "/offer", label: "Offer", icon: "offer", fab: true },
  { to: "/my-trips", label: "Trips", icon: "my-trips" },
  { to: "/profile", label: "Profile", icon: "profile" }
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Primary">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={t.fab ? "bottom-tab fab" : "bottom-tab"}>
          <span className="bottom-tab-icon"><Icon name={t.icon} size={t.fab ? 24 : 22} /></span>
          <span className="bottom-tab-label">{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
