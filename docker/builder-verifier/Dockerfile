# This image is built only from a trusted repository revision. The Builder
# proposal itself is mounted later at /workspace and never participates in the
# image build. This digest is deliberately reviewed with this Dockerfile; CI
# may not substitute a mutable tag or a repository variable.
ARG NODE_IMAGE=node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0
FROM ${NODE_IMAGE}

WORKDIR /opt/builder
COPY package.json package-lock.json ./

# The package manifest and lockfile are protected from Builder proposals, so
# dependency installation belongs to this trusted image-build boundary. Docker
# intentionally excludes .npmrc from build context, so mirror the committed
# lockfile's legacy-peer-deps setting explicitly rather than relying on a local
# npm configuration. Runtime verification has no network access and uses these
# preinstalled tools instead.
RUN npm ci --legacy-peer-deps \
  && npm cache clean --force

ENV PATH=/opt/builder/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
    NODE_PATH=/opt/builder/node_modules \
    NEXT_TELEMETRY_DISABLED=1
