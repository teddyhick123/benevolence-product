# This image is built only from a trusted repository revision. The Builder
# proposal itself is mounted later at /workspace and never participates in the
# image build. CI must supply NODE_IMAGE as a digest-pinned Node base image.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}

WORKDIR /opt/builder
COPY package.json package-lock.json ./

# The package manifest and lockfile are protected from Builder proposals, so
# dependency installation belongs to this trusted image-build boundary. Runtime
# verification has no network access and uses these preinstalled tools instead.
RUN npm ci \
  && npm cache clean --force

ENV PATH=/opt/builder/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
    NODE_PATH=/opt/builder/node_modules \
    NEXT_TELEMETRY_DISABLED=1
