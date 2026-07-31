# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
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
RUN pnpm --filter @wacrm/database db:generate
RUN pnpm --filter @wacrm/web build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=installer /app .
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
