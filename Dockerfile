# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    BETTER_AUTH_SECRET=docker-build-only-secret-never-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    QSTASH_CURRENT_SIGNING_KEY=docker-build-placeholder-current \
    QSTASH_NEXT_SIGNING_KEY=docker-build-placeholder-next
RUN npm run build && \
    ./node_modules/.bin/esbuild scripts/migrate.mjs \
      --bundle \
      --platform=node \
      --format=cjs \
      --target=node20 \
      --external:pg-native \
      --outfile=.next/migrate.cjs

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/.next/migrate.cjs ./migrate.cjs

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["sh", "-c", "node migrate.cjs && exec node server.js"]
