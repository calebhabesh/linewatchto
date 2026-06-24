FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_LINEWATCH_APP_VERSION
ARG NEXT_PUBLIC_LINEWATCH_BUILD_LABEL
ARG NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL
ARG NEXT_PUBLIC_LINEWATCH_SUPPORT_URL
ENV NEXT_PUBLIC_LINEWATCH_APP_VERSION=${NEXT_PUBLIC_LINEWATCH_APP_VERSION}
ENV NEXT_PUBLIC_LINEWATCH_BUILD_LABEL=${NEXT_PUBLIC_LINEWATCH_BUILD_LABEL}
ENV NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL=${NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL}
ENV NEXT_PUBLIC_LINEWATCH_SUPPORT_URL=${NEXT_PUBLIC_LINEWATCH_SUPPORT_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1002 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
