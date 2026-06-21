// Decorative campus-network visual for the auth story panel.
// Built entirely with SVG (no stock art): journey paths connecting campus
// nodes, with a couple of location pins. Purely presentational — aria-hidden.
export default function CampusRouteArt() {
  return (
    <svg
      className="auth-art"
      viewBox="0 0 480 520"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* primary journey path */}
      <path
        className="auth-route"
        d="M48 96 C 168 40, 232 196, 336 150 S 452 312, 420 452"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 12"
      />
      {/* secondary connecting path */}
      <path
        className="auth-route two"
        d="M70 452 C 176 408, 196 276, 300 286 S 392 150, 452 120"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 14"
      />

      {/* campus nodes */}
      <g className="auth-nodes">
        <circle cx="48" cy="96" r="6" />
        <circle cx="336" cy="150" r="5" />
        <circle cx="300" cy="286" r="4" />
        <circle cx="420" cy="452" r="6" />
        <circle cx="70" cy="452" r="4" />
        <circle cx="452" cy="120" r="5" />
        <circle className="auth-pulse" cx="48" cy="96" r="14" />
        <circle className="auth-pulse" cx="420" cy="452" r="16" />
      </g>

      {/* location pins (origin + destination) */}
      <g className="auth-pin" transform="translate(330 96)">
        <path d="M14 0a14 14 0 0 0-14 14c0 9.5 14 24 14 24s14-14.5 14-24A14 14 0 0 0 14 0Z" />
        <circle cx="14" cy="14" r="5" className="auth-pin-dot" />
      </g>
      <g className="auth-pin small" transform="translate(150 300)">
        <path d="M11 0A11 11 0 0 0 0 11c0 7.6 11 19 11 19s11-11.4 11-19A11 11 0 0 0 11 0Z" />
        <circle cx="11" cy="11" r="4" className="auth-pin-dot" />
      </g>
    </svg>
  );
}
