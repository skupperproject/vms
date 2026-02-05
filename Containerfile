# syntax=docker/dockerfile:1.4

# Stage 1: Base image with package manager
FROM node:20-alpine AS base

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

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

# Deploy creates a standalone directory with all dependencies
RUN pnpm --filter "@skupperx/management-controller" deploy --legacy --prod /deployed/management-controller

# Production image is much simpler
FROM node:20-alpine AS management-controller-final

WORKDIR /app

# Copy the entire deployed package
COPY --from=management-controller-deploy /deployed/management-controller ./

RUN adduser -D management-controller
USER management-controller

EXPOSE 8085
CMD ["node", "index.js"]

FROM shared-builder AS site-controller-deploy

COPY components/site-controller/ ./components/site-controller/

# Deploy creates a standalone directory with all dependencies
RUN pnpm --filter "@skupperx/site-controller" deploy --legacy --prod /deployed/site-controller

# Production image is much simpler
FROM node:20-alpine AS site-controller-final

WORKDIR /app

# Copy the entire deployed package
COPY --from=site-controller-deploy /deployed/site-controller ./

RUN adduser -D site-controller
USER site-controller

EXPOSE 8085
CMD ["node", "index.js"]