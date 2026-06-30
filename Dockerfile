FROM node:18-alpine

# fontconfig: runtime font discovery (freetype is statically linked into the musl binary)
# python3/make/g++: only needed if skia-canvas postinstall falls back to building from source
RUN apk add --no-cache fontconfig python3 make g++

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# ── 1. Copy manifests only (better layer cache) ──────────────────────────────
COPY pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY package.json ./
COPY packages/server/package.json      packages/server/
COPY packages/core/package.json        packages/core/
COPY packages/html-to-syntax/package.json packages/html-to-syntax/
COPY packages/glyphs/package.json      packages/glyphs/

# ── 2. Install inside Alpine ──────────────────────────────────────────────────
# This is the critical step: running pnpm install ON Alpine causes skia-canvas
# to download linux-x64-musl.gz instead of the glibc binary. Never copy the
# host's node_modules into the image (see .dockerignore).
RUN pnpm install --frozen-lockfile

# ── 3. Copy source ────────────────────────────────────────────────────────────
COPY packages/server/src       packages/server/src
COPY packages/core/src         packages/core/src
COPY packages/html-to-syntax/src packages/html-to-syntax/src
# Glyph fonts are referenced at runtime via import.meta.dirname relative path
COPY packages/glyphs/fonts     packages/glyphs/fonts

EXPOSE 3001

# tsx is a devDep of @komnour/server; pnpm install creates the .bin symlink
CMD ["node_modules/.bin/tsx", "packages/server/src/index.ts"]
