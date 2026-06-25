import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "../store/themeSlice.js";
import Footer from "./Footer.jsx";
import Seo from "./Seo.jsx";
import Icon from "./Icon.jsx";

// Standalone chrome for public, crawlable pages (legal, support) that render
// outside the authenticated AppShell.
export default function PublicLayout({ children, title, description, seoPath }) {
  const dispatch = useDispatch();
  const mode = useSelector((state) => state.theme.mode);

  return (
    <div className={`public-page ${mode}`}>
      <Seo title={title} description={description} path={seoPath} />
      <header className="public-topbar">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">CP</span>
          <strong>CampusPool</strong>
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <button
            className="link-button"
            onClick={() => dispatch(toggleTheme())}
            style={{ padding: "4px", color: "var(--ink)" }}
            aria-label="Toggle dark mode"
          >
            <Icon name={mode === "light" ? "moon" : "sun"} size={20} />
          </button>
          <Link to="/login" className="link-button">
            Sign in
          </Link>
        </div>
      </header>
      <main className="public-content">{children}</main>
      <Footer />
    </div>
  );
}
