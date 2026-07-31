# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS prune
RUN npm install -g turbo@2.5.4
COPY . .
RUN turbo prune @wacrm/web --docker

FROM base AS installer
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile=false
COPY --from=prune /app/out/full/ .
# Dummy DATABASE_URL for prisma generate at build time
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
# Workspace packages export dist/ — must build before Next resolves @wacrm/*
RUN pnpm --filter @wacrm/shared build \
  && pnpm --filter @wacrm/database build \
  && pnpm --filter @wacrm/web build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec next start -H 0.0.0.0 -p ${PORT:-3000}"]
