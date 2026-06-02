# syntax=docker/dockerfile:1

# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
# Pin pnpm for reproducible builds (matches the committed pnpm-lock.yaml).
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
# IMPORTANT: these VITE_* values are baked into the CLIENT bundle at build time
# (Vite inlines import.meta.env.VITE_*). They are ALSO read at RUNTIME by server
# functions (see src/lib/supabase.ts). On Dokploy they must therefore be supplied
# BOTH here as Build Arguments AND as runtime Environment Variables — see DEPLOY.md.
FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_PIN
COPY . .
RUN pnpm build

# ── Production ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Copy only the self-contained Nitro server output and run as the built-in,
# unprivileged "node" user (defense in depth — the runtime only reads .output).
COPY --from=build --chown=node:node /app/.output ./.output

ENV NODE_ENV=production
# Bind to all interfaces so the reverse proxy (Dokploy/Traefik) can reach it.
ENV HOST=0.0.0.0
ENV PORT=3002

USER node
EXPOSE 3002

# Container health probe. alpine has no curl, so use Node's built-in fetch.
# GET / issues an SSR redirect to /auth/login (200), which fetch follows.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
