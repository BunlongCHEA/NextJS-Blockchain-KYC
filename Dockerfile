# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — deps
# Install production + dev dependencies in a clean layer.
# Using node:22-alpine for smallest footprint.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:25-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package manifests first for layer-cache efficiency
COPY package.json package-lock.json* ./

RUN npm ci --legacy-peer-deps

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
# Build the Next.js app with output: "standalone" (next.config.js must set this).
# Build-time env vars are injected here; runtime secrets come from k8s at start.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:25-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# # NEXT_PUBLIC_* are baked into the JS bundle at build time.
# # Non-public vars (NEXTAUTH_SECRET, etc.) are resolved at runtime — pass them
# # as build-arg only if you need them during `next build` (normally not needed).
# ARG NEXT_PUBLIC_API_URL=https://kycapi.bunlong.uk
# ARG NEXT_PUBLIC_PYTHON_API_URL=https://kyc-python-api.bunlong.uk
# ARG NEXTAUTH_URL=https://kyc.bunlong.uk

# ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# ENV NEXT_PUBLIC_PYTHON_API_URL=$NEXT_PUBLIC_PYTHON_API_URL
# ENV NEXTAUTH_URL=$NEXTAUTH_URL

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3 — runner
# Minimal production image — only the standalone output + public assets.
# next.config.js must include:  output: 'standalone'
# ─────────────────────────────────────────────────────────────────────────────
FROM node:25-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only what the standalone server needs
COPY --from=builder /app/public ./public

# next build --output=standalone puts server.js + node_modules inside .next/standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Bind to all interfaces so Kubernetes can reach it
ENV HOSTNAME=0.0.0.0

# Runtime env vars below are injected by k8s via Secret/ConfigMap.
# They are NOT baked into the image.
# NEXTAUTH_SECRET        — from secret
# NEXTAUTH_URL           — from configmap (or secret)
# NEXT_PUBLIC_API_URL    — baked at build, overridable at runtime for SSR usage
# DATABASE_URL           — not used by NextJS directly (Go handles DB)

CMD ["node", "server.js"]