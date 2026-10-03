# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_APP_LOCALE=pt-BR
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_APP_LOCALE=$NEXT_PUBLIC_APP_LOCALE
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec next start -H 0.0.0.0 -p ${PORT:-3000}"]
