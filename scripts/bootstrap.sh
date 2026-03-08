#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() {
  printf '\n[%s] %s\n' "bootstrap" "$1"
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf '[bootstrap] missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

log "checking required tools"
need_cmd node
need_cmd pnpm
need_cmd go

log "installing root workspace tooling"
pnpm add -Dw turbo typescript @types/node

log "installing Studio Desktop dependencies"
pnpm --dir "$ROOT_DIR/apps/studio-desktop" add react react-dom \
  @afterimage/project-model@workspace:* \
  @afterimage/schema-validators@workspace:* \
  @afterimage/ffmpeg-compiler@workspace:* \
  @afterimage/media-analysis@workspace:* \
  @afterimage/preset-library@workspace:* \
  @afterimage/midi-engine@workspace:* \
  @afterimage/ui@workspace:*
pnpm --dir "$ROOT_DIR/apps/studio-desktop" add -D \
  electron vite @vitejs/plugin-react \
  @types/react @types/react-dom \
  concurrently wait-on

log "installing Live Desktop dependencies"
pnpm --dir "$ROOT_DIR/apps/live-desktop" add react react-dom \
  @afterimage/project-model@workspace:* \
  @afterimage/schema-validators@workspace:* \
  @afterimage/ffmpeg-compiler@workspace:* \
  @afterimage/preset-library@workspace:* \
  @afterimage/midi-engine@workspace:* \
  @afterimage/ui@workspace:*
pnpm --dir "$ROOT_DIR/apps/live-desktop" add -D \
  electron vite @vitejs/plugin-react \
  @types/react @types/react-dom \
  concurrently wait-on

log "installing shared package dependencies"
pnpm --dir "$ROOT_DIR/packages/ui" add react react-dom
pnpm --dir "$ROOT_DIR/packages/ui" add -D @types/react @types/react-dom
pnpm --dir "$ROOT_DIR/packages/schema-validators" add ajv

log "tidying Go module"
(
  cd "$ROOT_DIR/apps/live-appliance"
  go mod tidy
)

log "bootstrap complete"
cat <<'EOF'

Next steps:
  1. pnpm --dir apps/studio-desktop dev
  2. pnpm --dir apps/live-desktop dev
  3. cd apps/live-appliance && go run ./cmd/afterimage-appliance

Note:
  FFmpeg binary acquisition is intentionally left to per-machine setup.
  Put local binary-fetch logic under tools/ffmpeg/ when you wire that in.
EOF
