# Deploying Tierra to Dokploy

This app is a **TanStack Start** server (SSR + server functions) built with Vite/Nitro.
The build produces a self-contained Node server at `.output/server/index.mjs`, which the
container runs on port **3002**.

Dokploy builds the image from the `Dockerfile` and routes traffic to it through Traefik
(which also terminates TLS via Let's Encrypt). You do **not** need the `nginx/` config —
that is only for bare-metal hosting without Dokploy.

> **Runtime: Node 22 (required).** Node 24's bundled undici has a regression that crashes
> TanStack Start's SSR with `TypeError: Response body object should not be disturbed or
> locked`. Build and run on **Node 22 LTS** (the `Dockerfile` base image must be `node:22`).
> Locally this is pinned via `.npmrc` (`use-node-version=22.17.0`), `.nvmrc`, and
> `package.json` `engines`, so `pnpm dev` always uses Node 22.

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
| `APP_URL`                    |     ✅      | Base URL for invite/confirm links, e.g. `https://admin.questlaguna.org` (see §6) |
| `RESEND_API_KEY`             |  optional   | **Secret.** If set, invites are sent via Resend (branded email); else Supabase's built-in email (see §6) |
| `RESEND_FROM`                |  optional   | Verified sender, e.g. `Quest Laguna <noreply@questlaguna.org>` (Resend requires a verified domain) |
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

---

## 5a. Troubleshooting the Docker build

### `ERR_PNPM_MUSL` — "Node.js currently has prebuilt artifacts only for glibc"

```
> [build 2/2] RUN pnpm build:
Fetching Node.js 22.17.0 ...
 ERR_PNPM_MUSL  The current system uses the "MUSL" C standard library...
ERROR: process "/bin/sh -c pnpm build" did not complete successfully: exit code: 1
```

**Cause.** `.npmrc` pins `use-node-version=22.17.0`, which makes pnpm *download* its own
Node.js. Node ships **glibc-only** prebuilts, and our base image is `node:22-alpine`
(**musl**), so the download fails. Note the failure lands on `pnpm build`, not
`pnpm install`: the `deps` stage copies only `package.json` + `pnpm-lock.yaml`, so pnpm
never sees `.npmrc` there — the later `COPY . .` in the `build` stage pulls it in.

**Fix (already applied).** `.npmrc` is listed in `.dockerignore`, so it stays out of the
build context. The base image already provides Node 22, so pnpm must not fetch its own.
`.npmrc` still applies for local development.

**If you hit this again:** don't remove the Node pin — check that `.npmrc` is still in
`.dockerignore`. Alternatively switch the base image to a glibc variant (`node:22-slim`),
though that makes the image download a second Node needlessly.

Verify locally with the real Dockerfile before redeploying:

```bash
docker build -t tierra-app:verify .
```

---

## 6. Account management (roles, invites, finance PIN)

The admin **Accounts & Access** area (`/admin/users`, `/admin/roles`) lets admins invite
users by email, assign one of six roles (`admin | finance | satellite | registration |
discipleship | member`), and edit a per-role permission matrix. Access to the Finances area
is additionally protected by a **per-user PIN** (scrypt-hashed server-side).

**Schema:** applied to production 2026-07-16. Repo record + apply/rollback steps in
`supabase/2026-07-16_account_management*.sql` and `..._APPLY.md`. Tables added:
`role_permissions`, `user_invitations`, `user_finance_pins` (the last two are service-role
only — RLS enabled, no client policies).

**Required setup:**

1. **`APP_URL`** must be set to the deployed origin (e.g. `https://admin.questlaguna.org`)
   so invite/confirm links point back to the app.
2. **Supabase → Auth → Redirect URLs** must include that origin (`…/**`). Invite emails use
   an on-domain `/auth/confirm?token_hash=…` link (verified via `verifyOtp`), so the raw
   `*.supabase.co` URL is never exposed.
3. **Email delivery (optional):** set `RESEND_API_KEY` (+ `RESEND_FROM` on a Resend-verified
   domain) to send branded invites via Resend. Without it, Supabase's built-in email is used,
   and the UI always returns a shareable invite link as a fallback.

Invited users land on `/auth/confirm` → set a password (`/auth/reset-password`) → complete
their profile (`/auth/complete-profile`: name + satellite + ministry) → `/admin`.
