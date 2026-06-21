# Deploying CampusPool

This is a production deployment runbook. It covers provisioning the third-party
services the app integrates with, configuring environment variables, and shipping
the backend + frontend. **You** run these steps — they require accounts and
secrets that can't be created for you.

> TL;DR for a single box: provision Atlas + Redis + SMTP, copy
> `.env.production.example` → `.env`, fill it in, then `docker compose up -d --build`.

---

## 0. Architecture

| Component | What it is | Default port |
|-----------|------------|--------------|
| `api`   | Express + Socket.IO server (`server/`) | 5000 |
| `web`   | React SPA built by Vite, served by nginx (`client/`) | 80 (8080 on host) |
| `mongo` | MongoDB (use **Atlas** in prod instead of the bundled container) | 27017 |
| `redis` | Distributed rate-limit store | 6379 |

The JWT session is delivered as an **httpOnly cookie**. For that cookie to be
sent, the browser must treat the frontend and API as compatible origins:

- **Same registrable domain** (e.g. `app.example.com` + `api.example.com`):
  keep `COOKIE_SAMESITE=lax`. ✅ Recommended.
- **Different domains** (e.g. frontend on Vercel, API on Render): set
  `COOKIE_SAMESITE=none` (HTTPS required). See the **Cross-site** note at the end.

---

## 1. Provision third-party services

### MongoDB Atlas (required)
1. Create a free/shared cluster at <https://cloud.mongodb.com>.
2. Database Access → add a user with a strong password.
3. Network Access → allow your host's IP (or `0.0.0.0/0` if behind a trusted proxy).
4. Copy the **SRV connection string** → `MONGO_URI`.

### Redis (required for multi-replica rate limiting)
- Use a managed Redis (Upstash, Redis Cloud, Render Redis, etc.) or the bundled
  `redis` service. Put the URL in `REDIS_URL`. If you run a single API instance
  you can omit it — limiting falls back to in-memory.

### SMTP email (required for real signups)
- Without SMTP, verification OTPs are never sent (and never echoed in prod), so
  users can't verify their email. Use any provider (SES, SendGrid, Mailgun,
  Postmark, Gmail App Password) and set `SMTP_*` + `SMTP_FROM`.

### Google OAuth (optional)
1. <https://console.cloud.google.com> → APIs & Services → Credentials → OAuth client (Web).
2. Authorized redirect URI: `https://api.your-domain.com/api/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, and on
   the client `VITE_GOOGLE_OAUTH_ENABLED=true`.

### Google Maps (optional)
- Enable Geocoding, Directions, Distance Matrix and Maps JavaScript APIs; create
  a key. Server key → `GOOGLE_MAPS_API_KEY`; browser key → `VITE_GOOGLE_MAPS_API_KEY`
  (restrict it by HTTP referrer). Without a key the API returns 503 for map calls
  and the SPA shows a styled fallback.

### Razorpay (optional, live payments)
- From the Razorpay dashboard (live mode) set `RAZORPAY_KEY_ID`,
  `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

### Twilio (optional, SOS SMS)
- Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.

---

## 2. Configure environment

```bash
cp .env.production.example .env
# Fill in at minimum: CLIENT_URL, MONGO_URI, JWT_SECRET (openssl rand -hex 32),
# and your SMTP_* settings.
```

`VITE_*` values are **baked into the frontend at build time**, so set them before
building the `web` image (they're passed as build args by docker-compose).

---

## 3a. Deploy with Docker Compose (single host / VPS)

```bash
docker compose build          # builds api + web images (JWT_SECRET must be set)
docker compose up -d
docker compose ps             # all services healthy?
docker compose logs -f api
```

- Frontend: `http://<host>:8080`  ·  API: `http://<host>:5000`
- Put a TLS-terminating reverse proxy (Caddy/Traefik/nginx) in front for HTTPS,
  or use the managed-host path below. **Production must be HTTPS** — the auth
  cookie is `Secure` in production and won't be sent over plain HTTP.
- Seed reference data (optional): `docker compose exec api npm run seed`.

The bundled `mongo`/`redis` services are convenient but for real workloads point
`MONGO_URI`/`REDIS_URL` at managed instances and remove those services.

## 3b. Deploy to managed hosts (split)

**Backend** (Render / Railway / Fly.io):
- Build context `server/`, start `npm start`, health check `GET /health`.
- Set all server env vars from your `.env`. Add a managed Redis add-on and wire
  `REDIS_URL`.

**Frontend** (Vercel / Netlify / Cloudflare Pages):
- Root `client/`, build `npm run build`, output `dist/`.
- Set `VITE_API_URL`, `VITE_SOCKET_URL` (your API origin), and any maps/OAuth vars.
- If the API is on a different domain, set the API's `COOKIE_SAMESITE=none`.

---

## 4. Post-deploy smoke test

1. `GET https://api.../health` → `{"status":"ok"}`.
2. Register → check the verification email arrives (SMTP works).
3. Log in → DevTools shows an **httpOnly** `token` cookie and **no token in
   localStorage**; refresh keeps you signed in; logout clears the cookie.
4. (If configured) Google sign-in completes and the redirect URL has **no**
   `?token=`.
5. Confirm rate limiting: hammer `/api/auth/login` and watch for HTTP 429.

---

## 5. CI/CD

`.github/workflows/ci.yml` runs lint, server tests, client build and a docker
build on every push/PR. A deploy workflow scaffold lives at
`.github/workflows/deploy.yml` — it is **manual-only and disabled by default**.
Add your registry/host secrets and enable it when ready.

---

## Cross-site (different domains) — CSRF note

`SameSite` is the app's CSRF defense, and it only works when the frontend and API
share a registrable domain. If you must split them across domains
(`COOKIE_SAMESITE=none`), the cookie becomes sendable cross-site and you should
add CSRF protection (a double-submit token or an `Origin`/`Referer` allowlist on
state-changing routes) before going live. Keeping both on one domain avoids this
entirely and is the recommended setup.
