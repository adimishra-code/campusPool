import { Link } from "react-router-dom";

// Single source of truth for the public support address (shown here + on the
// Support / Report-a-bug pages).
export const SUPPORT_EMAIL = "adityamishrav820@gmail.com";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand">
          <span className="brand-mark">CP</span>
          <div>
            <strong>CampusPool</strong>
            <small>Verified student ride sharing.</small>
          </div>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms &amp; Conditions</Link>
          <Link to="/support">Help &amp; Support</Link>
          <Link to="/report-bug">Report a bug</Link>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </nav>
        <small className="footer-copy">
          © {new Date().getFullYear()} CampusPool. All rights reserved.
        </small>
      </div>
    </footer>
  );
}
