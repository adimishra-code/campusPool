import { Helmet } from "react-helmet-async";

const SITE = "CampusPool";
const DEFAULT_DESC = "Share verified student rides on your campus. Cheaper trips, greener commutes, and a network you can trust — built for students.";
const ORIGIN = (typeof window !== "undefined" && window.location.origin) || "https://campuspool.app";
const SITE_VERIFICATION = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION || "";

// Per-route SEO: title, description, canonical, Open Graph + Twitter cards.
// Pass noIndex on private/app routes that shouldn't appear in search results.
export default function Seo({ title, description, path, image, noIndex = false }) {
  const fullTitle = title ? `${title} · ${SITE}` : `${SITE} — Student ride sharing`;
  const desc = description || DEFAULT_DESC;
  const url = ORIGIN + (path ?? (typeof window !== "undefined" ? window.location.pathname : "/"));
  const img = image || `${ORIGIN}/og-image.svg`;

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex,nofollow" />}
      {SITE_VERIFICATION && <meta name="google-site-verification" content={SITE_VERIFICATION} />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
