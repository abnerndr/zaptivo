# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS prune
RUN npm install -g turbo@2.5.4
COPY . .
RUN turbo prune @wacrm/api --docker

FROM base AS installer
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile=false
COPY --from=prune /app/out/full/ .
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
# shared + database (prisma generate + tsc) before Nest build
RUN pnpm --filter @wacrm/shared build \
  && pnpm --filter @wacrm/database build \
  && pnpm --filter @wacrm/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/api
EXPOSE 4000
# Migrate then start Nest
CMD ["sh", "-c", "pnpm --filter @wacrm/database db:migrate:deploy && node dist/main.js"]
