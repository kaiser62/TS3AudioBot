#!/usr/bin/env bash
# Updates the yt-dlp docker image used by the ./youtube-dl wrapper.
# NOTE: does NOT touch ./youtube-dl -- that file is the wrapper script itself.
set -euo pipefail

IMAGE="jeeaaasustest/youtube-dl:latest"

before="$(docker image inspect -f "{{.Id}}" "$IMAGE" 2>/dev/null || echo none)"
docker pull "$IMAGE"
after="$(docker image inspect -f "{{.Id}}" "$IMAGE")"

if [ "$before" != "$after" ]; then
  echo "yt-dlp image updated: $before -> $after"
  docker image prune -f >/dev/null 2>&1 || true
else
  echo "yt-dlp image already latest: $after"
fi

echo "yt-dlp version: $(cd "$(dirname "$0")" && ./youtube-dl --version 2>&1 | tail -1)"
