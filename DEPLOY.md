# Deploying Tierra to Dokploy

This app is a **TanStack Start** server (SSR + server functions) built with Vite/Nitro.
The build produces a self-contained Node server at `.output/server/index.mjs`, which the
container runs on port **3002**.

Dokploy builds the image from the `Dockerfile` and routes traffic to it through Traefik
(which also terminates TLS via Let's Encrypt). You do **not** need the `nginx/` config —
that is only for bare-metal hosting without Dokploy.

---

## 1. Create the application

1. New Application → Source: this Git repository (branch `main`).
2. Build type: **Dockerfile** (the repo's `Dockerfile`).
3. Internal port: **3002**.
4. Domains → add **`admin.questlaguna.org`**, container port **3002**, and enable
   HTTPS (Traefik + Let's Encrypt). Point an `A`/`CNAME` DNS record for
   `admin.questlaguna.org` at the Dokploy host first, or the certificate will not issue.

---

## 2. Environment variables — all runtime, one place

All config is resolved at **runtime** — no build arguments are required. Put every variable
below in the Dokploy **Environment** section only. (The client gets its public config from a
`window.__ENV__` snippet the SSR document injects; see `src/lib/runtimeEnv.ts`.)

| Variable                     | Runtime Env | Notes                                                       |
| ---------------------------- | :---------: | ----------------------------------------------------------- |
| `VITE_SUPABASE_URL`          |     ✅      | Supabase project URL                                        |
| `VITE_SUPABASE_ANON_KEY`     |     ✅      | Supabase anon key                                           |
| `VITE_ADMIN_PIN`             |     ✅      | ⚠️ Exposed to the client — **not secret** (see §4)         |
| `SUPABASE_SERVICE_ROLE_KEY`  |     ✅      | **Secret.** Server only — never `VITE_`-prefixed            |
| `ADMIN_EMAIL`                |     ✅      | Server only — used to seed the admin account                |
| `ADMIN_PASSWORD`             |     ✅      | **Secret.** Server only                                     |
| `NODE_ENV`                   |     ✅      | `production` (already set by the Dockerfile)                |
| `HOST`                       |     ✅      | `0.0.0.0` (already set by the Dockerfile)                   |
| `PORT`                       |     ✅      | `3002` (already set by the Dockerfile)                      |

> **Note:** `VITE_*` values are *not* baked into the build anymore, so you do **not** need
> the Build Arguments section at all. A missing var no longer crashes the server on boot —
> it fails with a clear error only where that value is actually used.

---

## 2a. Supabase Auth — allow the production domain (required for login)

Auth redirects are built from `window.location.origin` at runtime, so the app adapts to
whatever host it runs on — but Supabase still has to allow that host. In the Supabase
dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://admin.questlaguna.org`
- **Redirect URLs**: add `https://admin.questlaguna.org/**` (covers `/auth/callback`,
  password recovery, etc.)

Without this, login / email-confirm / password-reset links fail with a redirect error.

While you are in the dashboard, also finish the production security hardening
(see the security work applied 2026-07-10):

- **Authentication → Providers → Email**: turn **off** "Allow new users to sign up"
  (members-only app).
- **Authentication → Policies**: enable **Leaked Password Protection**.

---

## 3. Health check

The Dockerfile defines a `HEALTHCHECK` that hits `/` (which redirects to `/auth/login`,
returning 200). In Dokploy you can additionally configure the service health-check path
to `/`.

---

## 4. Security note: `VITE_ADMIN_PIN` is public

Anything prefixed `VITE_` is compiled into the **public** client bundle, so the admin PIN
is visible to anyone who opens the browser dev tools. Treat the PIN gate as a convenience,
not a security boundary. Real protection comes from Supabase auth
(`ADMIN_EMAIL` / `ADMIN_PASSWORD` + row-level security), which stays server-side.

Also remove the hardcoded `'quest2026'` fallback in `src/lib/constants.ts` before going
live, so a missing value fails closed instead of defaulting to a known PIN.

---

## 5. Local parity (docker-compose)

`docker-compose.yml` reproduces the Dokploy setup locally. Populate `.env` (see
`.env.example`) and run:

```bash
docker compose up --build
# app available at http://localhost:3002
```

The compose file passes the three `VITE_*` values as **both** build args and runtime env,
mirroring the Dokploy configuration above.
