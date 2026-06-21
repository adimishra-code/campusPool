import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchMe, logoutUser } from "../store/authSlice.js";
import { toggleTheme } from "../store/themeSlice.js";
import { notificationsReset } from "../store/notificationSlice.js";
import NotificationBell from "./NotificationBell.jsx";
import BottomNav from "./BottomNav.jsx";
import Sheet from "./Sheet.jsx";
import Icon from "./Icon.jsx";

const NAV = [
  { to: "/feed", label: "Feed", icon: "feed" },
  { to: "/recommendations", label: "For You", icon: "recommendations" },
  { to: "/offer", label: "Offer Trip", icon: "offer" },
  { to: "/my-trips", label: "My Trips", icon: "my-trips" },
  { to: "/verify", label: "Verify", icon: "verify" },
  { to: "/profile", label: "Profile", icon: "profile" }
];

// Items the bottom tab bar already covers — kept out of the mobile overflow sheet.
const PRIMARY = new Set(["/feed", "/recommendations", "/offer", "/my-trips", "/profile"]);

const VERIFICATION_LABEL = {
  approved: { text: "Verified", tone: "ok" },
  pending: { text: "Pending", tone: "warn" },
  partial: { text: "In review", tone: "warn" },
  rejected: { text: "Rejected", tone: "bad" },
  unverified: { text: "Unverified", tone: "muted" }
};

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

export default function AppShell() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const mode = useSelector((state) => state.theme.mode);
  const location = useLocation();
  // Mobile overflow sheet (secondary nav + settings). Desktop uses the sidebar.
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep profile/verification badge fresh on shell mount.
  useEffect(() => { dispatch(fetchMe()); }, [dispatch]);

  // Collapse the mobile sheet whenever the route changes.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  const badge = VERIFICATION_LABEL[user?.verificationStatus] || VERIFICATION_LABEL.unverified;
  const navItems = user?.role === "admin"
    ? [...NAV,
        { to: "/admin/verifications", label: "Admin", icon: "admin" },
        { to: "/admin/safety", label: "Safety", icon: "safety" }]
    : NAV;
  const overflowItems = navItems.filter((item) => !PRIMARY.has(item.to));

  const accountBlock = (
    <div className="account-card">
      <div className="account-head">
        <span className="avatar" aria-hidden>{initials(user?.name)}</span>
        <div>
          <strong>{user?.name || "Student"}</strong>
          <small className="role-line">
            {user?.role === "host" ? "Host" : "Student"}
            <span className={`vbadge ${badge.tone}`}>{badge.text}</span>
          </small>
        </div>
      </div>
      <div className="account-actions">
        <button onClick={() => dispatch(toggleTheme())}>
          <Icon name={mode === "light" ? "moon" : "sun"} size={16} />
          {mode === "light" ? "Dark" : "Light"} mode
        </button>
        <button onClick={() => { dispatch(notificationsReset()); dispatch(logoutUser()); }}>
          <Icon name="logout" size={16} />
          Logout
        </button>
      </div>
      <nav className="account-links" aria-label="Help & legal">
        <Link to="/support">Help &amp; Support</Link>
        <Link to="/report-bug">Report a bug</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </nav>
    </div>
  );

  return (
    <div className={`app ${mode}`}>
      {/* Desktop sidebar + mobile top app-bar share this element (CSS-driven). */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span>CP</span>
            <div>
              <strong>CampusPool</strong>
              <small>Student ride sharing</small>
            </div>
          </div>
          <div className="sidebar-header-actions">
            <NotificationBell />
            <button
              type="button"
              className="nav-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? "close" : "menu"} size={22} />
            </button>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              <span className="nav-icon" aria-hidden><Icon name={item.icon} size={19} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {accountBlock}
      </aside>

      <main className="content">
        <Outlet />
      </main>

      {/* Mobile-only native-style bottom tab bar. */}
      <BottomNav />

      {/* Mobile-only overflow sheet: secondary nav + account settings. */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav className="sheet-nav">
          {overflowItems.map((item) => (
            <NavLink key={item.to} to={item.to} className="sheet-nav-link">
              <span className="nav-icon" aria-hidden><Icon name={item.icon} size={20} /></span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {accountBlock}
      </Sheet>
    </div>
  );
}
