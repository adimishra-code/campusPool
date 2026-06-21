import { useState } from "react";
import { Link } from "react-router-dom";

const KEY = "cc_consent";

// GDPR-style consent banner. Essential cookies (auth token, theme) are exempt;
// only analytics tracking is gated on "accepted". Choice persists in localStorage.
export default function CookieConsent() {
  const [choice, setChoice] = useState(() => localStorage.getItem(KEY));
  if (choice) return null;

  const decide = (value) => {
    localStorage.setItem(KEY, value);
    setChoice(value);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie consent">
      <div className="cookie-text">
        <strong>We value your privacy</strong>
        <p>
          We use essential cookies to keep you signed in. With your permission we also use analytics
          cookies to understand usage and improve CampusPool. Read our{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
      <div className="cookie-actions">
        <button className="secondary sm" onClick={() => decide("declined")}>
          Decline
        </button>
        <button className="primary sm" onClick={() => decide("accepted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
