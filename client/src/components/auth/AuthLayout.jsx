import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "../../store/themeSlice.js";
import Icon from "../Icon.jsx";
import CampusRouteArt from "./CampusRouteArt.jsx";

// The three brand pillars that tell the CampusPool story in ~3 seconds.
const PILLARS = [
  {
    icon: "verified",
    title: "Verified Students",
    text: "College-email & ID checks before any trip."
  },
  {
    icon: "route",
    title: "Smart Matching",
    text: "Trips ranked by route, timing, hostel & trust."
  },
  { icon: "safety", title: "Safety First", text: "Live location, SOS & emergency contacts." }
];

// Shared split-screen frame for every auth screen: a trust-focused story panel
// on the left (desktop) / top (mobile) and a focused card slot on the right.
// Owns dark-mode for the logged-out front door — `.auth-shell.dark` shares the
// app's dark tokens (see styles.css), and a floating toggle lets visitors switch.
export default function AuthLayout({ children }) {
  const dispatch = useDispatch();
  const mode = useSelector((s) => s.theme.mode);
  const dark = mode === "dark";

  return (
    <div className={`auth-shell${dark ? " dark" : ""}`}>
      <button
        type="button"
        className="auth-theme-toggle"
        onClick={() => dispatch(toggleTheme())}
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        <Icon name={dark ? "sun" : "moon"} size={18} />
      </button>

      <div className="auth-grid">
        <section className="auth-story">
          <CampusRouteArt />
          <div className="auth-story-inner">
            <div className="auth-brand-row">
              <span className="brand-mark">CP</span>
              <strong>CampusPool</strong>
            </div>
            <h2 className="auth-story-title">The trusted way to move around campus.</h2>
            <p className="auth-story-sub">
              Share trips with verified students and hosts — safer commutes, lighter costs, and a
              campus network you can actually trust.
            </p>

            <ul className="auth-pillars">
              {PILLARS.map((p) => (
                <li key={p.title}>
                  <span className="auth-pillar-ico">
                    <Icon name={p.icon} size={16} />
                  </span>
                  <span className="auth-pillar-body">
                    <strong>{p.title}</strong>
                    <small>{p.text}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="auth-panel">{children}</section>
      </div>
    </div>
  );
}
