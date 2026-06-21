# 🎓 CampusPool — Verified Student Ride-Sharing

A MERN platform for university students to share rides between hostels, campus,
metro stations, coaching centres and nearby cities. Built around **campus trust**:
only college-verified students and hosts earn trust badges, and trips are surfaced
through an **intelligent match-scoring engine** rather than a flat list.

> Not an Uber clone — a peer-to-peer campus carpooling network with verification,
> cost-sharing, trust/reliability scoring, and route-based matching.

## Features

- **Auth & college binding** — JWT auth with a **hard email-verification gate** (login blocked until the account email OTP is confirmed), **optional login 2FA** (email OTP), **password reset** (hashed single-use token), and **env-gated Google OAuth**. Email domains map to a `College`; admin accounts are created manually only.
- **Brute-force protection** — per-account lockout after repeated failures, per-OTP-code attempt caps, and granular per-IP rate limiters on login / password-reset / OTP-verify / resend (layered defense).
- **Verification** — college-email OTP (Nodemailer), Student ID / College ID uploads (multer → GridFS), host vehicle docs (license/RC/photo), admin approval queues, trust badges.
- **Legal & SEO** — Privacy Policy & Terms pages, cookie-consent banner, per-route meta/OG/Twitter/JSON-LD via react-helmet, `robots.txt` + `sitemap.xml`, and Google Search Console verification hook.
- **Support & feedback** — in-app Help/Support and Report-a-bug forms backed by support tickets that email the support inbox + a confirmation to the user.
- **Product analytics** — consent-gated page-view + user-event tracking (signup, login, trip offer/join, payment) to a server events store.
- **Trips** — hosts offer carpool trips; students request → host approves; cost split per seat; carbon saved; full lifecycle (offered → departed → completed).
- **Intelligent matching** — ranked search + "For You" recommendations scored on route proximity, timing, hostel/college, trust, host rating and seats; 10-minute recommendation cache; host reliability score.
- **Ratings** — trip-scoped host↔passenger ratings feeding trust.
- **Analytics** — campus KPIs (rides shared, seats filled, carbon, verified users) + recommendation funnel (views/clicks/joins, acceptance & conversion).

## Tech stack

React 19 · Redux Toolkit · React Router · Vite · Express · MongoDB/Mongoose · Socket.IO · JWT · Nodemailer · Multer/GridFS · Jest + Supertest · Docker.

## Monorepo layout

```
.
├── client/   # React + Vite SPA
├── server/   # Express API (MVC) + tests + seed
└── docker-compose.yml
```

## Quick start (local)

```bash
npm run install:all                 # root + server + client deps
cp .env.example server/.env         # set MONGO_URI, JWT_SECRET, (optional) SMTP_*
npm run seed --prefix server        # demo colleges, users, vehicles, trips
npm run dev                         # API :5000 + client :5173
```

Demo logins (password `password123`): `admin@univ.edu`, `aarav@univ.edu` (host), `riya@univ.edu` (student).

## Tests

```bash
npm test --prefix server            # Jest + Supertest against an in-memory MongoDB
```

## Run with Docker

```bash
cp .env.example .env                 # set JWT_SECRET (required), MONGO_PASSWORD, VITE_GOOGLE_MAPS_API_KEY
docker compose up --build            # web :8080, api :5000, mongo (internal)
docker compose exec api npm run seed
```

The compose stack reads secrets from the root `.env`: it provisions an
authenticated MongoDB, injects `JWT_SECRET` (build fails if unset), bakes the
client `VITE_*` vars (incl. the Maps key) into the build, and adds container
healthchecks on `/health`.

## Maps

The map hero (Feed / Offer / Trip detail) uses Google Maps. Without a key the
app shows a styled fallback map and stays fully usable. To enable the live map:

1. In Google Cloud, enable **Maps JavaScript API**, **Directions API**, and
   **Geocoding API**, create an API key, and restrict it (HTTP referrers for the
   client key; the server key can be IP-restricted).
2. Set `VITE_GOOGLE_MAPS_API_KEY` (client build) and `GOOGLE_MAPS_API_KEY`
   (server) — both in the root `.env` for Docker, or in `client/.env` +
   `server/.env` for local dev.

## Deploy to production (free tier)

A portable, zero-cost path for a campus launch:

1. **Database — MongoDB Atlas** (free M0). Create a cluster + DB user, allow your
   host's IP, and copy the `mongodb+srv://…` URI into the API's `MONGO_URI`.
2. **API — Render / Railway** (free web service). Root `server/`, build
   `npm install`, start `npm start`. Set env vars: `MONGO_URI`, a strong
   `JWT_SECRET` (`openssl rand -hex 32`), `CLIENT_URL` (your web URL),
   `GOOGLE_MAPS_API_KEY`, and SMTP/Twilio if used. Run the seed once if desired.
3. **Client — Vercel / Netlify**. Root `client/`, build `npm run build`, output
   `dist/`. Set build-time `VITE_API_URL` (`https://<api>/api`),
   `VITE_SOCKET_URL` (`https://<api>`), and `VITE_GOOGLE_MAPS_API_KEY`.
4. **Comms** (real students): set `SMTP_*` (e.g. a Gmail app password) so college
   verification OTPs are emailed, and `TWILIO_*` so SOS alerts SMS-send. If unset,
   both safely no-op (OTPs are *not* leaked to clients in production).

Hosting providers terminate HTTPS for you; the API sets `trust proxy` so
rate-limits key on the real client IP. Never commit `.env`.

## Key API groups

`/api/auth` · `/api/users` · `/api/colleges` · `/api/verification` · `/api/vehicles`
· `/api/trips` (`/find`, `/recommendations`, `/match-score/:id`, `/offer`, `/:id/join` …)
· `/api/ratings` · `/api/analytics` · `/api/admin`

## Status

Feature-complete across the planned roadmap: stabilization, backend cleanup,
campus frontend, verification & trust, intelligent matching, **real-time trip chat**,
**safety (SOS, live location, emergency contacts)**, and **peer-to-peer payments
(cash / UPI-QR)** — backed by 56 Jest/Supertest tests, a seed script, Docker, and CI.

Production hardening in place: hard email-verification login gate, optional login
2FA, password reset, per-account lockout + per-IP auth/OTP/reset rate limiting,
env-gated Google OAuth, `trust proxy`, `hpp` + Mongo-operator sanitization,
escaped admin-search regex (ReDoS-safe), OTPs never leaked to clients in
production, MongoDB auth + container healthchecks, and an nginx layer with gzip,
asset caching and security headers. Legal pages, cookie consent, SEO
(robots/sitemap/structured data), support/bug-report flows and consent-gated
analytics complete the launch checklist — backed by 76 Jest/Supertest tests.
