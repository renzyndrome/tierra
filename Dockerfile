FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build (VITE_* vars must be present at build time — Vite bakes them into the client bundle)
FROM deps AS build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ADMIN_PIN
COPY . .
RUN pnpm build

# Production
FROM node:22-alpine AS production
WORKDIR /app
COPY --from=build /app/.output .output
ENV NODE_ENV=production
ENV PORT=3002
EXPOSE 3002
CMD ["node", ".output/server/index.mjs"]
