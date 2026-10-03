#!/usr/bin/env bash
# ffmpeg shim for TS3AudioBot.
#
# YouTube returns 403 for open-ended or >=1MiB Range requests, which is exactly
# what ffmpeg issues when handed a googlevideo URL directly. When we detect such
# a URL we swap the input for a pipe and let ytchunk.py do bounded 512KiB range
# reads. Everything else is passed through to the real ffmpeg untouched.

REAL_FFMPEG="/usr/bin/ffmpeg"
HERE="$(cd "$(dirname "$0")" && pwd)"
# --- debug logging (added 2026-10-03): copy stderr to a log; bot still receives identical stderr ---
DBG_LOG="${FFMPEG_DEBUG_LOG:-/dev/null}"   # set e.g. FFMPEG_DEBUG_LOG=$HERE/logs/ffmpeg-debug.log to enable
echo "=== $(date '+%F %T.%3N') pid=$$ START args: $*" >> "$DBG_LOG"
exec 2> >(tee -a "$DBG_LOG" >&2; echo "=== $(date '+%F %T.%3N') pid=$$ END (stderr closed)" >> "$DBG_LOG")
# --- end debug logging ---

args=("$@")
url=""
url_idx=-1

for i in "${!args[@]}"; do
  if [ "${args[$i]}" = "-i" ]; then
    next=$((i + 1))
    if [ $next -lt ${#args[@]} ]; then
      url_idx=$next
      url="${args[$next]}"
    fi
  fi
done

case "$url" in
  *googlevideo.com*)
    args[$url_idx]="pipe:0"
    exec 3>&2
    python3 "$HERE/ytchunk.py" "$url" 2>&3 | "$REAL_FFMPEG" "${args[@]}"
    rc=("${PIPESTATUS[@]}")
    echo "=== $(date "+%F %T.%3N") pid=$$ pipeline exit ytchunk=${rc[0]} ffmpeg=${rc[1]}" >> "$DBG_LOG"
    exit ${rc[1]}
    ;;
esac

exec "$REAL_FFMPEG" "${args[@]}"
