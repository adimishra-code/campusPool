import { Link } from "react-router-dom";
import Footer from "./Footer.jsx";
import Seo from "./Seo.jsx";

// Standalone chrome for public, crawlable pages (legal, support) that render
// outside the authenticated AppShell.
export default function PublicLayout({ children, title, description, seoPath }) {
  return (
    <div className="public-page">
      <Seo title={title} description={description} path={seoPath} />
      <header className="public-topbar">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">CP</span>
          <strong>CampusPool</strong>
        </Link>
        <Link to="/login" className="link-button">
          Sign in
        </Link>
      </header>
      <main className="public-content">{children}</main>
      <Footer />
    </div>
  );
}
