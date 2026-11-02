# syntax=docker/dockerfile:1.7
#
# Community Edition images.
#
#   docker build --target api  -t secondplanet-api:local  .
#   docker build --target web  -t secondplanet-web:local  .
#
# Both images are built from this checkout with public base images only, so a
# community self-hoster can rebuild them without access to any private registry.

ARG NODE_IMAGE=node:22.18.0-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28.0-alpine

# --------------------------------------------------------------------------
# build: install the workspace and compile the API and the web application
# --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# The workspace manifests are copied first so the dependency layer is only
# rebuilt when a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma

# prisma generate first: the API type check needs the generated client.
RUN pnpm db:generate && pnpm build

# --------------------------------------------------------------------------
# api: the NestJS backend
# --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS api

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=8080
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app /app
COPY --chown=node:node deploy/api-entrypoint.sh /usr/local/bin/api-entrypoint
COPY --chown=node:node deploy/migration-entrypoint.sh /usr/local/bin/migration-entrypoint
RUN chmod 0555 /usr/local/bin/api-entrypoint /usr/local/bin/migration-entrypoint

USER node
EXPOSE 8080
ENTRYPOINT ["api-entrypoint"]

# --------------------------------------------------------------------------
# web: the static frontend served by nginx, which also proxies /api
# --------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS web

# Branding values are baked into the bundle at build time.
ARG VITE_API_BASE_URL=""
ARG VITE_PUBLIC_PLATFORM_NAME=""
ARG VITE_PUBLIC_CONTACT_EMAIL=""
ARG VITE_ICP=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PUBLIC_PLATFORM_NAME=$VITE_PUBLIC_PLATFORM_NAME
ENV VITE_PUBLIC_CONTACT_EMAIL=$VITE_PUBLIC_CONTACT_EMAIL
ENV VITE_ICP=$VITE_ICP

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
