FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
FROM deps AS build
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
