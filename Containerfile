# syntax=docker/dockerfile:1.4

# Stage 1: Base image with package manager
FROM registry.access.redhat.com/ubi10/ubi-minimal:latest AS base

RUN microdnf -y install nodejs && \
    microdnf clean all && \
    npm install -g corepack && \
    corepack enable && \
    corepack prepare pnpm@latest --activate

# Set working directory for the monorepo
WORKDIR /monorepo

# Stage 2: Install all dependencies
FROM base AS dependencies

# Copy workspace configuration first
# These files change less frequently than source code
COPY pnpm-workspace.yaml ./
COPY package.json pnpm-lock.yaml ./

# Copy all package.json files from modules and components
# We only need the manifests, not the source code
COPY modules/package.json ./modules/
COPY components/management-controller/package.json ./components/management-controller/
COPY components/site-controller/package.json ./components/site-controller/

# Install all dependencies with build cache
# --frozen-lockfile ensures reproducible builds
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Stage 3: Build shared packages
FROM dependencies AS shared-builder

# Copy source code for shared packages only
COPY modules/ ./modules/

FROM shared-builder AS management-controller-deploy

COPY components/management-controller/ ./components/management-controller/
COPY components/compose-web-app/ ./components/compose-web-app/

# Deploy creates a standalone directory with all dependencies
RUN pnpm --filter "@skupperx/management-controller" deploy --legacy --prod /deployed/management-controller

# Production image - management-controller
FROM registry.access.redhat.com/ubi10/ubi-minimal:latest AS skupperx-management-controller

RUN microdnf -y install nodejs shadow-utils && \
    microdnf clean all

WORKDIR /app

# Copy the entire deployed package
COPY --from=management-controller-deploy /deployed/management-controller ./
# Copy compose-web-app as sibling to /app (code expects ../compose-web-app)
COPY --from=management-controller-deploy /monorepo/components/compose-web-app /compose-web-app

RUN useradd --uid 10000 runner
USER 10000

EXPOSE 8085
CMD ["node", "index.js"]

FROM shared-builder AS site-controller-deploy

COPY components/site-controller/ ./components/site-controller/

# Deploy creates a standalone directory with all dependencies
RUN pnpm --filter "@skupperx/site-controller" deploy --legacy --prod /deployed/site-controller

# Production image - site-controller
FROM registry.access.redhat.com/ubi10/ubi-minimal:latest AS skupperx-site-controller

RUN microdnf -y install nodejs shadow-utils jq && \
    microdnf clean all

WORKDIR /app

# Copy the entire deployed package
COPY --from=site-controller-deploy /deployed/site-controller ./
# Copy scripts to /usr/local/bin so they can be run as commands
COPY --from=site-controller-deploy /monorepo/components/site-controller/scripts/skxstatus /usr/local/bin/skxstatus
COPY --from=site-controller-deploy /monorepo/components/site-controller/scripts/skxstart /usr/local/bin/skxstart
COPY --from=site-controller-deploy /monorepo/components/site-controller/scripts/skxhosts /usr/local/bin/skxhosts

# Make scripts executable
RUN chmod +x /usr/local/bin/skxstatus /usr/local/bin/skxstart /usr/local/bin/skxhosts

RUN useradd --uid 10000 runner
USER 10000

EXPOSE 8085
CMD ["node", "index.js"]