#!/usr/bin/env bash
set -euo pipefail

check() {
  if command -v "$1" >/dev/null 2>&1; then
    printf '[ok] %s -> %s\n' "$1" "$(command -v "$1")"
  else
    printf '[missing] %s\n' "$1"
  fi
}

check node
check pnpm
check go
check ffmpeg
