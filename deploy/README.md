# Deployment files

Server-side workarounds used with this fork. See the "Changes from upstream" section in the root README for the reasoning.

| File | Install to | Purpose |
|---|---|---|
| `youtube-dl` | bot dir, `[factories.youtube-dl] path = "./youtube-dl"` | yt-dlp in Docker, cookies, cache, `--socket-timeout 5`, `skip=hls` |
| `ffmpeg-wrap.sh` + `ytchunk.py` | bot dir, `[tools.ffmpeg] path = "./ffmpeg-wrap.sh"` | 512 KiB range-chunked googlevideo download (avoids 403) |
| `update-ytdlp.sh` | bot dir | pulls latest yt-dlp image |
| `systemd/ts3audiobot.service` | `~/.config/systemd/user/` | bot service (user unit) |
| `systemd/ts3audiobot-ytdlp.{service,timer}` | `/etc/systemd/system/` (root:root 0644) | 30-min yt-dlp update |

Paths default to `/opt/ts3audiobot`; adjust to your install. Optional env: `YTDL_DEBUG_LOG`, `FFMPEG_DEBUG_LOG`, `YTDL_CACHE_DIR`.

Requirements: Docker, python3, ffmpeg at `/usr/bin/ffmpeg`. Put `cookies.txt` (Netscape format) next to `youtube-dl` if needed — never commit it.
